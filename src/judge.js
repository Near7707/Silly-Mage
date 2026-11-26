// AI judging (stage 2-B-1). After each AI reply, one small side request asks whether a
// condition happened in the newest part of the story, and whether the story claims a spell
// ended some other way. Nothing is asked when there is nothing to judge.
//
// Like the condition buttons, a result belongs to the AI reply it was made for: once that
// reply is re-rolled or deleted, its suggestions are gone (and an applied judgment no longer
// counts, because judge() binds it to that reply).

import { t, lang } from './i18n.js';
import { settings, save, chatState, currentChatId, uid } from './store.js';
import { SIMPLE, STAGE_MAX } from './spells.js';
import { views, chatView, judge } from './engine.js';
import { targetName, nameEn, formText, stateText } from './describe.js';
import { askJudge } from './ai.js';

const KEEP_CHECKS = 8;

let busy = null;       // { chatId, key, ctl }
const tried = new Set(); // chatId|key asked this session (a failed ask is not retried on every refresh)
let failToast = false;
let onChange = () => {};
export function setJudgeHook(fn) { onChange = fn; }

const toast = (kind, msg) => { try { globalThis.toastr?.[kind]?.(msg, 'Mage'); } catch { /* ignore */ } };

/** The condition buttons of an effect: [{ what, via, label (screen), en (for the AI) }]. */
export function conditionsOf(v) {
    if (!v || v.status === 'ended') return [];
    const e = v.e;
    const who = targetName(e.target);
    const out = [];
    if (v.status === 'pending' && e.trigger?.kind === 'condition' && e.method !== 'stacked') {
        const text = e.trigger.text || '';
        out.push({ what: 'trigger', label: text || t('cond'), en: `"${text || 'the condition'}" happens (it involves ${who})` });
    }
    if (v.status === 'active') {
        if (e.method === 'stacked' && v.stage < STAGE_MAX) {
            const text = e.trigger?.text || '';
            out.push({ what: 'stack', label: text || t('cond'), en: `"${text || 'the condition'}" happens to ${who}` });
        }
        const br = SIMPLE[e.spell]?.breaker;
        if (br) out.push({ what: 'release', via: 'breaker', label: br.label[lang()] || br.label.en, en: `${who}: ${br.rule.en.replace(/^Ends( at once)? if /i, '').replace(/\.$/, '')}` });
        if (e.release?.kind === 'truth') {
            out.push({ what: 'release', label: t('btn_truth'), en: e.release.text ? `${who} tells the truth about ${e.release.text}` : `${who} tells the truth (admits something they hid or lied about)` });
        }
        if (e.release?.kind === 'action') out.push({ what: 'release', label: e.release.text || t('rel_action'), en: String(e.release.text || 'the set act is done') });
    }
    return out;
}

function effectEn(v) {
    const e = v.e;
    const who = targetName(e.target);
    if (e.method === 'stacked') return `${who} — curse turning them into a ${formText(e, 'en').name}`;
    const look = stateText(e, v, 'en').look;
    return `${who} — ${nameEn(e)}${look ? `: ${look}` : ''}`;
}

/** The last AI reply in the chat: { i, key } or null. */
function lastReply(view = chatView(false)) {
    for (let i = view.length - 1; i >= 0; i--) {
        const m = view.list[i];
        if (m && !m.is_user && !m.is_system) return { i, key: view.keys[i] };
    }
    return null;
}

/** What could be asked about now. */
function candidates(list, s = settings()) {
    const conds = [];
    const claims = [];
    if (s.judgeMode !== 'off') {
        for (const v of list) for (const c of conditionsOf(v)) conds.push({ effectId: v.e.id, what: c.what, via: c.via || '', en: c.en });
    }
    if (s.judgeUnbind) {
        for (const v of list) if (v.status === 'active') claims.push({ effectId: v.e.id, en: effectEn(v) });
    }
    return { conds, claims };
}

export function isChecking(chatId = currentChatId()) { return !!busy && busy.chatId === chatId; }

/** Called after an AI reply is finished. Asks once per reply, only when there is something to judge. */
export async function maybeCheck() {
    const s = settings();
    if (!s.enabled || busy) return;
    const chatId = currentChatId();
    if (!chatId) return;
    const view = chatView(false);
    const last = lastReply(view);
    if (!last?.key || last.i !== view.length - 1) return;
    const tag = `${chatId}|${last.key}`;
    if (tried.has(tag) || chatState(chatId)?.checks?.some(c => c.key === last.key)) return;
    const list = views();
    const { conds, claims } = candidates(list, s);
    if (!conds.length && !claims.length) return;
    tried.add(tag);
    busy = { chatId, key: last.key, ctl: new AbortController() };
    onChange();
    let answers = null;
    try {
        answers = await askJudge({
            conds: conds.map(c => c.en), claims: claims.map(c => c.en), lang: lang(),
        }, busy.ctl.signal);
    } catch (err) {
        if (err?.name !== 'AbortError') {
            console.warn('[Mage] judge', err);
            if (!failToast) { failToast = true; toast('warning', t('judge_fail')); }
        }
    } finally {
        busy = null;
    }
    if (answers) store(chatId, last.key, conds, claims, answers);
    onChange();
}

export function cancelCheck() { busy?.ctl.abort(); }

function store(chatId, key, conds, claims, answers) {
    const s = settings();
    const st = chatState(chatId, true);
    if (!st) return;
    const items = [];
    const released = new Set();
    conds.forEach((c, n) => {
        const a = answers[`C${n + 1}`];
        if (!a?.yes) return;
        items.push({ id: uid('j'), kind: 'cond', effectId: c.effectId, what: c.what, via: c.via, reason: a.reason, state: 'open' });
        if (c.what === 'release') released.add(c.effectId);
    });
    claims.forEach((c, n) => {
        const a = answers[`E${n + 1}`];
        // A claim that is really the set way of ending is already a condition above.
        if (!a?.yes || released.has(c.effectId)) return;
        items.push({ id: uid('j'), kind: 'claim', effectId: c.effectId, reason: a.reason, state: 'open' });
    });
    st.checks.push({ key, t: Date.now(), items });
    if (st.checks.length > KEEP_CHECKS) st.checks.splice(0, st.checks.length - KEEP_CHECKS);
    // Auto mode: conditions are judged right away (one Undo takes them all back). Claims always ask.
    if (s.judgeMode === 'auto' && currentChatId() === chatId && lastReply()?.key === key) {
        const batch = uid('b');
        const done = [];
        for (const it of items) {
            if (it.kind !== 'cond' || !valid(it)) continue;
            judge(it.effectId, it.what, it.via, { batch, auto: true });
            it.state = 'done';
            done.push(it);
        }
        if (done.length) toast('info', done.length === 1 ? t('judge_auto_one', { what: labelOf(done[0]) }) : t('judge_auto_n', { n: done.length }));
    }
    save();
}

function labelOf(it) {
    const v = views().find(x => x.e.id === it.effectId);
    const c = conditionsOf(v).find(x => x.what === it.what && (x.via || '') === (it.via || ''));
    return `${v ? targetName(v.e.target) : '?'} · ${c?.label || t('cond')}`;
}

/** Is a stored suggestion still something that can be done? */
function valid(it, list = views()) {
    const v = list.find(x => x.e.id === it.effectId);
    if (!v) return false;
    if (it.kind === 'claim') return v.status === 'active';
    return conditionsOf(v).some(c => c.what === it.what && (c.via || '') === (it.via || ''));
}

/** Open suggestions for the newest AI reply of this chat: [{ ...item, v, label }]. */
export function suggestions(list = views()) {
    const s = settings();
    const st = chatState();
    if (!s.enabled || !st?.checks?.length) return [];
    const last = lastReply();
    const check = last && st.checks.find(c => c.key === last.key);
    if (!check) return [];
    return check.items.filter(it => it.state === 'open' && valid(it, list)
        && (it.kind === 'cond' ? s.judgeMode !== 'off' : s.judgeUnbind))
        .map(it => {
            const v = list.find(x => x.e.id === it.effectId);
            const c = it.kind === 'cond' ? conditionsOf(v).find(x => x.what === it.what && (x.via || '') === (it.via || '')) : null;
            return { ...it, v, label: c?.label || '' };
        });
}

/** Mark a suggestion handled (applied or waved off). */
export function closeSuggestion(id) {
    const st = chatState();
    for (const c of st?.checks || []) {
        const it = c.items.find(x => x.id === id);
        if (it) { it.state = 'done'; save(); return it; }
    }
    return null;
}
