// Small AI requests: 🎲 cause, and abilities for a typed-in form.
// Same path as the author's other extensions: a connection profile, or the current API.

import { ctx, settings } from './store.js';

export function getProfiles() {
    try { return ctx().extensionSettings?.connectionManager?.profiles || []; } catch { return []; }
}

async function requestLLM(messages, { maxTokens = 400, signal } = {}) {
    const c = ctx();
    const st = settings();
    signal?.throwIfAborted();
    const content = (res) => (typeof res === 'string' ? res : String(res?.content ?? ''));
    const effort = st.reasoning && st.reasoning !== 'default' ? { reasoning_effort: st.reasoning } : {};
    if (st.profileId) {
        const svc = c.ConnectionManagerRequestService;
        if (!svc) throw new Error('NO_PROFILE_API');
        const res = await svc.sendRequest(st.profileId, messages, maxTokens, {
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
