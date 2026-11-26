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
    // A number: the chat as it was before message `skipLast` (0.7.0, for "what did that reply carry").
    if (typeof skipLast === 'number') list = list.slice(0, Math.max(0, skipLast));
    else if (skipLast && list.length) list = list.slice(0, -1);
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
export function actionValid(view, a) {
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
        out.waited = turnsAfter(view, anchor).length; // replies since it was cast (for the omen)
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
    // A blocked spell (0.7.0) is gone while the block counts; taking the block back brings it back.
    const blocked = counteredIds(st, view);
    // A character's spell belongs to the reply it was noticed in: once that reply is gone, so is the spell.
    return st.effects.filter(e => (!e.strict || e.anchor?.key == null || view.index.has(e.anchor.key)) && !blocked.has(e.id))
        .map(e => evaluate(e, view, st.actions));
}

/** Effects a block (Counter) took off, while that block still counts. */
export function counteredIds(st, view) {
    const out = new Set();
    for (const a of st?.actions || []) if (a.type === 'counter' && a.effectId && actionValid(view, a)) out.add(a.effectId);
    return out;
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

/** A character's cast as an action, so ↶ can take it back (casts sharing `batch` go back together). */
export function castAction(effectIds, batch = null) {
    let last = null;
    for (const effectId of effectIds) {
        const a = { type: 'cast', effectId, at: lastRef() };
        if (batch) a.batch = batch;
        last = addAction(a);
    }
    return last;
}

/** A condition button. `what` = 'stack' | 'release' | 'trigger'. */
export function judge(effectId, what, via = '', { batch = null, auto = false } = {}) {
    const a = { type: 'judge', effectId, what, via, at: lastRef(), delivered: null };
    if (batch) a.batch = batch;
    if (auto) a.auto = true;
    return addAction(a);
}

/**
 * A block (Counter, 0.7.0). Either a spell that was only suggested (nothing is cast; `spell`
 * says what it was), or an effect already in (it is taken off while the block counts).
 * Bound to the reply it was made on, like a judgment; ↶ takes it back.
 */
export function counter({ effectId = null, avatar = '', name = '', spell = '', variant = '', target = null, kind = 'cast' }, rule = null) {
    const a = { type: 'counter', effectId, avatar, name, spell, variant, target, kind, at: lastRef(), delivered: null };
    if (rule) { a.ruled = true; a.cost = rule.cost; }
    return addAction(a);
}

/** Valid blocks of this chat (newest last). */
export function counters(view = chatView(false), st = chatState()) {
    return (st?.actions || []).filter(a => a.type === 'counter' && actionValid(view, a)).sort((a, b) => (a.t || 0) - (b.t || 0));
}

/**
 * A misfire or a critical hit on a spell I cast (0.7.0). `patch` changes the effect; what it
 * replaced is kept, so ↶ puts the spell back as it was meant. Mana stays spent.
 */
export function applyDrama(effectId, info, patch) {
    const st = chatState();
    const e = st?.effects.find(x => x.id === effectId);
    if (!e) return null;
    const orig = {};
    for (const k of Object.keys(patch)) orig[k] = e[k] === undefined ? null : structuredClone(e[k]);
    Object.assign(e, structuredClone(patch));
    e.drama = { ...info, orig };
    return addAction({ type: 'drama', effectId, at: lastRef() });
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
    // Things done together (a family Dispel, several auto judgments and casts) go back together.
    const gone = st.actions.filter(x => x.id === a.id || (a.batch && x.batch === a.batch));
    st.actions = st.actions.filter(x => !gone.includes(x));
    // A misfire / critical hit taken back: the spell becomes what was meant.
    for (const x of gone.filter(y => y.type === 'drama')) {
        const e = st.effects.find(y => y.id === x.effectId);
        if (e?.drama?.orig) { Object.assign(e, structuredClone(e.drama.orig)); delete e.drama; }
    }
    // Taking back a character's cast removes that spell (and anything done to it).
    const casts = new Set(gone.filter(x => x.type === 'cast').map(x => x.effectId));
    if (casts.size) {
        st.effects = st.effects.filter(e => !casts.has(e.id));
        st.actions = st.actions.filter(x => !casts.has(x.effectId));
    }
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
    return st.actions.filter(a => actionValid(view, a) && a.type !== 'drama')
        .sort((a, b) => b.t - a.t).slice(0, limit)
        .map(a => ({ a, e: st.effects.find(e => e.id === a.effectId) })).filter(x => x.e || x.a.type === 'counter');
}

/** Keep old, fully finished effects from piling up. */
function prune(st) {
    const view = chatView(false);
    // Character spells whose reply was re-rolled away: keep a few (swiping back brings them back).
    const gone = st.effects.filter(e => e.strict && e.anchor?.key != null && !view.index.has(e.anchor.key));
    if (gone.length > 8) {
        const out = new Set(gone.sort((a, b) => a.created - b.created).slice(0, gone.length - 8).map(e => e.id));
        st.effects = st.effects.filter(e => !out.has(e.id));
        st.actions = st.actions.filter(a => !out.has(a.effectId));
    }
    // Blocks of spells that were only suggested have no effect to go with: keep the newest few.
    const loose = st.actions.filter(a => a.type === 'counter' && !a.effectId);
    if (loose.length > 30) {
        const out = new Set(loose.sort((a, b) => a.t - b.t).slice(0, loose.length - 30).map(a => a.id));
        for (const a of st.actions) if (out.has(a.id) && a.ruled) (st.ledger ||= []).push({ spell: 'counter', t: a.t, at: a.at, cost: a.cost || 0 });
        st.actions = st.actions.filter(a => !out.has(a.id));
    }
    const done = st.effects.map(e => evaluate(e, view, st.actions)).filter(v => v.status === 'ended' && !v.needEnd);
    const extra = done.length - 12;
    if (extra <= 0) return;
    const drop = new Set(done.sort((a, b) => a.e.created - b.e.created).slice(0, extra).map(v => v.e.id));
    // Mana and cooldowns are worked out from what was cast, so dropped casts leave a small record.
    st.ledger ||= [];
    for (const e of st.effects) if (drop.has(e.id) && e.ruled) st.ledger.push({ spell: e.spell, t: e.created, at: e.anchor, cost: e.cost || 0 });
    for (const a of st.actions) if (drop.has(a.effectId) && a.type === 'dispel' && a.ruled) st.ledger.push({ spell: 'dispel', t: a.t, at: a.at, cost: a.cost || 0 });
    if (st.ledger.length > 60) st.ledger.splice(0, st.ledger.length - 60);
    // A character's "how often" count also survives the clean-up.
    st.casterLog ||= [];
    for (const e of st.effects) if (drop.has(e.id) && e.source?.kind === 'character') st.casterLog.push({ avatar: e.source.avatar, t: e.created, at: e.anchor });
    if (st.casterLog.length > 40) st.casterLog.splice(0, st.casterLog.length - 40);
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
        if (n.kind === 'counter') continue;
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
    // Blocks: "it bounced off" was told with this reply.
    for (const n of sent) {
        if (n.kind !== 'counter') continue;
        const a = st.actions.find(x => x.id === n.actionId);
        if (a) a.delivered = key;
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
    from.actions = from.actions.filter(a => (keep.has(a.effectId) || (a.type === 'counter' && !a.effectId)) && actionValid(view, a));
    from.undoId = null;
    const here = (x) => x?.at?.key == null || view.index.has(x.at.key);
    from.reloads = (from.reloads || []).filter(here);
    from.loadAdds = (from.loadAdds || []).filter(here);
    from.ledger = (from.ledger || []).filter(x => x?.at?.key == null || view.index.has(x.at.key));
    from.casterLog = (from.casterLog || []).filter(x => x?.at?.key == null || view.index.has(x.at.key));
    s.branchDone[id] = parent;
    if (from.effects.length || Object.keys(from.casters || {}).length) s.chats[id] = from;
    save();
    return true;
}

export function spellOf(e) { return SPELLS[e.spell] || SPELLS.polymorph; }

// ---------- secrets (2-C-1) ----------

/** How it ends is hidden from me (until I look, or it is found). */
export const secretRelease = (e) => !!e?.secretRelease && !e.revealed;
/** A spell cast in secret: what it is and who cast it are hidden from me too. */
export const veiled = (e) => !!e?.veiled && !e.revealed;

/** Clues for a secret ending: { given, next } (next = replies until the next clue), or null. */
export function clueInfo(v) {
    const n = Number(v?.e?.clueEvery) || 0;
    if (!v?.e?.secretRelease || n < 2 || v.status !== 'active') return null;
    return { given: Math.floor(v.used / n), next: n - (v.used % n) };
}

/** Does the reply about to be written carry a clue? */
export const clueDue = (v) => clueInfo(v)?.next === 1;

/** Does the reply about to be written carry the omen of a waiting spell? */
export function omenDue(v) {
    if (!v?.e?.omen || v.status !== 'pending') return false;
    if (v.e.trigger?.kind === 'turns') return v.pendingLeft === 1;
    return v.waited === 0; // a chance or a condition: right after it was cast
}

/** Blocks whose "it bounced off" note has not reached a reply yet. */
export function undeliveredCounters({ skipLast = false } = {}) {
    const view = chatView(skipLast);
    return counters(view).filter(a => !delivered(view, a.delivered));
}

/** The newest AI reply: { i, key } or null. */
export function lastAIReply(view = chatView(false)) {
    for (let i = view.length - 1; i >= 0; i--) if (isAI(view.list[i])) return { i, key: view.keys[i] };
    return null;
}

/**
 * "Something is felt" (0.7.0): what the newest AI reply carried that I may sense and block —
 * an omen of a waiting spell (not one I cast myself), or a secret cast that was noticed.
 * It lasts until the next AI reply. @returns [{ effectId, kind: 'omen'|'sneak', e }]
 */
export function senses(chatId = currentChatId()) {
    const st = chatState(chatId);
    if (!st?.effects.length) return [];
    const full = chatView(false);
    const r = lastAIReply(full);
    if (!r?.key) return [];
    const blocked = counteredIds(st, full);
    const out = [];
    const here = (e) => !e.strict || e.anchor?.key == null || full.index.has(e.anchor.key);
    for (const e of st.effects) {
        if (blocked.has(e.id) || e.senseDone === r.key || !here(e)) continue;
        if (e.veiled && e.sensed && e.anchor?.key === r.key) { out.push({ effectId: e.id, kind: 'sneak', e }); continue; }
        if (!e.omen || e.source?.kind === 'me') continue;
        const before = chatView(r.i); // the chat the reply was written for
        if (omenDue(evaluate(e, before, st.actions))) out.push({ effectId: e.id, kind: 'omen', e });
    }
    return out;
}

/** "Leave it": the feeling goes away for this reply. */
export function senseDone(effectId) {
    const e = chatState()?.effects.find(x => x.id === effectId);
    const r = lastAIReply();
    if (!e || !r) return;
    e.senseDone = r.key;
    save();
}

export function reveal(effectId) {
    const e = chatState()?.effects.find(x => x.id === effectId);
    if (!e) return;
    e.revealed = true;
    save();
}
