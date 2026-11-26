// Small AI requests: 🎲 cause, and abilities for a typed-in form.
// Same path as the author's other extensions: a connection profile, or the current API.

import { ctx, settings } from './store.js';

export function getProfiles() {
    try { return ctx().extensionSettings?.connectionManager?.profiles || []; } catch { return []; }
}

async function requestLLM(messages, { maxTokens = 400, signal, profileId } = {}) {
    const c = ctx();
    const st = settings();
    signal?.throwIfAborted();
    const content = (res) => (typeof res === 'string' ? res : String(res?.content ?? ''));
    const effort = st.reasoning && st.reasoning !== 'default' ? { reasoning_effort: st.reasoning } : {};
    const profile = profileId ?? st.profileId;
    if (profile) {
        const svc = c.ConnectionManagerRequestService;
        if (!svc) throw new Error('NO_PROFILE_API');
        const res = await svc.sendRequest(profile, messages, maxTokens, {
            stream: false, signal, extractData: true, includePreset: !!st.sendPreset, includeInstruct: true,
        }, effort);
        return content(res);
    }
    const cc = c.ChatCompletionService;
    if (c.mainApi === 'openai' && cc?.presetToGeneratePayload && cc?.sendRequest) {
        const payload = await cc.presetToGeneratePayload({}, {}, {
            stream: false, messages, max_tokens: maxTokens,
            model: c.getChatCompletionModel?.(), chat_completion_source: c.chatCompletionSettings?.chat_completion_source, ...effort,
        });
        signal?.throwIfAborted();
        return content(await cc.sendRequest(payload, true, signal));
    }
    const tc = c.TextCompletionService;
    if (c.mainApi === 'textgenerationwebui' && tc?.presetToGeneratePayload && tc?.sendRequest && tc?.constructPrompt) {
        const instruct = c.powerUserSettings?.instruct;
        const prompt = instruct?.enabled ? tc.constructPrompt(messages, instruct) : messages.map(m => m.content).join('\n\n');
        const payload = await tc.presetToGeneratePayload({}, {}, { stream: false, prompt, max_tokens: maxTokens, max_new_tokens: maxTokens });
        signal?.throwIfAborted();
        return content(await tc.sendRequest(payload, true, signal));
    }
    // Older or other APIs: generateRaw can't be aborted, so cancel just drops the result.
    const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
    const prompt = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n');
    const result = await c.generateRaw({ systemPrompt, prompt, responseLength: maxTokens });
    signal?.throwIfAborted();
    return content(result);
}

/** Remove thinking, quotes and labels; keep the first real line(s). */
export function cleanAnswer(raw) {
    let s = String(raw || '');
    s = s.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/^[\s\S]*<\/(think|thinking|reasoning)>/i, ''); // an opening tag cut off at the start
    s = s.replace(/<(think|thinking|reasoning)>[\s\S]*$/i, '');   // thinking that never finished
    return s.trim();
}

function recentLines(n) {
    let chat = [];
    try { chat = ctx().chat || []; } catch { /* ignore */ }
    return chat.filter(m => m && !m.is_system).slice(-n)
        .map(m => `${m.name || (m.is_user ? 'User' : 'Character')}: ${String(m.mes || '').replace(/\s+/g, ' ').slice(0, 600)}`);
}

const LANG_NAME = { en: 'English', ko: 'Korean' };

/** One short cause for a spell, tied to the recent chat when possible. */
export async function askCause({ spellText, sourceText, motiveText, lang }, signal) {
    const st = settings();
    const recent = st.contextCount ? recentLines(st.contextCount) : [];
    const system = 'You invent the in-story cause of a magic effect for a roleplay. '
        + 'Reply with ONE sentence only (max 25 words), no quotes, no labels, no explanation. '
        + 'Prefer tying it to an object, place or moment that already appeared in the recent story. '
        + 'Write it as a plain fact of the story, past tense.';
    const user = [
        recent.length ? `Recent story:\n${recent.join('\n')}` : 'There is no story yet.',
        `Effect: ${spellText}`,
        sourceText ? `It comes from: ${sourceText}` : '',
        motiveText ? `Why: ${motiveText}` : '',
        `World: magic is ${st.world === 'common' ? 'common' : st.world === 'none' ? 'unknown to everyone' : 'rare'}.`,
        `Answer in ${LANG_NAME[lang] || 'English'}.`,
    ].filter(Boolean).join('\n\n');
    const raw = await requestLLM([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 300, signal });
    const text = cleanAnswer(raw).split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
    return { text: text.replace(/^["'“”]+|["'“”]+$/g, ''), raw: String(raw || '') };
}

/** Abilities for a form the user typed in. */
export async function askForm(name, lang, signal) {
    const system = 'A character in a roleplay is turned into the given form by magic, keeping their own mind. '
        + 'List what they CAN do and CANNOT do in that body. Reply in exactly two lines:\n'
        + 'CAN: <2-3 short items, comma separated>\nCANNOT: <2-3 short items, comma separated>';
    const user = `Form: ${name}\nAnswer in ${LANG_NAME[lang] || 'English'} (keep the CAN:/CANNOT: labels in English).`;
    const raw = await requestLLM([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens: 300, signal });
    const text = cleanAnswer(raw);
    const can = /CAN\s*:\s*(.+)/i.exec(text.replace(/CANNOT\s*:.*/i, ''))?.[1]?.trim() || '';
    const cannot = /CANNOT\s*:\s*(.+)/i.exec(text)?.[1]?.trim() || '';
    return { can, cannot, raw: String(raw || '') };
}

/**
 * AI judging: did these conditions happen in the newest part of the story, and does it claim
 * these effects ended? Returns { C1: { yes, reason }, E1: ... }.
 */
export async function askJudge({ conds, claims, lang, casts = [], spells = '', people = [] }, signal) {
    const st = settings();
    let chat = [];
    try { chat = (ctx().chat || []).filter(m => m && !m.is_system); } catch { /* ignore */ }
    const recent = chat.slice(-Math.max(2, st.judgeCount));
    // NEW = from my last message to the end (or just the last reply).
    let from = recent.length - 1;
    for (let i = recent.length - 1; i >= 0; i--) if (recent[i].is_user) { from = i; break; }
    const line = (m) => `${m.name || (m.is_user ? 'User' : 'Character')}: ${String(m.mes || '').replace(/\s+/g, ' ').slice(0, 1200)}`;
    const system = 'You are a careful referee for a magic tracker in a roleplay. '
        + 'Answer each numbered question about the NEW part of the story only; earlier lines are context. '
        + 'Say YES only when the NEW part clearly shows it happening, not when it is only hinted, planned or imagined. '
        + 'Reply with one line per question and nothing else, exactly "<id>: YES - <short reason>" or "<id>: NO".';
    const parts = [];
    if (from > 0) parts.push(`Earlier (context):\n${recent.slice(0, from).map(line).join('\n')}`);
    parts.push(`NEW:\n${recent.slice(from).map(line).join('\n')}`);
    if (conds.length) parts.push(`Conditions — did this happen in the NEW part?\n${conds.map((c, n) => `C${n + 1}: ${c}`).join('\n')}`);
    if (claims.length) parts.push(`Magic effects — does the NEW part say or show that this effect ended, broke, wore off or was removed?\n${claims.map((c, n) => `E${n + 1}: ${c}`).join('\n')}`);
    if (casts.length) {
        parts.push('Spells cast by characters — in the NEW part, does this character clearly use magic to cast one of these spells on someone (not only talk about it or plan it)?\n'
            + `Spells: ${spells}\nPeople: ${people.join(', ')}\n`
            + casts.map((c, n) => `S${n + 1}: ${c}`).join('\n')
            + '\nFor these, answer exactly "<id>: YES - <spell name> - <target\'s name> - <short reason>" or "<id>: NO". '
            + 'After Polymorph put the animal in brackets, e.g. "Polymorph (cat)"; after Glamour, what they now look like. Use the spell names above in English.');
    }
    parts.push(`Write each reason in ${LANG_NAME[lang] || 'English'}, at most 15 words. Keep "YES"/"NO" in English.`);
    const profileId = st.judgeProfile === 'same' ? st.profileId : st.judgeProfile;
    const raw = await requestLLM([{ role: 'system', content: system }, { role: 'user', content: parts.join('\n\n') }],
        { maxTokens: 400, signal, profileId });
    return parseJudge(cleanAnswer(raw));
}

export function parseJudge(text) {
    const out = {};
    for (const ln of String(text || '').split('\n')) {
        const m = /^[\s*\-#>]*\**\s*([CES]\d+)\s*\**\s*[:：.)]\s*\**\s*(YES|NO)\b\**\s*[-–—:,.]?\s*(.*)$/i.exec(ln);
        if (!m) continue;
        const id = m[1].toUpperCase();
        if (out[id]) continue;
        out[id] = { yes: m[2].toUpperCase() === 'YES', reason: m[3].trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 220) };
    }
    return out;
}
