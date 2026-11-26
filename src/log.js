// Record cards in the chat (stage 2-C-2). A small card under a message, saying what magic
// happened in that turn: under my message what I did (casts, Dispels, misfires), under an AI
// reply what happened in it (a character's spell, broken / fired / next stage, a block).
//
// - Screen only: the card is put next to the message text, never into it. Nothing goes into
//   the chat file or to the AI, so tokens and the prompt cache are untouched.
// - Light: only messages SillyTavern has drawn get a card; a drawn message is looked at alone;
//   after a change only the messages whose card changed are touched. No watching of the page.
// - It never shows more than the status card does (secrets stay secret).

import { t, josa } from './i18n.js';
import { ctx, settings, chatState, currentChatId } from './store.js';
import { chatView, evaluate, actionValid, counteredIds, msgKey, veiled, posOf } from './engine.js';
import { targetName } from './describe.js';
import { logTitle, releaseHow, stageShort, formName, openCards } from './ui.js';

const MAX_LINES = 3;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cache = new Map(); // message key → card html (what is on screen now)
let cacheChat = null;
let timer = 0;
let wantFull = false;

function spellText(e) {
    const turns = e.duration > 0 ? t('log_turns', { n: e.duration }) : t('log_endless');
    return turns;
}

/** Lines per chat index: Map<index, [{ text, ids, cls, tag }]>. */
function lines(st, view) {
    const out = new Map();
    const add = (i, line) => {
        if (i == null || i < 0 || i >= view.length) return;
        if (!out.has(i)) out.set(i, []);
        out.get(i).push(line);
    };
    // My own doing belongs to my message: the one at that point, or the next one I send.
    const next = new Array(view.length + 1).fill(-1);
    for (let i = view.length - 1; i >= 0; i--) next[i] = view.list[i]?.is_user ? i : next[i + 1];
    const mineAt = (pos) => (pos >= 0 && view.list[pos]?.is_user ? pos : next[Math.max(0, pos + 1)] ?? -1);
    const blocked = counteredIds(st, view);
    const here = (e) => !e.strict || e.anchor?.key == null || view.index.has(e.anchor.key);
    const byId = new Map(st.effects.map(e => [e.id, e]));

    for (const e of st.effects) {
        if (!here(e)) continue;
        const v = evaluate(e, view, st.actions);
        const who = targetName(e.target);
        if (e.source?.kind === 'character' && e.strict) {
            const i = view.index.get(e.anchor?.key);
            const by = String(e.source.name || '?');
            if (veiled(e)) add(i, { text: t('log_unknown'), ids: [e.id], cls: 'unknown' });
            else if (e.delayed) add(i, { text: t('log_delay', { name: by, title: logTitle(e), target: who }), ids: [e.id], cls: 'char', tag: t('log_char_tag') });
            else add(i, { text: `${by} → ${logTitle(e)} · ${who} · ${spellText(e)}`, ids: [e.id], cls: 'char', tag: t('log_char_tag') });
        } else if (!e.surprise) {
            // A spell hidden until it fires gets no card before it fires.
            const i = mineAt(posOf(view, e.anchor));
            const cost = e.cost ? ` · ◆${e.cost}` : '';
            const wait = v.status === 'pending' ? ` · ${t('log_waiting')}` : '';
            add(i, { text: `${logTitle(e)} → ${who} · ${spellText(e)}${wait}${cost}`, ids: [e.id], cls: '' });
            const d = e.drama;
            if (d?.kind === 'crit') {
                add(i, { text: d.orig?.duration != null && e.duration !== d.orig.duration ? t('log_crit', { from: d.orig.duration, to: e.duration }) : t('log_crit_cd'), ids: [e.id], cls: 'crit' });
            } else if (d?.kind === 'miscast') {
                const to = d.type === 'form' ? formName(e.form) : who;
                add(i, { text: t(`log_miscast_${d.type}`, { to, ro: josa(to, '으로/로') }), ids: [e.id], cls: 'miscast' });
            }
        }
        // Fired later (after some turns, by chance, or when a condition happened).
        const later = e.method !== 'stacked' && (e.trigger?.kind || 'now') !== 'now';
        if (later && v.activeFrom != null && !blocked.has(e.id)) {
            add(v.activeFrom, { text: veiled(e) ? t('log_fired_unknown') : t('log_fired', { title: logTitle(e), target: who }), ids: [e.id], cls: veiled(e) ? 'unknown' : '' });
        }
    }

    for (const a of st.actions) {
        if (!actionValid(view, a)) continue;
        const e = byId.get(a.effectId) || null;
        if (a.type === 'counter') {
            add(view.index.get(a.at?.key), { text: t('log_counter'), ids: e ? [e.id] : [], cls: 'counter' });
            continue;
        }
        if (!e || !here(e)) continue;
        const who = targetName(e.target);
        if (a.type === 'dispel') {
            add(mineAt(posOf(view, a.at)), { text: `${t('spell_dispel')} → ${logTitle(e)} · ${who}${a.cost ? ` ◆${a.cost}` : ''}`, ids: [e.id], cls: '' });
        } else if (a.type === 'judge' && a.what === 'release') {
            const i = view.index.get(a.at?.key);
            if (veiled(e)) add(i, { text: t('log_released_unknown'), ids: [e.id], cls: 'unknown' });
            else add(i, { text: t('log_released', { title: logTitle(e), how: e.secretRelease && !e.revealed ? '🔒' : releaseHow(a, e) }), ids: [e.id], cls: '' });
        } else if (a.type === 'judge' && a.what === 'stack') {
            add(view.index.get(a.at?.key), { text: t('log_stage', { title: logTitle(e), stage: stageShort(e, a) }), ids: [e.id], cls: '' });
        }
    }
    return out;
}

function cardHtml(list) {
    const rows = list.slice(0, MAX_LINES).map(l => `<button type="button" class="mage-log-row${l.cls ? ` mage-log-${l.cls}` : ''}" data-mage-log-ids="${esc(l.ids.join(','))}" title="${esc(t('log_open'))}">`
        + `<span class="mage-log-ico" aria-hidden="true">✦</span><span class="mage-ell">${esc(l.text)}</span>`
        + (l.tag ? `<span class="mage-log-tag">${esc(l.tag)}</span>` : '') + '</button>').join('');
    const more = list.length > MAX_LINES ? `<button type="button" class="mage-log-more" data-mage-log-ids="${esc([...new Set(list.slice(MAX_LINES).flatMap(l => l.ids))].join(','))}">${esc(t('log_more', { n: list.length - MAX_LINES }))}</button>` : '';
    return rows + more;
}

/** Card html for each message key of the current chat. */
function compute() {
    const st = chatState();
    const map = new Map();
    if (!st) return map;
    const view = chatView(false);
    for (const [i, list] of lines(st, view)) {
        const key = view.keys[i];
        if (key) map.set(key, cardHtml(list));
    }
    return map;
}

function on() {
    const s = settings();
    return !!(s.enabled && s.logCards && currentChatId());
}

function onCardClick(ev) {
    const b = ev.target.closest('[data-mage-log-ids]');
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    const ids = b.dataset.mageLogIds.split(',').filter(Boolean);
    try { openCards(ids); } catch (e) { console.error('[Mage] log', e); }
}

/** Put (or take away) the card of one drawn message. */
function put(mes, html, key) {
    const host = mes.querySelector(':scope > .mes_block') || mes;
    let card = host.querySelector(':scope > .mage-log');
    if (!html) { card?.remove(); return; }
    if (card && card.dataset.mageLog === key && card._mageHtml === html) {
        if (card !== host.lastElementChild) host.appendChild(card); // stays under other extensions' cards
        return;
    }
    if (!card) {
        card = document.createElement('div');
        card.className = 'mage-log';
        card.addEventListener('click', onCardClick);
    }
    card.dataset.mageLog = key;
    card._mageHtml = html;
    card.innerHTML = html;
    host.appendChild(card);
}

function chatBox() { return document.getElementById('chat'); }

function mesAt(box, i) { return box.querySelector(`:scope > .mes[mesid="${i}"]`); }

function keyOf(mes) {
    const i = Number(mes.getAttribute('mesid'));
    try { return Number.isInteger(i) ? msgKey(ctx().chat?.[i]) : null; } catch { return null; }
}

/** Take every card away (turned off, or Mage turned off). */
export function clearLog() {
    clearTimeout(timer);
    cache = new Map();
    cacheChat = null;
    chatBox()?.querySelectorAll('.mage-log').forEach(x => x.remove());
}

function run() {
    timer = 0;
    const full = wantFull;
    wantFull = false;
    const box = chatBox();
    if (!box) return;
    if (!on()) { if (cache.size || box.querySelector('.mage-log')) clearLog(); return; }
    const chatId = currentChatId();
    const map = compute();
    if (full || cacheChat !== chatId) {
        // A whole chat was drawn (opened, more loaded): one pass over the drawn messages only.
        for (const mes of box.querySelectorAll(':scope > .mes[mesid]')) {
            const key = keyOf(mes);
            put(mes, key ? map.get(key) : '', key);
        }
    } else {
        // Only messages whose card changed.
        const view = chatView(false);
        const keys = new Set([...map.keys(), ...cache.keys()]);
        for (const key of keys) {
            const html = map.get(key) || '';
            if ((cache.get(key) || '') === html) continue;
            const i = view.index.get(key);
            const mes = i === undefined ? null : mesAt(box, i);
            if (mes) put(mes, html, key);
            else if (!html) box.querySelectorAll('.mage-log').forEach(c => { if (c.dataset.mageLog === key) c.remove(); });
        }
    }
    cache = map;
    cacheChat = chatId;
}

/** After anything changed. `full`: the chat was drawn again (open, load more, settings). */
export function syncLog(full = false) {
    if (full) wantFull = true;
    if (timer) return;
    timer = setTimeout(() => { try { run(); } catch (e) { console.error('[Mage] log', e); } }, 30);
}

/** One message was drawn (sent, received, swiped, edited): only that one is looked at. */
export function syncMessage(mesId) {
    try {
        const box = chatBox();
        if (!box || !on()) return;
        if (cacheChat !== currentChatId()) return syncLog(true);
        const mes = mesAt(box, Number(mesId));
        if (!mes) return;
        const key = keyOf(mes);
        put(mes, key ? cache.get(key) : '', key);
    } catch (e) { console.error('[Mage] log', e); }
}
