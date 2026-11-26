// Effect lifecycle. Nothing is counted step by step: every state (pending / active / ended,
// turns left, curse stage) is worked out again from the chat as it is now. So deleting or
// re-rolling (swiping) a message undoes what it caused, and a swipe never counts a turn twice.
//
// - A cast is anchored to the last message at the moment it was cast (lenient: found again by
//   its key when earlier messages are deleted).
// - A judgment (condition button) is bound to the last message when it was pressed (strict: if
//   that message is deleted, re-rolled or swiped away, the judgment no longer counts).
// - "Just happened" notes are marked delivered to the AI reply they went out with; if that
//   reply is deleted or re-rolled, they go out again.

import { ctx, settings, save, uid, chatState, currentChatId } from './store.js';
import { SPELLS, STAGE_MAX, MAX_EFFECTS } from './spells.js';

// ---------- messages ----------

function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

/** A message's identity: its send time (a swipe has its own), or a hash of its text. */
export function msgKey(m) {
    if (!m) return null;
    if (m.send_date) return `d:${m.send_date}`;
    return `h:${hash(String(m.mes || ''))}`;
}

const isAI = (m) => m && !m.is_user && !m.is_system;

/**
 * The chat as the engine sees it. With `skipLast`, the last message is left out
 * (it is being re-rolled or continued right now).
 */
export function chatView(skipLast = false) {
    let list = [];
    try { list = Array.isArray(ctx().chat) ? ctx().chat : []; } catch { list = []; }
    if (skipLast && list.length) list = list.slice(0, -1);
    const keys = list.map(msgKey);
    const index = new Map();
    keys.forEach((k, i) => { if (k && !index.has(k)) index.set(k, i); });
    let group = false;
    try { group = !!ctx().groupId; } catch { /* ignore */ }
    // Turns: one per AI reply. In a group chat, only the first reply after each of my messages.
    const turnAt = [];
    let lastWasUser = true;
    for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m?.is_system) continue;
        if (m?.is_user) { lastWasUser = true; continue; }
        if (!group || lastWasUser) turnAt.push(i);
        lastWasUser = false;
    }
    return { list, keys, index, turnAt, length: list.length };
}

function find(view, ref) {
    if (!ref) return -1;
    if (ref.key == null) return -1; // cast in an empty chat
    return view.index.has(ref.key) ? view.index.get(ref.key) : -2;
}

/** Turn messages after index `i` (exclusive). */
export function turnsAfter(view, i) { return view.turnAt.filter(x => x > i); }

/** Where a stored point sits in the chat now (lenient: found by key, else its old index, never past the end). */
export function posOf(view, ref) {
    const i = find(view, ref);
    if (i === -2) return Math.min(ref.i ?? -1, view.length - 1);
    return i;
}

function roll(effectId, key) { return (hash(`${effectId}|${key}`) % 10000) / 10000; }

/** A judgment counts while its message is still there, unchanged. */
function actionValid(view, a) {
    if (a.type === 'dispel') return true;
    if (!a.at || a.at.key == null) return true;
    return view.index.has(a.at.key);
}

function delivered(view, key) { return !!key && view.index.has(key); }

// ---------- working out an effect ----------

/**
 * @returns {{ e, status: 'pending'|'active'|'ended', activeFrom, left, used, stage,
 *   endReason, needCast, needEnd, stageNotes, pendingLeft, actions }}
 */
export function evaluate(e, view, actions) {
    const mine = actions.filter(a => a.effectId === e.id && actionValid(view, a));
    // Anchor: found again by key, otherwise the stored index (never past the end).
    let anchor = find(view, e.anchor);
    if (anchor === -2) anchor = Math.min(e.anchor.i ?? -1, view.length - 1);
    const out = { e, status: 'pending', activeFrom: null, left: null, used: 0, stage: 0,
        endReason: null, needCast: false, needEnd: false, stageNotes: [], pendingLeft: null, actions: mine };

    // 1. When does it start?
    const trig = e.method === 'stacked' ? { kind: 'now' } : (e.trigger || { kind: 'now' });
    if (trig.kind === 'now') out.activeFrom = anchor;
    else if (trig.kind === 'turns') {
        const after = turnsAfter(view, anchor);
        const n = Math.max(1, trig.turns | 0);
        if (after.length >= n) out.activeFrom = after[n - 1];
        else out.pendingLeft = n - after.length;
    } else if (trig.kind === 'chance') {
        const p = Math.min(1, Math.max(0.01, (Number(trig.chance) || 25) / 100));
        const hit = turnsAfter(view, anchor).find(i => roll(e.id, view.keys[i]) < p);
        if (hit !== undefined) out.activeFrom = hit;
    } else if (trig.kind === 'condition') {
        const a = mine.find(x => x.type === 'judge' && x.what === 'trigger');
        if (a) out.activeFrom = Math.max(anchor, a.at?.key == null ? -1 : view.index.get(a.at.key));
    }

    const dispelled = mine.find(a => a.type === 'dispel');
    if (out.activeFrom === null) {
        // Still waiting. A dispel removes it anyway.
        if (dispelled) { out.status = 'ended'; out.endReason = 'dispel'; out.silentEnd = true; }
        return out;
    }

    out.status = 'active';
    // 2. Curse stage (stacked): one stage per valid press, up to the last one.
    if (e.method === 'stacked') {
        const presses = mine.filter(a => a.type === 'judge' && a.what === 'stack')
            .sort((a, b) => (a.t || 0) - (b.t || 0));
        out.stage = Math.min(STAGE_MAX, presses.length);
        out.stageNotes = presses.slice(0, STAGE_MAX).map((a, i) => ({ action: a, stage: i + 1 }))
            .filter(n => !delivered(view, n.action.delivered));
    }

    // 3. Turns used since it started.
    const turns = turnsAfter(view, out.activeFrom);
    out.used = turns.length;
    if (e.duration > 0) out.left = Math.max(0, e.duration - out.used);

    // 4. Has it ended?
    const released = mine.find(a => a.type === 'judge' && a.what === 'release');
    if (dispelled) out.endReason = 'dispel';
    else if (released) out.endReason = 'release';
    else if (e.duration > 0 && out.used >= e.duration) out.endReason = 'time';
    if (out.endReason) {
        out.status = 'ended';
        // Nothing to announce if the AI never heard it started.
        out.needEnd = delivered(view, e.deliveries?.cast) && !delivered(view, e.deliveries?.end);
        if (out.endReason === 'dispel' && !delivered(view, e.deliveries?.cast)) out.silentEnd = true;
        out.stageNotes = [];
        return out;
    }
    out.needCast = !delivered(view, e.deliveries?.cast);
    return out;
}

/** All effects of the current chat, worked out. */
export function views({ skipLast = false, chatId = currentChatId() } = {}) {
    const st = chatState(chatId);
    if (!st) return [];
    const view = chatView(skipLast);
    return st.effects.map(e => evaluate(e, view, st.actions));
}

/** Effects shown on screen: not ended, or ended but the AI still has to hear about it. */
export function shown(list) {
    return list.filter(v => v.status !== 'ended' || v.needEnd);
}

export function liveCount(list = views()) { return list.filter(v => v.status !== 'ended').length; }
export function slotsLeft(list = views()) { return Math.max(0, MAX_EFFECTS - liveCount(list)); }

// ---------- changing things ----------

export function lastRef() {
    const view = chatView(false);
    const i = view.length - 1;
    return { i, key: i >= 0 ? view.keys[i] : null };
}

/**
 * Cast one effect per target. `spec` = everything from the cast window except `targets`.
 * @returns {string[]} new effect ids
 */
export function cast(spec, targets, rule = null) {
    const st = chatState(currentChatId(), true);
    if (!st) return [];
    const group = targets.length > 1 ? uid('g') : null;
    const ids = [];
    for (const [n, target] of targets.entries()) {
        const e = structuredClone(spec);
        // Magic rules: one cast costs once (on the first person), and starts the spell's cooldown.
        if (rule) { e.ruled = true; e.cost = n === 0 ? rule.cost : 0; }
        e.id = uid('e');
        e.target = target;
        e.group = group;
        e.anchor = lastRef();
        e.created = Date.now();
        e.deliveries = { cast: null, end: null };
        st.effects.push(e);
        ids.push(e.id);
    }
    prune(st);
    save();
    return ids;
}

function addAction(a) {
    const st = chatState(currentChatId(), true);
    if (!st) return null;
    a.id = uid('a');
    a.t = Date.now();
    st.actions.push(a);
    st.undoId = a.id;
    save();
    return a;
}

/** A condition button. `what` = 'stack' | 'release' | 'trigger'. */
export function judge(effectId, what, via = '', { batch = null, auto = false } = {}) {
    const a = { type: 'judge', effectId, what, via, at: lastRef(), delivered: null };
    if (batch) a.batch = batch;
    if (auto) a.auto = true;
    return addAction(a);
}

export function dispel(effectIds, by = '', rule = null) {
    const st = chatState(currentChatId(), true);
    if (!st) return null;
    const now = Date.now();
    const done = [];
    for (const [n, effectId] of effectIds.entries()) {
        const a = { id: uid('a'), t: now, type: 'dispel', effectId, by, at: lastRef(), batch: effectIds.length > 1 ? now : null };
        if (rule) { a.ruled = true; a.cost = n === 0 ? rule.cost : 0; }
        st.actions.push(a);
        done.push(a);
    }
    if (done.length) st.undoId = done[done.length - 1].id;
    save();
    return done;
}

/** The action that "Undo" would take back (still counting), or null. */
export function undoable() {
    const st = chatState();
    if (!st?.undoId) return null;
    const a = st.actions.find(x => x.id === st.undoId);
    if (!a) return null;
    const view = chatView(false);
    return actionValid(view, a) ? a : null;
}

export function undo() {
    const st = chatState();
    const a = undoable();
    if (!st || !a) return null;
    // Things done together (a family Dispel, several auto judgments) go back together.
    st.actions = st.actions.filter(x => x.id !== a.id && !(a.batch && x.batch === a.batch && x.type === a.type));
    st.undoId = null;
    save();
    return a;
}

/** Remove an effect as if it never happened (the AI is told nothing). */
export function removeEffect(effectId) {
    const st = chatState();
    if (!st) return;
    st.effects = st.effects.filter(e => e.id !== effectId);
    st.actions = st.actions.filter(a => a.effectId !== effectId);
    if (st.undoId && !st.actions.some(a => a.id === st.undoId)) st.undoId = null;
    save();
}

/** Recent judgment history for the status window (newest first). */
export function history(limit = 6) {
    const st = chatState();
    if (!st) return [];
    const view = chatView(false);
    return st.actions.filter(a => actionValid(view, a))
        .sort((a, b) => b.t - a.t).slice(0, limit)
        .map(a => ({ a, e: st.effects.find(e => e.id === a.effectId) })).filter(x => x.e);
}

/** Keep old, fully finished effects from piling up. */
function prune(st) {
    const view = chatView(false);
    const done = st.effects.map(e => evaluate(e, view, st.actions)).filter(v => v.status === 'ended' && !v.needEnd);
    const extra = done.length - 12;
    if (extra <= 0) return;
    const drop = new Set(done.sort((a, b) => a.e.created - b.e.created).slice(0, extra).map(v => v.e.id));
    // Mana and cooldowns are worked out from what was cast, so dropped casts leave a small record.
    st.ledger ||= [];
    for (const e of st.effects) if (drop.has(e.id) && e.ruled) st.ledger.push({ spell: e.spell, t: e.created, at: e.anchor, cost: e.cost || 0 });
    for (const a of st.actions) if (drop.has(a.effectId) && a.type === 'dispel' && a.ruled) st.ledger.push({ spell: 'dispel', t: a.t, at: a.at, cost: a.cost || 0 });
    if (st.ledger.length > 60) st.ledger.splice(0, st.ledger.length - 60);
    st.effects = st.effects.filter(e => !drop.has(e.id));
    st.actions = st.actions.filter(a => !drop.has(a.effectId));
}

// ---------- AI deliveries ----------

let sent = []; // notes that went out with the generation now running: [{ kind, effectId, actionId }]

export function setSent(list) { sent = list; }

/** An AI reply arrived: the notes that went out with it are now delivered to it. */
export function markDelivered(mesId) {
    if (!sent.length) return false;
    const st = chatState();
    let m = null;
    try { m = ctx().chat?.[Number(mesId)]; } catch { /* ignore */ }
    const key = msgKey(m);
    if (!st || !key || !isAI(m)) { sent = []; return false; }
    for (const n of sent) {
        const e = st.effects.find(x => x.id === n.effectId);
        if (!e) continue;
        e.deliveries ||= { cast: null, end: null };
        if (n.kind === 'cast') e.deliveries.cast = key;
        else if (n.kind === 'end') e.deliveries.end = key;
        else if (n.kind === 'stage') {
            const a = st.actions.find(x => x.id === n.actionId);
            if (a) a.delivered = key;
        }
    }
    sent = [];
    save();
    return true;
}

// ---------- branches ----------

/** A new branch chat starts with its parent's effects (those cast before the branch point). */
export function copyFromParent() {
    const s = settings();
    const id = currentChatId();
    if (!id || s.chats[id] || s.branchDone[id]) return false;
    let parent = '';
    try { parent = String(ctx().chatMetadata?.main_chat || ''); } catch { /* ignore */ }
    if (!parent || !s.chats[parent]) return false;
    const view = chatView(false);
    const from = structuredClone(s.chats[parent]);
    from.effects = from.effects.filter(e => e.anchor?.key == null || view.index.has(e.anchor.key));
    const keep = new Set(from.effects.map(e => e.id));
    from.actions = from.actions.filter(a => keep.has(a.effectId) && actionValid(view, a));
    from.undoId = null;
    const here = (x) => x?.at?.key == null || view.index.has(x.at.key);
    from.reloads = (from.reloads || []).filter(here);
    from.loadAdds = (from.loadAdds || []).filter(here);
    from.ledger = (from.ledger || []).filter(x => x?.at?.key == null || view.index.has(x.at.key));
    s.branchDone[id] = parent;
    if (from.effects.length) s.chats[id] = from;
    save();
    return true;
}

export function spellOf(e) { return SPELLS[e.spell] || SPELLS.polymorph; }
