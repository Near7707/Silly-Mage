// Magic rules (stage 2-A): Mana, Cooldown, Loadout and Reload.
//
// Like everything else in Mage, nothing here is counted step by step. Mana, cooldowns and the
// Reload charge are worked out again from the chat as it is now, from the casts, dispels,
// reloads and loadout changes stored with the point in the chat where they happened. So
// deleting or re-rolling messages winds them back too, and a swipe never counts a turn twice.
//
// Costs only apply to magic I cast myself (source "me"). Magic from anyone or anything else
// is free, but I cannot dispel it — that is its price.

import { settings, save, chatState, currentChatId } from './store.js';
import { SPELLS, SPELL_ORDER } from './spells.js';
import { chatView, posOf, turnsAfter, lastRef } from './engine.js';

export const COST = { change: 3, mind: 2, illusion: 2, fate: 2, ward: 2 };
export const NO_END_EXTRA = 2;
export const CD_SPELL = 3;
export const CD_DISPEL = 2;
export const RELOAD_EVERY = 20;
export const DEFAULT_LOADOUT = ['polymorph', 'truth', 'charm', 'sleep', 'invisibility', 'dispel'];

export const rulesOn = () => !!settings().rules;
export const isMine = (e) => e?.source?.kind === 'me';

/** Mana a cast costs. A spell with no end costs more. */
export function costOf(spell, duration) {
    if (spell === 'dispel') return COST.ward;
    const base = COST[SPELLS[spell]?.family] ?? 2;
    return base + (Number(duration) === 0 ? NO_END_EXTRA : 0);
}

/** The spells I carry in this chat (only used while the rules are on). */
export function loadout(chatId = currentChatId()) {
    const st = chatState(chatId);
    const size = settings().loadoutSize;
    const list = Array.isArray(st?.loadout) ? st.loadout : DEFAULT_LOADOUT;
    return list.filter(id => SPELLS[id]).slice(0, size);
}

/** Save a new loadout. Spells that were not in it before start on a cooldown. */
export function setLoadout(spells) {
    const st = chatState(currentChatId(), true);
    if (!st) return;
    const before = new Set(loadout());
    const next = SPELL_ORDER.filter(id => spells.includes(id)).slice(0, settings().loadoutSize);
    const at = lastRef();
    const t = Date.now();
    for (const id of next) if (!before.has(id)) st.loadAdds.push({ spell: id, t, at });
    if (st.loadAdds.length > 60) st.loadAdds.splice(0, st.loadAdds.length - 60);
    st.loadout = next;
    save();
}

function turnsBetween(view, a, b) {
    let n = 0;
    for (const x of view.turnAt) if (x > a && x <= b) n++;
    return n;
}

/**
 * Everything the rules say right now.
 * @returns {{ on, mana, max, cooldown: (spell) => number, reloadReady, reloadIn, loadout: string[] }}
 */
export function rulesState(chatId = currentChatId()) {
    const s = settings();
    const max = s.maxMana;
    const st = chatState(chatId);
    const view = chatView(false);
    const events = [];
    if (st) {
        for (const e of st.effects) if (e.ruled) events.push({ pos: posOf(view, e.anchor), t: e.created || 0, cost: e.cost || 0, cd: e.spell });
        for (const a of st.actions) if (a.type === 'dispel' && a.ruled) events.push({ pos: posOf(view, a.at), t: a.t || 0, cost: a.cost || 0, cd: 'dispel' });
        for (const x of st.ledger || []) events.push({ pos: posOf(view, x.at), t: x.t || 0, cost: x.cost || 0, cd: x.spell });
        for (const x of st.loadAdds || []) events.push({ pos: posOf(view, x.at), t: x.t || 0, cost: 0, cd: x.spell, add: true });
        for (const r of st.reloads || []) events.push({ pos: posOf(view, r.at), t: r.t || 0, reload: true });
    }
    events.sort((a, b) => (a.pos - b.pos) || (a.t - b.t));
    let mana = max;
    let last = -1;
    let lastReload = null;
    const cdFrom = {}; // spell -> { pos: chat index the cooldown counts from, need: turns }
    for (const ev of events) {
        mana = Math.min(max, mana + turnsBetween(view, last, ev.pos));
        last = Math.max(last, ev.pos);
        if (ev.reload) {
            mana = max;
            for (const k of Object.keys(cdFrom)) delete cdFrom[k];
            lastReload = ev.pos;
            continue;
        }
        mana = Math.max(0, mana - ev.cost);
        // A spell just put in the loadout always rests the full spell cooldown, Dispel too.
        cdFrom[ev.cd] = { pos: ev.pos, need: ev.add ? CD_SPELL : (ev.cd === 'dispel' ? CD_DISPEL : CD_SPELL) };
    }
    mana = Math.min(max, mana + turnsBetween(view, last, view.length - 1));
    const cooldown = (spell) => {
        const c = cdFrom[spell];
        if (!c) return 0;
        return Math.max(0, c.need - turnsAfter(view, c.pos).length);
    };
    const since = lastReload === null ? Infinity : turnsAfter(view, lastReload).length;
    return {
        on: !!s.rules, mana, max, cooldown,
        reloadReady: since >= RELOAD_EVERY,
        reloadIn: since >= RELOAD_EVERY ? 0 : RELOAD_EVERY - since,
        loadout: loadout(chatId),
    };
}

/**
 * Can I cast this myself right now? Returns null when I can, otherwise
 * { why: 'loadout' | 'cooldown' | 'mana', n } (n = turns to wait, or mana missing).
 */
export function blockOf(spell, duration, mine = true, rs = rulesState()) {
    if (!rs.on) return null;
    if (!rs.loadout.includes(spell)) return { why: 'loadout', n: 0 };
    if (!mine) return null;
    const cd = rs.cooldown(spell);
    if (cd > 0) return { why: 'cooldown', n: cd };
    const cost = costOf(spell, duration);
    if (rs.mana < cost) return { why: 'mana', n: cost - rs.mana };
    return null;
}

/** Reload: mana full, every cooldown reset. Once per chat, then again every 20 turns. */
export function reload() {
    const rs = rulesState();
    if (!rs.on || !rs.reloadReady) return false;
    const st = chatState(currentChatId(), true);
    if (!st) return false;
    st.reloads.push({ id: `r${Date.now().toString(36)}`, t: Date.now(), at: lastRef() });
    if (st.reloads.length > 30) st.reloads.splice(0, st.reloads.length - 30);
    save();
    return true;
}
