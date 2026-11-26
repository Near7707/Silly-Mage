// Character casters (stage 2-B-2). Characters of a chat can have spells of their own.
//
// - Settings are per chat (each member of a group chat has its own): which spells, how often
//   (at most once every N turns), how long their spells last, and the optional dice.
// - A. In the story: the AI judging check notices "Mira cast Sleep on Juno" and suggests it
//   (or casts it in auto mode). B. The dice: when it hits, the AI writing the reply is told
//   "this turn, Mira casts …"; the check afterwards confirms it really happened.
// - A spell a character cast follows the rules of magic I did not cast: no Dispel, no mana,
//   no loadout. It ends when its turns run out, or when the character undoes it.
// - Like everything else, it belongs to the reply it was noticed in: re-roll or delete that
//   reply and the spell is gone (and the "how often" count winds back with it).

import { ctx, settings, save, chatState, currentChatId } from './store.js';
import { SPELLS, SPELL_ORDER, SIMPLE, FORMS, MAX_EFFECTS } from './spells.js';
import { chatView, posOf, turnsAfter, cast, castAction, views, liveCount, lastRef, actionValid } from './engine.js';
import { targetName, nameEn } from './describe.js';

export const CASTER_SPELLS = SPELL_ORDER.filter(id => id !== 'dispel');
export const CASTER_DURATIONS = [3, 5, 10];
const DEFAULT = Object.freeze({ spells: [], every: 10, duration: 5, dice: false, chance: 15, sneak: false, notice: 30 });
export const DELAY_TURNS = 3; // a delayed spell whose time the check could not read

function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

/** The characters of the current chat: [{ kind: 'char', avatar, name }]. */
export function chatMembers() {
    const out = [];
    try {
        const c = ctx();
        if (c.groupId) {
            const g = (c.groups || []).find(x => x.id === c.groupId);
            for (const av of g?.members || []) {
                const ch = (c.characters || []).find(x => x.avatar === av);
                if (ch) out.push({ kind: 'char', avatar: ch.avatar, name: String(ch.name || '?') });
            }
        } else if (c.characterId !== undefined) {
            const ch = c.characters?.[c.characterId];
            if (ch) out.push({ kind: 'char', avatar: ch.avatar, name: String(ch.name || '?') });
        }
    } catch { /* ignore */ }
    return out;
}

function clean(raw) {
    const c = { ...DEFAULT, ...(raw && typeof raw === 'object' ? raw : {}) };
    c.spells = Array.isArray(c.spells) ? CASTER_SPELLS.filter(id => c.spells.includes(id)) : [];
    c.every = Math.min(50, Math.max(1, Math.round(Number(c.every) || DEFAULT.every)));
    c.duration = CASTER_DURATIONS.includes(Number(c.duration)) ? Number(c.duration) : DEFAULT.duration;
    c.dice = !!c.dice;
    c.sneak = !!c.sneak; // only with the dice: a hit may be cast in secret (2-C-1)
    c.chance = Math.min(100, Math.max(1, Math.round(Number(c.chance) || DEFAULT.chance)));
    // How likely I sense a secret cast (0.7.0): 0 = never.
    const n = Math.round(Number(c.notice));
    c.notice = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT.notice;
    return c;
}

/** One character's settings in a chat (defaults when nothing is set yet). */
export function casterConf(avatar, chatId = currentChatId()) {
    return clean(chatState(chatId)?.casters?.[avatar]);
}

export function setCaster(avatar, patch) {
    const st = chatState(currentChatId(), true);
    if (!st || !avatar) return;
    st.casters ||= {};
    st.casters[avatar] = clean({ ...casterConf(avatar), ...patch });
    save();
}

export function clearCaster(avatar) {
    const st = chatState();
    if (!st?.casters?.[avatar]) return;
    delete st.casters[avatar];
    save();
}

/** Members of this chat that have at least one spell. */
export function activeCasters() {
    return chatMembers().map(m => ({ ...m, conf: casterConf(m.avatar) })).filter(m => m.conf.spells.length);
}

/** Is an effect still in the chat? (A character's spell belongs to the reply it was noticed in.) */
export function present(e, view) {
    return !e.strict || e.anchor?.key == null || view.index.has(e.anchor.key);
}

/** Turns a character still has to wait before casting again (0 = ready), counted up to index `upto`. */
export function waitTurns(avatar, view = chatView(false), upto = view.length - 1, chatId = currentChatId()) {
    const st = chatState(chatId);
    const conf = casterConf(avatar, chatId);
    let last = null;
    const take = (pos) => { if (pos <= upto && (last === null || pos > last)) last = pos; };
    for (const e of st?.effects || []) {
        if (e.source?.kind !== 'character' || e.source.avatar !== avatar || !present(e, view)) continue;
        take(posOf(view, e.anchor));
    }
    for (const x of st?.casterLog || []) if (x.avatar === avatar && (x.at?.key == null || view.index.has(x.at.key))) take(posOf(view, x.at));
    // A blocked try still counts: the character did cast (0.7.0).
    for (const a of st?.actions || []) if (a.type === 'counter' && !a.effectId && a.avatar === avatar && actionValid(view, a)) take(posOf(view, a.at));
    if (last === null) return 0;
    const since = turnsAfter(view, last).filter(i => i <= upto).length;
    return Math.max(0, conf.every - since);
}

// ---------- what a spell does, in short English (for the check and the dice) ----------

export function briefEn(spell, variant = '') {
    if (spell === 'polymorph') return 'turns someone into an animal';
    if (spell === 'titan') return 'makes someone grow to twice their height';
    if (spell === 'mite') return 'shrinks someone to palm size';
    if (spell === 'glamour') return 'changes only how someone looks';
    const def = SIMPLE[spell];
    if (!def) return '';
    return String((variant === 'bad' && def.effectBad ? def.effectBad : def.effect).en);
}

const NAME_TO_SPELL = {
    polymorph: ['polymorph', ''], titan: ['titan', ''], mite: ['mite', ''], levitate: ['levitate', ''], truth: ['truth', ''],
    reverse: ['reverse', ''], charm: ['charm', ''], fear: ['fear', ''], sleep: ['sleep', ''], glamour: ['glamour', ''],
    invisibility: ['invisibility', ''], luck: ['luck', 'good'], jinx: ['luck', 'bad'],
};

/** "Polymorph (cat)" → { spell, variant, detail } or null. */
export function readSpell(text) {
    const m = /^\s*\**\s*([A-Za-z]+)\s*\**\s*(?:[([]\s*([^)\]]*?)\s*[)\]])?/.exec(String(text || ''));
    if (!m) return null;
    const hit = NAME_TO_SPELL[m[1].toLowerCase()];
    if (!hit) return null;
    return { spell: hit[0], variant: hit[1], detail: String(m[2] || '').trim() };
}

/** The spell list as the check and the dice describe it. */
export function spellListEn() {
    return CASTER_SPELLS.flatMap(id => (id === 'luck'
        ? [`Luck (${briefEn('luck', 'good')})`, `Jinx (${briefEn('luck', 'bad')})`]
        : [`${nameEn({ spell: id })} (${briefEn(id)})`])).join('; ');
}

// ---------- targets ----------

const tKey = (tg) => (tg.kind === 'user' ? 'user' : `char:${tg.avatar}`);

/** A name the AI wrote → a target in this chat, or the user when unsure. */
export function targetFromName(name) {
    const n = String(name || '').trim().toLowerCase().replace(/^the\s+/, '');
    const me = targetName({ kind: 'user' }).toLowerCase();
    if (!n || n === me || /^(you|user|\{\{user\}\}|me|myself)$/.test(n)) return { kind: 'user' };
    const m = chatMembers().find(x => x.name.toLowerCase() === n || x.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
    if (m) return { kind: 'char', avatar: m.avatar, name: m.name };
    if (me && (me.includes(n) || n.includes(me))) return { kind: 'user' };
    return { kind: 'user' };
}

/** Why this cast cannot happen now: 'full' | 'clash' | null. */
export function castBlock(spell, target, list = views()) {
    if (liveCount(list) >= MAX_EFFECTS) return 'full';
    const size = new Set(['titan', 'mite']);
    const clash = list.find(v => v.status !== 'ended' && tKey(v.e.target) === tKey(target)
        && (v.e.spell === spell || (size.has(v.e.spell) && size.has(spell))));
    return clash ? 'clash' : null;
}

// ---------- casting ----------

function formFrom(detail, seed) {
    const d = String(detail || '').trim().toLowerCase().replace(/^an?\s+/, '');
    if (d) {
        const f = FORMS.find(x => x.id === d || x.name.en.toLowerCase() === d || x.name.en.toLowerCase().endsWith(` ${d}`) || x.name.ko === detail);
        if (f) return { id: f.id };
        return { custom: true, name: String(detail).trim().slice(0, 40), can: '', cannot: '' };
    }
    return { id: FORMS[seed % FORMS.length].id };
}

/**
 * A character casts a spell it was seen casting in the newest reply. The story already shows
 * it, so no "just happened" note goes out for it. One ↶ takes it back (`batch` groups several).
 * @returns {string|null} the new effect id
 */
export function castByCharacter({ avatar, name, spell, variant = '', detail = '', target, batch = null, sneak = false, sensed = false, later = false, when = '', turns = 0 }) {
    const conf = casterConf(avatar);
    if (sneak) {
        // Cast in secret for this reply already? (The reply event can come more than once.)
        const here = lastRef().key;
        const st0 = chatState();
        if (here && st0?.effects.some(e => e.veiled && e.source?.avatar === avatar && e.anchor?.key === here)) return null;
        if (castBlock(spell, target)) return null;
    }
    const spec = {
        spell, duration: conf.duration, method: '',
        trigger: { kind: 'now', turns: 2, chance: 25, text: '' },
        release: { kind: 'time', text: '' },
        source: { kind: 'character', name: String(name || '?'), avatar },
        motive: '', cause: '', visibility: 'all', surprise: false, title: '',
    };
    if (SIMPLE[spell]?.variants) spec.variant = variant || SIMPLE[spell].variants[0];
    if (SIMPLE[spell]?.needsX) spec.x = String(detail || '').trim().slice(0, 60) || 'someone else';
    if (spell === 'polymorph') spec.form = formFrom(detail, hash(`${avatar}|${Date.now()}`));
    // In secret: what it is, who cast it and how it ends stay hidden from me until I look.
    if (sneak) { spec.veiled = true; spec.secretRelease = true; spec.clueEvery = 0; if (sensed) spec.sensed = true; }
    // A delayed spell (0.7.0): "you'll see when the sun sets" — it waits some turns, with an omen 1 turn before.
    if (later) {
        const n = Math.min(50, Math.max(1, Math.round(Number(turns) || DELAY_TURNS)));
        spec.trigger = { kind: 'turns', turns: n, chance: 25, text: String(when || '').trim().slice(0, 60) };
        spec.omen = true;
        spec.delayed = true;
    }
    const [id] = cast(spec, [target]);
    if (!id) return null;
    const st = chatState();
    const e = st.effects.find(x => x.id === id);
    if (e) {
        e.strict = true;
        // Already written in the reply it was noticed in (a delayed one is told when it takes hold).
        if (!later) e.deliveries.cast = e.anchor?.key ?? null;
    }
    // A secret cast has no ↶ (the button would give it away); re-rolling the reply still takes it back.
    if (!sneak) castAction([id], batch);
    save();
    return id;
}

// ---------- the dice (B) ----------

/**
 * The dice for the reply about to be written. `view` is the chat without the reply being
 * re-rolled; the dice only roll for the first reply after my message. Same message, same roll,
 * so a swipe keeps the same result.
 * @returns {{ avatar, name, spell, variant, target, text }|null}
 */
export function rollDice(view, speakerAvatar, chatId = currentChatId(), skipLast = false) {
    if (!chatId || !speakerAvatar || !view.length) return null;
    const u = view.length - 1;
    if (!view.list[u]?.is_user) return null;
    const conf = casterConf(speakerAvatar, chatId);
    if (!conf.dice || !conf.spells.length) return null;
    if (waitTurns(speakerAvatar, view, u, chatId) > 0) return null;
    const seed = `${chatId}|${speakerAvatar}|${view.keys[u]}`;
    if ((hash(seed) % 10000) / 10000 >= conf.chance / 100) return null;
    const me = chatMembers().find(m => m.avatar === speakerAvatar);
    if (!me) return null;
    // On a re-roll, a spell from the reply being replaced does not count (it goes with that reply).
    const list = views({ chatId, skipLast });
    const targets = [{ kind: 'user' }, ...chatMembers().filter(m => m.avatar !== speakerAvatar)];
    const options = [];
    for (const sp of conf.spells) for (const tg of targets) if (!castBlock(sp, tg, list)) options.push([sp, tg]);
    if (!options.length) return null;
    const [spell, target] = options[hash(`${seed}|pick`) % options.length];
    const variant = spell === 'luck' ? (hash(`${seed}|v`) % 2 ? 'bad' : 'good') : '';
    const spName = spell === 'luck' && variant === 'bad' ? 'Jinx' : nameEn({ spell });
    // Cast in secret (2-C-1): half of the hits, when it is on.
    const sneak = conf.sneak && hash(`${seed}|sneak`) % 2 === 0;
    // …and whether I sense it coming (0.7.0). Same message, same answer.
    const noticed = sneak && hash(`${seed}|notice`) % 100 < conf.notice;
    const form = FORMS[hash(`${seed}|f`) % FORMS.length];
    let what = briefEn(spell, variant);
    let detail = '';
    if (spell === 'polymorph') { what = sneak ? `turns them into a ${form.name.en}` : `turns them into a ${form.name.en} (or another animal that fits)`; detail = sneak ? form.id : ''; }
    if (spell === 'glamour') { what = sneak ? 'makes them look like a stranger' : 'changes only how they look (choose a look that fits the scene)'; detail = sneak ? 'a stranger' : ''; }
    const who = targetName(target);
    const text = sneak
        ? `This turn, ${me.name} secretly casts ${spName} on ${who}: it ${what}. Do not show the casting, do not name the spell and do not reveal who did it; only let its effect quietly begin in this reply.`
        : `This turn, ${me.name} casts ${spName} on ${who}: it ${what}. Show ${me.name} casting it naturally in this reply, in character.`;
    return { avatar: speakerAvatar, name: me.name, spell, variant, target, text, sneak, noticed, detail };
}

/** The dice that hit for the reply now being written or just written (shown as 🎲 on the bar). */
let diceNow = null;
export function setDice(d) { diceNow = d; }
export function getDice(chatId) { return diceNow && diceNow.chatId === chatId ? diceNow : null; }

// ---------- copying from another chat ----------

/** Other chats with settings for characters of this chat: [{ chatId, members: [{ avatar, name, conf }] }]. */
export function importChoices() {
    const here = currentChatId();
    const members = chatMembers();
    const out = [];
    for (const [chatId, st] of Object.entries(settings().chats)) {
        if (chatId === here || !st?.casters) continue;
        const found = members.map(m => ({ ...m, conf: clean(st.casters[m.avatar]) })).filter(m => st.casters[m.avatar] && m.conf.spells.length);
        if (found.length) out.push({ chatId, members: found });
    }
    return out.slice(0, 30);
}

export function importFrom(chatId) {
    const from = settings().chats[chatId]?.casters;
    const st = chatState(currentChatId(), true);
    if (!from || !st) return 0;
    st.casters ||= {};
    let n = 0;
    for (const m of chatMembers()) {
        if (!from[m.avatar]) continue;
        st.casters[m.avatar] = clean(structuredClone(from[m.avatar]));
        n++;
    }
    save();
    return n;
}

