// Screens: the small status bar above the input box, the floating status window
// (Status / Cast / Spellbook) and the panel in SillyTavern's extension settings.

import { t, lang, josa } from './i18n.js';
import { ctx, settings, save, currentChatId, uid } from './store.js';
import {
    FAMILIES, SPELLS, SPELL_ORDER, FORMS, formById, STAGES, STAGE_MAX, SOURCES, MOTIVES, TRIGGERS, RELEASES,
    VISIBILITY, DURATIONS, MAX_EFFECTS, MOTIVE_SUGGEST, RANDOM_OBJECTS, RANDOM_PLACES,
} from './spells.js';
import { views, shown, liveCount, cast, judge, dispel, undo, undoable, history, removeEffect } from './engine.js';
import { targetName, initial, formText, stateText } from './describe.js';
import { iconSvg, framedIcon, MAGE_GLYPH } from './icons.js';
import { syncTheme, famColor, colorMode } from './theme.js';
import { attachWindow, place } from './win.js';
import { askCause, askForm } from './ai.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (kind, msg) => { try { globalThis.toastr?.[kind]?.(msg, 'Mage'); } catch { /* ignore */ } };

let onChangeHook = () => {};
export function setOnChange(fn) { onChangeHook = fn; }

const ui = {
    open: false,
    view: 'status',
    opened: new Set(),
    draft: null,
    details: false,
    editCard: null,     // Spellbook card id being edited ('' = new card)
    cause: { busy: false, ctl: null, preview: '' },
    formBusy: null,
    lastStatus: new Map(),
    lastChat: null,
    vars: {},
};

let barEl = null;
let winEl = null;

// ---------- small helpers ----------

function mode() { return colorMode(settings().skin, ui.vars); }
function famCol(family) { return famColor(FAMILIES[family]?.color || '#888888', mode()); }
const spellName = (id) => t(`spell_${id}`);
const famName = (id) => t(`fam_${id}`);

function formLabel(f, L = lang()) {
    if (!f) return '?';
    if (f.custom) return String(f.name || '?');
    const b = formById(f.id);
    return b ? (b.name[L] || b.name.en) : '?';
}

function effectTitle(e) {
    if (e.title) return e.title;
    if (e.method === 'stacked') return t('curse_of', { cond: e.trigger?.text || '?' });
    if (e.spell === 'polymorph') return `${spellName('polymorph')} · ${formLabel(e.form)}`;
    return spellName(e.spell);
}

function ini(target) {
    const name = targetName(target);
    const c = target?.kind === 'user' ? 'var(--mage-accent)' : '#7a52b3';
    return `<span class="mage-ini" style="--mage-ini:${c}" title="${esc(name)}">${esc(initial(name))}</span>`;
}

function isCurse(e) { return e.method === 'curse' || e.method === 'stacked'; }

function leftText(v) {
    const e = v.e;
    if (e.surprise && e.duration > 0) return t('left_unknown');
    if (e.duration > 0) return t('left_n', { n: v.left });
    return t('left_none');
}

function pendingText(v) {
    const tr = v.e.trigger || {};
    if (tr.kind === 'turns') return t('pend_turns', { n: v.pendingLeft ?? tr.turns });
    if (tr.kind === 'chance') return t('pend_chance', { p: tr.chance });
    if (tr.kind === 'condition') return t('pend_cond', { cond: tr.text || '?' });
    return '';
}

function chipText(v) {
    const e = v.e;
    if (v.status === 'pending') {
        if (e.surprise) return '???';
        const tr = e.trigger || {};
        if (tr.kind === 'turns') return t('chip_in', { n: v.pendingLeft });
        if (tr.kind === 'chance') return `${tr.chance}%`;
        return t('chip_wait');
    }
    if (v.status === 'ended') return t('chip_ending');
    if (e.method === 'stacked') {
        if (v.stage <= 0) return `${t('curse')} 0/${STAGE_MAX}`;
        return `${STAGES[v.stage - 1].short[lang()]} ${v.stage}/${STAGE_MAX}`;
    }
    const name = e.spell === 'polymorph' ? formLabel(e.form) : spellName(e.spell);
    if (e.duration > 0) return `${name} ${e.surprise ? '?' : t('chip_turns', { n: v.left })}`;
    return `${name} ∞`;
}

/** Buttons I press when something happened in the story. */
function condButtons(v) {
    if (v.status === 'ended') return [];
    const e = v.e;
    const out = [];
    if (v.status === 'pending' && e.trigger?.kind === 'condition' && e.method !== 'stacked') {
        out.push({ what: 'trigger', label: e.trigger.text || t('cond') });
    }
    if (v.status === 'active') {
        if (e.method === 'stacked' && v.stage < STAGE_MAX) out.push({ what: 'stack', label: e.trigger?.text || t('cond') });
        if (e.release?.kind === 'truth') out.push({ what: 'release', label: t('btn_truth') });
        if (e.release?.kind === 'action') out.push({ what: 'release', label: e.release.text || t('rel_action') });
    }
    return out;
}

function condBtnHtml(v, b, cls = 'mage-cond') {
    return `<button type="button" class="${cls}" data-mage-judge="${esc(v.e.id)}" data-what="${b.what}" title="${esc(t(`judge_${b.what}`))}">`
        + `<span class="mage-ell">${esc(b.label)}</span></button>`;
}

// ---------- status bar ----------

export function mountBar() {
    const form = document.getElementById('send_form');
    if (!form) return;
    barEl = document.getElementById('mage_bar');
    if (!barEl) {
        barEl = document.createElement('div');
        barEl.id = 'mage_bar';
        barEl.className = 'mage-bar mage-root';
        barEl.hidden = true;
        barEl.addEventListener('click', onBarClick);
    }
    if (barEl.nextElementSibling !== form) form.parentElement.insertBefore(barEl, form);
}

function onBarClick(e) {
    const j = e.target.closest('[data-mage-judge]');
    if (j) return doJudge(j.dataset.mageJudge, j.dataset.what);
    if (e.target.closest('[data-mage-undo]')) return doUndo();
    const o = e.target.closest('[data-mage-open]');
    if (o) {
        if (o.dataset.mageOpen) { ui.opened.add(o.dataset.mageOpen); ui.allClosed = false; return openWindow('status', { expand: true }); }
        if (ui.open) return closeWindow(); // ⌃ toggles
        return openWindow('status');
    }
}

function renderBar(list) {
    if (!barEl) mountBar();
    if (!barEl) return;
    const s = settings();
    barEl.className = `mage-bar mage-root mage-skin-${s.skin}`;
    if (!s.enabled || !currentChatId() || !list.length) { barEl.hidden = true; barEl.innerHTML = ''; return; }
    const barSkin = s.skin === 'tome' ? 'theme' : s.skin; // the bar keeps the chat readable; old-book paper only in the window
    const barMode = colorMode(barSkin, syncTheme(barEl, barSkin));
    const chip = (v) => {
        const e = v.e;
        const col = famColor(FAMILIES[SPELLS[e.spell]?.family || 'change'].color, barMode);
        return `<button type="button" class="mage-chip${v.status !== 'active' ? ' mage-dim' : ''}" data-mage-open="${esc(e.id)}" style="--mage-fam:${col}" title="${esc(effectTitle(e))}">`
            + iconSvg(e.surprise && v.status === 'pending' ? 'polymorph' : SPELLS[e.spell]?.icon, { size: 18, curse: isCurse(e) })
            + ini(e.target) + `<span class="mage-ell">${esc(chipText(v))}</span></button>`;
    };
    const conds = (v) => condButtons(v).map(b => condBtnHtml(v, b)).join('');
    // Each chip is followed by its own condition buttons, so the one to press sits next to it.
    const shownHtml = list.slice(0, 2).map(v => chip(v) + conds(v)).join('');
    const more = list.length > 2 ? `<button type="button" class="mage-chip mage-more" data-mage-open="">+${list.length - 2}</button>` + list.slice(2).map(conds).join('') : '';
    const undoBtn = undoable() ? `<button type="button" class="mage-mini" data-mage-undo title="${esc(t('undo'))}" aria-label="${esc(t('undo'))}">↶</button>` : '';
    barEl.innerHTML = `<div class="mage-bar-row">${shownHtml}${more}</div>${undoBtn}`
        + `<button type="button" class="mage-mini" data-mage-open="" title="${esc(t('open_status'))}" aria-label="${esc(t('open_status'))}">⌃</button>`;
    barEl.hidden = false;
}

// ---------- window ----------

function ensureWindow() {
    winEl = document.getElementById('mage_win');
    if (winEl) return winEl;
    winEl = document.createElement('div');
    winEl.id = 'mage_win';
    winEl.className = 'mage-win mage-root';
    winEl.hidden = true;
    winEl.setAttribute('role', 'dialog');
    winEl.innerHTML = `<div class="mage-cover"><div class="mage-page">
        <div class="mage-head"><span class="mage-title">${MAGE_GLYPH}<b>Mage</b></span><span class="mage-sum mage-ell"></span>
          <button type="button" class="mage-hbtn" data-mage-collapse></button>
          <button type="button" class="mage-hbtn" data-mage-close>✕</button></div>
        <div class="mage-tabs"></div>
        <div class="mage-orn" aria-hidden="true"></div>
        <div class="mage-body"></div>
        <div class="mage-foot"></div>
      </div></div>`;
    document.body.appendChild(winEl);
    winEl.addEventListener('click', onWinClick);
    winEl.addEventListener('change', onWinChange);
    winEl.addEventListener('input', onWinInput);
    attachWindow(winEl, winEl.querySelector('.mage-head'));
    return winEl;
}

export function isOpen() { return ui.open; }

/** `expand`: also unfold a folded window (used when a chip asks to show its card). */
export function openWindow(view, { expand = false } = {}) {
    const s = settings();
    if (!s.enabled) { toast('info', t('turned_off')); return; }
    ensureWindow();
    if (view) ui.view = view;
    if (ui.view === 'cast' && !ui.draft) ui.draft = newDraft();
    if (s.winCollapsed && expand) { s.winCollapsed = false; save(); }
    ui.open = true;
    winEl.hidden = false;
    renderWindow();
    place();
}

export function closeWindow() {
    ui.open = false;
    ui.cause.ctl?.abort();
    if (winEl) winEl.hidden = true;
}

function setCollapsed(v) {
    settings().winCollapsed = v;
    save();
    renderWindow();
    place(); // opening near the bottom lifts the window so it fits
}

function renderWindow() {
    if (!winEl || !ui.open) return;
    const s = settings();
    winEl.className = `mage-win mage-root mage-skin-${s.skin}${s.winCollapsed ? ' mage-collapsed' : ''}`;
    ui.vars = syncTheme(winEl, s.skin);
    // The cursed book belongs to a warlock; menus and toasts stay "Mage".
    winEl.querySelector('.mage-title b').textContent = s.skin === 'cursed' ? 'Warlock' : 'Mage';
    const list = shown(views());
    const live = liveCount(views());
    const sum = winEl.querySelector('.mage-sum');
    sum.textContent = s.winCollapsed ? [t('sum', { n: live, max: MAX_EFFECTS }), list[0] ? chipText(list[0]) : ''].filter(Boolean).join(' · ') : '';
    const col = winEl.querySelector('[data-mage-collapse]');
    col.textContent = s.winCollapsed ? '▢' : '▁';
    col.title = s.winCollapsed ? t('expand') : t('collapse');
    col.setAttribute('aria-label', col.title);
    winEl.querySelector('[data-mage-close]').title = t('close');
    winEl.querySelector('.mage-tabs').innerHTML = ['status', 'cast', 'book'].map(v =>
        `<button type="button" class="mage-tab${ui.view === v ? ' on' : ''}" data-mage-view="${v}"><span class="mage-ell">${esc(v === 'status' ? t('tab_status', { n: live, max: MAX_EFFECTS }) : t(`tab_${v}`))}</span></button>`).join('');
    const orn = winEl.querySelector('.mage-orn');
    orn.innerHTML = s.skin === 'tome' ? '❧ ✥ ☙' : s.skin === 'cursed' ? (ui.view === 'book' ? '<span class="mage-drop"></span><span class="mage-drop"></span><span class="mage-drop"></span>' : '') : '';
    orn.hidden = !orn.innerHTML;
    if (s.winCollapsed) return;
    const body = winEl.querySelector('.mage-body');
    const foot = winEl.querySelector('.mage-foot');
    const top = body.scrollTop;
    if (ui.view === 'status') { body.innerHTML = statusHtml(list); foot.innerHTML = statusFoot(); }
    else if (ui.view === 'cast') { body.innerHTML = castHtml(); foot.innerHTML = castFoot(); }
    else { body.innerHTML = bookHtml(); foot.innerHTML = bookFoot(); }
    if (ui.keepScroll) body.scrollTop = top; else body.scrollTop = 0;
    ui.keepScroll = false;
}

function rerender() { ui.keepScroll = true; renderWindow(); }

// ---------- status view ----------

function statusHtml(list) {
    if (!currentChatId()) return `<div class="mage-empty">${esc(t('no_chat'))}</div>`;
    if (!list.length) {
        return `<div class="mage-empty"><div class="mage-empty-ico">${framedIcon('polymorph', { skin: settings().skin, size: 56 })}</div>`
            + `<p>${esc(t('empty_status'))}</p><button type="button" class="mage-btn mage-primary" data-mage-view="cast">${esc(t('cast_one'))}</button></div>`;
    }
    if (!ui.allClosed && ![...ui.opened].some(id => list.some(v => v.e.id === id))) ui.opened.add(list[0].e.id);
    const cards = list.map(v => cardHtml(v, ui.opened.has(v.e.id))).join('');
    const hist = history(4);
    const histHtml = hist.length ? `<div class="mage-hist"><div class="mage-hist-t">${esc(t('recent'))}</div>`
        + hist.map(({ a, e }) => `<div class="mage-hist-row"><span class="mage-muted">${esc(ago(a.t))}</span> · <span class="mage-ell">${esc(actionLabel(a, e))}</span></div>`).join('') + '</div>' : '';
    return cards + histHtml;
}

function ago(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return t('just_now');
    if (m < 60) return t('min_ago', { n: m });
    const h = Math.floor(m / 60);
    return h < 24 ? t('hour_ago', { n: h }) : t('day_ago', { n: Math.floor(h / 24) });
}

function actionLabel(a, e) {
    if (a.type === 'dispel') return `${spellName('dispel')} → ${effectTitle(e)}`;
    if (a.what === 'stack') {
        const st = chatViewStage(e, a);
        return `${e.trigger?.text || t('cond')} → ${st}`;
    }
    if (a.what === 'trigger') return `${e.trigger?.text || t('cond')} → ${t('fired_short')}`;
    return `${e.release?.kind === 'truth' ? t('btn_truth') : (e.release?.text || t('rel_action'))} → ${t('released_short')}`;
}

function chatViewStage(e, a) {
    const st = settings().chats[currentChatId()];
    const presses = (st?.actions || []).filter(x => x.effectId === e.id && x.what === 'stack').sort((x, y) => x.t - y.t);
    const n = Math.min(STAGE_MAX, presses.findIndex(x => x.id === a.id) + 1);
    return n > 0 ? STAGES[n - 1].short[lang()] : '?';
}

function row(label, value, cls = '') {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="mage-row ${cls}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
}

function sourceLabel(src) {
    if (!src || src.kind === 'unknown') return src?.name ? esc(src.name) : '';
    const k = t(`src_${src.kind}`);
    if (src.kind === 'me') return esc(`${k} (${targetName({ kind: 'user' })})`);
    return esc(src.name ? `${k} · ${src.name}` : k);
}

function releaseLabel(e) {
    const r = e.release || { kind: 'dispel' };
    const base = r.kind === 'dispel' ? t('rel_dispel') : r.kind === 'truth' ? (r.text ? t('rel_truth_about', { x: r.text }) : t('rel_truth')) : (r.text || t('rel_action'));
    return r.kind === 'dispel' ? base : `${base} · ${t('rel_dispel')}`;
}

function stageCells(v) {
    let cells = '';
    for (let i = 1; i <= STAGE_MAX; i++) cells += `<span class="mage-cell${i <= v.stage ? ' on' : ''}"></span>`;
    const label = v.stage > 0 ? `${v.stage}/${STAGE_MAX} ${STAGES[v.stage - 1].short[lang()]}` : `0/${STAGE_MAX}`;
    return `<span class="mage-cells">${cells}</span> <span class="mage-stage-t">${esc(label)}</span>`;
}

function cardHtml(v, open) {
    const e = v.e;
    const s = settings();
    const fam = SPELLS[e.spell]?.family || 'change';
    const hide = e.surprise && v.status === 'pending';
    const title = hide ? t('unknown_spell') : effectTitle(e);
    const tags = [`<span class="mage-tag" style="--mage-fam:${famCol(fam)}">${esc(famName(fam))}</span>`];
    if (e.method === 'stacked') tags.push(`<span class="mage-tag mage-tag-curse">${esc(t('method_stacked'))}</span>`);
    else if (e.method === 'curse') tags.push(`<span class="mage-tag mage-tag-curse">${esc(t('method_curse'))}</span>`);
    if (v.status === 'pending') tags.push(`<span class="mage-tag mage-tag-wait">${esc(t('st_pending'))}</span>`);
    if (v.status === 'ended') tags.push(`<span class="mage-tag mage-tag-wait">${esc(t('st_ending'))}</span>`);
    const sub = `${ini(e.target)}<span class="mage-ell">${esc(targetName(e.target))} · ${esc(v.status === 'pending' ? pendingText(v) : v.status === 'ended' ? t('st_ending') : leftText(v))}</span>`;
    let rows = '';
    if (open) {
        const L = lang();
        const st = stateText(e, v, L);
        rows += row(t('r_target'), `${ini(e.target)} ${esc(targetName(e.target))}`, 'mage-row-target');
        if (!hide) {
            rows += row(t('r_source'), sourceLabel(e.source));
            rows += row(t('r_cause'), e.cause ? esc(e.cause) + (e.visibility === 'causeHidden' ? ` <span class="mage-muted">${esc(t('vis_causeHidden_short'))}</span>` : '') : '');
        }
        if (v.status === 'pending') rows += row(t('r_when'), esc(pendingText(v)));
        if (!hide) {
            if (e.method === 'stacked') rows += row(t('r_stage'), stageCells(v));
            if (v.status !== 'pending' || e.method !== 'stacked') {
                if (e.method === 'stacked' && v.stage === 0) rows += row(t('r_look'), esc(t('look_none')));
                else if (st.look) rows += row(t('r_look'), esc(st.look));
                rows += row(t('r_can'), st.can ? esc(st.can) : '');
                rows += row(t('r_cannot'), st.cannot ? esc(st.cannot) : '');
            }
            if (e.method === 'stacked' && v.stage < STAGE_MAX) rows += row(t('r_next'), esc(t('next_stage', { cond: e.trigger?.text || '?', form: formText(e, L).name })));
            rows += row(t('r_release'), esc(releaseLabel(e)));
            if (v.status === 'active') rows += row(t('r_left'), esc(leftText(v)));
            if (e.visibility === 'targetUnaware') rows += row(t('r_vis'), esc(t('vis_targetUnaware')));
        }
        if (v.status === 'ended') rows += row(t('r_note'), esc(t('ending_note')));
    }
    const acts = open && v.status !== 'ended'
        ? `<div class="mage-acts">${condButtons(v).map(b => condBtnHtml(v, b, 'mage-btn mage-cond-btn')).join('')}`
        + `<button type="button" class="mage-btn mage-small" data-mage-dispel="${esc(e.id)}">${iconSvg('dispel', { size: 16 })}<span class="mage-ell">${esc(spellName('dispel'))}</span></button></div>`
        : '';
    return `<div class="mage-card mage-st-${v.status}${open ? ' open' : ''}" data-id="${esc(e.id)}" style="--mage-fam:${famCol(fam)}">`
        + `<button type="button" class="mage-card-head" data-mage-toggle="${esc(e.id)}" aria-expanded="${open}">`
        + framedIcon(hide ? 'polymorph' : SPELLS[e.spell]?.icon, { skin: s.skin, curse: isCurse(e) })
        + `<span class="mage-card-tt"><span class="mage-card-name mage-ell">${esc(title)}</span><span class="mage-tags">${tags.join('')}</span>`
        + (open ? '' : `<span class="mage-card-sub">${sub}</span>`) + '</span>'
        + `<span class="mage-caret">${open ? '▴' : '▾'}</span></button>`
        + (rows ? `<dl class="mage-rows">${rows}</dl>` : '') + acts + '</div>';
}

function statusFoot() {
    const can = !!undoable();
    return `<button type="button" class="mage-btn" data-mage-undo${can ? '' : ' disabled'}><span class="mage-ell">↶ ${esc(t('undo'))}</span></button>`
        + `<button type="button" class="mage-btn mage-primary" data-mage-view="cast"${currentChatId() ? '' : ' disabled'}><span class="mage-ell">✦ ${esc(t('cast_spell'))}</span></button>`;
}

// ---------- cast view ----------

function chatTargets() {
    const c = ctx();
    const out = [];
    try {
        if (c.groupId) {
            const g = (c.groups || []).find(x => x.id === c.groupId);
            for (const av of g?.members || []) {
                const ch = (c.characters || []).find(x => x.avatar === av);
                if (ch) out.push({ kind: 'char', avatar: ch.avatar, name: ch.name });
            }
        } else if (c.characterId !== undefined) {
            const ch = c.characters?.[c.characterId];
            if (ch) out.push({ kind: 'char', avatar: ch.avatar, name: ch.name });
        }
    } catch { /* ignore */ }
    return out;
}

const tKey = (tg) => (tg.kind === 'user' ? 'user' : `char:${tg.avatar}`);

function newDraft() {
    const chars = chatTargets();
    return {
        spell: 'polymorph', target: chars[0] ? tKey(chars[0]) : 'user',
        form: { id: 'cat' }, duration: 3,
        source: { kind: 'unknown', name: '' }, motive: '',
        trigger: { kind: 'now', turns: 2, chance: 25, text: '' },
        method: '', release: { kind: 'dispel', text: '' }, visibility: 'all', surprise: false,
        cause: '', title: '', dispelWhat: '', touched: {},
    };
}

function opt(value, label, cur) {
    return `<option value="${esc(value)}"${String(value) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
}

function sel(field, options, cur, extra = '') {
    return `<span class="mage-sel"><select class="mage-select" data-f="${field}" ${extra}>${options.map(([v, l]) => opt(v, l, cur)).join('')}</select></span>`;
}

function field(label, inner, cls = '') {
    return `<label class="mage-field ${cls}"><span class="mage-flabel">${esc(label)}</span>${inner}</label>`;
}

function targetOptions(d) {
    const chars = chatTargets();
    const opts = [['user', `${t('tg_me')} (${targetName({ kind: 'user' })})`], ...chars.map(c => [tKey(c), c.name])];
    if (d.spell !== 'dispel') {
        if (chars.length === 1) opts.push(['both', t('tg_both')]);
        opts.push(['random', t('tg_random')]);
    }
    return opts;
}

function resolveTargets(d) {
    const chars = chatTargets();
    const me = { kind: 'user' };
    if (d.target === 'both') return [me, ...chars.slice(0, 1)];
    if (d.target === 'random') { const all = [me, ...chars]; return [all[Math.floor(Math.random() * all.length)]]; }
    if (d.target === 'user') return [me];
    const c = chars.find(x => tKey(x) === d.target);
    return c ? [c] : [];
}

function formOptions() {
    const L = lang();
    const opts = FORMS.map(f => [`b:${f.id}`, f.name[L] || f.name.en]);
    for (const c of settings().customForms) opts.push([`c:${c.id}`, `${c.name} ✎`]);
    opts.push(['new', t('form_custom')]);
    return opts;
}

function formValue(f) {
    if (!f) return 'b:cat';
    if (f.custom) return f.savedId ? `c:${f.savedId}` : 'new';
    return `b:${f.id}`;
}

function dispelOptions(d) {
    const tg = resolveTargets(d)[0];
    if (!tg) return [];
    const list = views().filter(v => v.status !== 'ended' && tKey(v.e.target) === tKey(tg));
    const opts = list.map(v => [v.e.id, effectTitle(v.e) + (v.status === 'pending' ? ` (${t('st_pending')})` : '')]);
    const fams = [...new Set(list.map(v => SPELLS[v.e.spell]?.family))].filter(Boolean);
    if (list.length > 1) for (const f of fams) opts.push([`fam:${f}`, t('dispel_family', { fam: famName(f) })]);
    return opts;
}

function castHtml() {
    const d = ui.draft || (ui.draft = newDraft());
    const L = lang();
    if (!currentChatId() && ui.editCard === null) return `<div class="mage-empty">${esc(t('no_chat'))}</div>`;
    let h = '';
    if (ui.editCard !== null) {
        h += `<div class="mage-editing">${esc(ui.editCard ? t('editing_card') : t('new_card'))}</div>`;
        h += field(t('card_name'), `<input class="mage-input" data-f="title" maxlength="40" value="${esc(d.title)}" placeholder="${esc(t('card_name_ph'))}">`);
    }
    const spellOpts = SPELL_ORDER.map(id => [id, `${spellName(id)} — ${famName(SPELLS[id].family)}`]);
    if (ui.editCard === null) h += field(t('f_target'), sel('target', targetOptions(d), d.target));
    h += field(t('f_spell'), sel('spell', ui.editCard !== null ? spellOpts.filter(o => o[0] !== 'dispel') : spellOpts, d.spell));
    h += `<div class="mage-spell-desc">${esc(t(`desc_${d.spell}`))}</div>`;

    if (d.spell === 'dispel') {
        const opts = dispelOptions(d);
        if (!opts.length) h += `<div class="mage-note">${esc(t('nothing_dispel', { name: targetName(resolveTargets(d)[0]) }))}</div>`;
        else {
            if (!opts.some(o => o[0] === d.dispelWhat)) d.dispelWhat = opts[0][0];
            h += field(t('f_dispel_what'), sel('dispelWhat', opts, d.dispelWhat));
        }
        return h + causeBox(d);
    }

    if (d.spell === 'polymorph') {
        const fv = formValue(d.form);
        h += `<div class="mage-field"><span class="mage-flabel">${esc(d.method === 'stacked' ? t('f_form_final') : t('f_form'))}</span>`
            + `<div class="mage-inline">${sel('formSel', formOptions(), fv)}`
            + `<button type="button" class="mage-btn mage-icon-btn" data-mage-randform title="${esc(t('form_random'))}" aria-label="${esc(t('form_random'))}">🎲</button></div></div>`;
        if (d.form.custom) {
            h += field(t('form_name'), `<div class="mage-inline"><input class="mage-input" data-f="formName" maxlength="40" value="${esc(d.form.name || '')}" placeholder="${esc(t('form_name_ph'))}">`
                + `<button type="button" class="mage-btn mage-small" data-mage-aiform${ui.formBusy ? ' disabled' : ''}><span class="mage-ell">${esc(ui.formBusy ? t('ai_wait') : t('ai_fill'))}</span></button></div>`);
            h += field(t('r_can'), `<input class="mage-input" data-f="formCan" maxlength="120" value="${esc(d.form.can || '')}">`);
            h += field(t('r_cannot'), `<input class="mage-input" data-f="formCannot" maxlength="120" value="${esc(d.form.cannot || '')}">`);
        } else {
            const f = formById(d.form.id) || FORMS[0];
            h += `<div class="mage-preview"><div><b>${esc(t('r_can'))}</b> ${esc(f.can[L])}</div><div><b>${esc(t('r_cannot'))}</b> ${esc(f.cannot[L])}</div></div>`;
        }
    } else {
        const st = stateText({ spell: d.spell }, null, L);
        h += `<div class="mage-preview"><div><b>${esc(t('r_can'))}</b> ${esc(st.can)}</div><div><b>${esc(t('r_cannot'))}</b> ${esc(st.cannot)}</div></div>`;
    }

    const durBtns = DURATIONS.map(n => `<button type="button" class="mage-seg${Number(d.duration) === n ? ' on' : ''}" data-mage-dur="${n}">${esc(n ? t('dur_n', { n }) : t('dur_none'))}</button>`).join('');
    h += `<div class="mage-field"><span class="mage-flabel">${esc(t('f_duration'))}</span><div class="mage-segs">${durBtns}</div>`
        + (!DURATIONS.includes(Number(d.duration)) ? `<div class="mage-hint">${esc(t('dur_custom_now', { n: d.duration }))}</div>` : '')
        + (Number(d.duration) === 0 ? `<div class="mage-hint">${esc(t('dur_none_hint', { r: releaseLabel(d) }))}</div>` : '') + '</div>';
    if (d.method === 'stacked') {
        h += field(t('f_condition'), `<input class="mage-input" data-f="trigText" maxlength="40" value="${esc(d.trigger.text)}" placeholder="${esc(t('cond_ph'))}">`);
    }
    if (d.cause) h += `<div class="mage-cause-line"><b>${esc(t('r_cause'))}</b> ${esc(d.cause)}</div>`;

    // "More" — who, why, when, how it ends, who knows.
    h += `<button type="button" class="mage-more-btn" data-mage-details aria-expanded="${ui.details}">${ui.details ? '▴' : '▾'} ${esc(t('details'))}</button>`;
    if (ui.details) h += detailsHtml(d);
    return h + causeBox(d);
}

function detailsHtml(d) {
    const s = settings();
    let h = '<div class="mage-details">';
    const srcs = SOURCES.filter(k => k !== 'trickster' || s.allowTrickster || d.source.kind === 'trickster');
    h += field(t('f_source'), sel('srcKind', srcs.map(k => [k, t(`src_${k}`)]), d.source.kind));
    if (['object', 'place', 'trickster'].includes(d.source.kind)) {
        h += field(t('f_source_name'), `<input class="mage-input" data-f="srcName" maxlength="60" value="${esc(d.source.name)}" placeholder="${esc(t('src_name_ph'))}">`);
    }
    h += field(t('f_motive'), sel('motive', MOTIVES.map(k => [k, k ? t(`mot_${k}`) : t('mot_none')]), d.motive));
    if (d.motive) h += `<div class="mage-hint">${esc(t(`mot_hint_${d.motive}`))}</div>`;
    h += field(t('f_method'), sel('method', [['', t('method_none')], ['curse', t('method_curse')], ...(d.spell === 'polymorph' ? [['stacked', t('method_stacked')]] : [])], d.method));
    if (d.method) h += `<div class="mage-hint">${esc(t(`method_hint_${d.method}`))}</div>`;
    if (d.method !== 'stacked') {
        const trigs = TRIGGERS.filter(k => d.method !== 'curse' || k === 'condition');
        if (d.method === 'curse') d.trigger.kind = 'condition';
        h += field(t('f_trigger'), sel('trigKind', trigs.map(k => [k, t(`trig_${k}`)]), d.trigger.kind));
        if (d.trigger.kind === 'turns') h += field(t('trig_turns_n'), `<input class="mage-input mage-num" type="number" inputmode="numeric" min="1" max="50" data-f="trigTurns" value="${esc(d.trigger.turns)}">`);
        if (d.trigger.kind === 'chance') h += field(t('trig_chance_p'), `<input class="mage-input mage-num" type="number" inputmode="numeric" min="1" max="100" data-f="trigChance" value="${esc(d.trigger.chance)}">`);
        if (d.trigger.kind === 'condition') h += field(t('f_condition'), `<input class="mage-input" data-f="trigText" maxlength="40" value="${esc(d.trigger.text)}" placeholder="${esc(t('cond_ph'))}">`);
        if (d.trigger.kind !== 'now') {
            h += `<label class="mage-check"><input type="checkbox" data-f="surprise"${d.surprise ? ' checked' : ''}><span>${esc(t('surprise'))}</span></label>`;
        }
    }
    h += field(t('f_release'), sel('relKind', RELEASES.map(k => [k, t(`rel_${k}`)]), d.release.kind));
    if (d.release.kind !== 'dispel') {
        h += field(d.release.kind === 'truth' ? t('rel_truth_text') : t('rel_action_text'),
            `<input class="mage-input" data-f="relText" maxlength="60" value="${esc(d.release.text)}" placeholder="${esc(t(d.release.kind === 'truth' ? 'rel_truth_ph' : 'rel_action_ph'))}">`);
    }
    h += field(t('f_vis'), sel('vis', VISIBILITY.map(k => [k, t(`vis_${k}`)]), d.visibility));
    h += field(t('f_turns_custom'), `<input class="mage-input mage-num" type="number" inputmode="numeric" min="1" max="99" data-f="customTurns" value="${DURATIONS.includes(Number(d.duration)) ? '' : esc(d.duration)}" placeholder="${esc(t('turns_ph'))}">`);
    h += field(t('r_cause'), `<textarea class="mage-input mage-area" data-f="cause" rows="2" maxlength="200" placeholder="${esc(t('cause_ph'))}">${esc(d.cause)}</textarea>`);
    if (ui.editCard === null) h += `<button type="button" class="mage-btn mage-small mage-wide" data-mage-savecard><span class="mage-ell">📖 ${esc(t('save_as_card'))}</span></button>`;
    return h + '</div>';
}

function causeBox() {
    const c = ui.cause;
    if (!c.preview && !c.busy) return '';
    if (c.busy) return `<div class="mage-causebox"><span class="mage-muted">${esc(t('cause_wait'))}</span></div>`;
    return `<div class="mage-causebox"><div class="mage-causebox-t">🎲 ${esc(c.preview)}</div><div class="mage-inline">`
        + `<button type="button" class="mage-btn mage-small mage-primary" data-mage-cause-apply><span class="mage-ell">${esc(t('apply'))}</span></button>`
        + `<button type="button" class="mage-btn mage-small" data-mage-cause><span class="mage-ell">${esc(t('again'))}</span></button>`
        + `<button type="button" class="mage-btn mage-small" data-mage-cause-close><span class="mage-ell">${esc(t('close'))}</span></button></div></div>`;
}

function castFoot() {
    if (ui.editCard !== null) {
        return `<button type="button" class="mage-btn" data-mage-card-cancel><span class="mage-ell">${esc(t('cancel'))}</span></button>`
            + (ui.editCard ? `<button type="button" class="mage-btn mage-danger-btn" data-mage-card-del><span class="mage-ell">${esc(t('delete'))}</span></button>` : '')
            + `<button type="button" class="mage-btn mage-primary" data-mage-card-save><span class="mage-ell">${esc(t('save'))}</span></button>`;
    }
    const off = !currentChatId();
    return `<button type="button" class="mage-btn mage-icon-btn" data-mage-view="book" title="${esc(t('tab_book'))}" aria-label="${esc(t('tab_book'))}">📖</button>`
        + `<button type="button" class="mage-btn" data-mage-cause${off ? ' disabled' : ''}><span class="mage-ell">${esc(ui.cause.busy ? t('cancel') : t('cause_roll'))}</span></button>`
        + `<button type="button" class="mage-btn mage-primary" data-mage-cast${off ? ' disabled' : ''}><span class="mage-ell">✦ ${esc(ui.draft?.spell === 'dispel' ? spellName('dispel') : t('cast'))}</span></button>`;
}

// ---------- Spellbook ----------

function seedBook() {
    const s = settings();
    if (s.bookSeeded) return;
    s.bookSeeded = true;
    const L = lang();
    const base = newDraft();
    const mk = (name, over) => ({ id: uid('c'), name, spec: { ...structuredClone(base), ...over, title: name } });
    s.book.push(
        mk(t('seed_water'), { spell: 'polymorph', form: { id: 'cat' }, method: 'stacked', duration: 0,
            trigger: { kind: 'now', turns: 2, chance: 25, text: t('seed_water_cond') },
            source: { kind: 'object', name: RANDOM_OBJECTS[L][0] }, motive: 'punishment' }),
        mk(t('seed_turtle'), { spell: 'polymorph', form: { id: 'turtle' }, duration: 3, motive: 'prank' }),
        mk(t('seed_pocket'), { spell: 'mite', duration: 5, source: { kind: 'object', name: RANDOM_OBJECTS[L][1] }, motive: 'mistake' }),
    );
    save();
}

/** A one-line, game-skill style description. */
export function describeSpec(d, L = lang()) {
    const ko = L === 'ko';
    let s = '';
    const form = d.spell === 'polymorph' ? formLabel(d.form, L) : '';
    if (d.method === 'stacked') {
        s = ko ? `“${d.trigger?.text || '?'}” 때마다 한 단계씩 변해 끝내 ${form}${josa(form, '이/가')} 된다.`
            : `Each time "${d.trigger?.text || '?'}" happens, the target changes one step further, until a full ${form}.`;
    } else if (d.spell === 'polymorph') s = ko ? `대상을 ${form}${josa(form, '으로/로')} 바꾼다.` : `Turns the target into a ${form}.`;
    else if (d.spell === 'titan') s = ko ? '대상의 키를 두 배로 키운다.' : 'Makes the target grow to twice their height.';
    else if (d.spell === 'mite') s = ko ? '대상을 손바닥만 하게 줄인다.' : 'Shrinks the target to palm size.';
    if (d.method !== 'stacked') {
        const tr = d.trigger || {};
        if (d.method === 'curse' || tr.kind === 'condition') s += ko ? ` “${tr.text || '?'}” 하면 발동.` : ` Fires when "${tr.text || '?'}".`;
        else if (tr.kind === 'turns') s += ko ? ` ${tr.turns}턴 뒤 발동.` : ` Fires after ${tr.turns} turns.`;
        else if (tr.kind === 'chance') s += ko ? ` 턴마다 ${tr.chance}% 확률로 발동.` : ` ${tr.chance}% chance to fire each turn.`;
    }
    s += Number(d.duration) > 0 ? (ko ? ` ${d.duration}턴 지속.` : ` Lasts ${d.duration} turns.`) : (ko ? ' 풀릴 때까지 지속.' : ' Lasts until broken.');
    if (d.cause) s += ko ? ` 원인: ${d.cause}` : ` Cause: ${d.cause}`;
    return s;
}

function timingLabel(d) {
    const k = d.method === 'stacked' || d.method === 'curse' ? 'condition' : (d.trigger?.kind || 'now');
    return t(`timing_${k}`);
}

function bookHtml() {
    seedBook();
    const s = settings();
    if (!s.book.length) return `<div class="mage-empty"><p>${esc(t('book_empty'))}</p></div>`;
    return s.book.map(c => {
        const d = c.spec || {};
        const fam = SPELLS[d.spell]?.family || 'change';
        const badge = d.method === 'stacked' ? t('method_stacked') : d.method === 'curse' ? t('method_curse') : '';
        return `<div class="mage-bcard" style="--mage-fam:${famCol(fam)}">`
            + framedIcon(SPELLS[d.spell]?.icon, { skin: s.skin, curse: isCurse(d) })
            + `<div class="mage-bcard-main"><div class="mage-bcard-top"><span class="mage-tag" style="--mage-fam:${famCol(fam)}">${esc(famName(fam))} · ${esc(timingLabel(d))}</span>`
            + (badge ? `<span class="mage-tag mage-tag-curse">${esc(badge)}</span>` : '') + '</div>'
            + `<div class="mage-bcard-name mage-ell">${esc(c.name)}</div><div class="mage-bcard-desc">${esc(c.desc || describeSpec(d))}</div>`
            + `<div class="mage-inline"><button type="button" class="mage-btn mage-small mage-primary" data-mage-card-load="${esc(c.id)}"><span class="mage-ell">${esc(t('load'))}</span></button>`
            + `<button type="button" class="mage-btn mage-small" data-mage-card-edit="${esc(c.id)}"><span class="mage-ell">${esc(t('edit'))}</span></button></div></div></div>`;
    }).join('');
}

function bookFoot() {
    return `<button type="button" class="mage-btn mage-primary mage-wide" data-mage-card-new><span class="mage-ell">+ ${esc(t('new_card'))}</span></button>`;
}

// ---------- actions ----------

function doJudge(effectId, what) {
    const a = judge(effectId, what);
    if (!a) return;
    const v = views().find(x => x.e.id === effectId);
    if (v) {
        if (what === 'stack') toast('info', t('toast_stage', { stage: v.stage, label: v.stage ? STAGES[v.stage - 1].short[lang()] : '' }));
        else if (what === 'release') toast('info', t('toast_release'));
        else toast('info', t('toast_trigger'));
    }
    changed();
}

function doUndo() {
    const a = undo();
    if (a) toast('info', t('undone'));
    changed();
}

function doDispel(effectId) {
    const v = views().find(x => x.e.id === effectId);
    if (!v) return;
    dispel([effectId]); // a dispel is undoable like a judgment
    toast('info', t('toast_dispel', { title: effectTitle(v.e) }));
    changed();
}

function randomName(kind) {
    const L = lang();
    const pool = kind === 'place' ? RANDOM_PLACES[L] : RANDOM_OBJECTS[L];
    return pool[Math.floor(Math.random() * pool.length)];
}

function buildSpec(d) {
    const spec = {
        spell: d.spell,
        duration: Math.max(0, Math.min(99, Number(d.duration) || 0)),
        method: d.method || '',
        trigger: d.method === 'stacked' ? { kind: 'now', text: String(d.trigger.text || '').trim() }
            : { kind: d.method === 'curse' ? 'condition' : d.trigger.kind, turns: Math.max(1, Number(d.trigger.turns) || 2),
                chance: Math.min(100, Math.max(1, Number(d.trigger.chance) || 25)), text: String(d.trigger.text || '').trim() },
        release: { kind: d.release.kind, text: String(d.release.text || '').trim() },
        source: { kind: d.source.kind, name: String(d.source.name || '').trim() },
        motive: d.motive || '',
        cause: String(d.cause || '').trim(),
        visibility: d.visibility || 'all',
        surprise: !!d.surprise && d.method !== 'stacked' && d.trigger.kind !== 'now',
        title: String(d.title || '').trim(),
    };
    if (d.spell === 'polymorph') {
        spec.form = d.form.custom
            ? { custom: true, name: String(d.form.name || '').trim(), can: String(d.form.can || '').trim(), cannot: String(d.form.cannot || '').trim() }
            : { id: d.form.id };
    }
    return spec;
}

function validate(d, forCard = false) {
    if (d.spell === 'polymorph' && d.form.custom && !String(d.form.name || '').trim()) return t('need_form');
    if (d.method === 'stacked' && !String(d.trigger.text || '').trim()) return t('need_cond');
    if (d.method !== 'stacked' && (d.method === 'curse' || d.trigger.kind === 'condition') && !String(d.trigger.text || '').trim()) return t('need_cond');
    if (d.release.kind === 'action' && !String(d.release.text || '').trim()) return t('need_action');
    if (forCard) return '';
    return '';
}

function rememberCustomForm(f) {
    if (!f.custom || !f.name) return;
    const s = settings();
    const same = s.customForms.find(c => c.name === f.name);
    if (same) { same.can = f.can; same.cannot = f.cannot; return; }
    s.customForms.push({ id: uid('f'), name: f.name, can: f.can, cannot: f.cannot });
    if (s.customForms.length > 30) s.customForms.shift();
}

function doCast() {
    const d = ui.draft;
    if (!d || !currentChatId()) return;
    if (d.spell === 'dispel') {
        const opts = dispelOptions(d);
        if (!opts.length) return toast('warning', t('nothing_dispel', { name: targetName(resolveTargets(d)[0]) }));
        let ids = [];
        if (String(d.dispelWhat).startsWith('fam:')) {
            const fam = d.dispelWhat.slice(4);
            const tg = tKey(resolveTargets(d)[0]);
            ids = views().filter(v => v.status !== 'ended' && tKey(v.e.target) === tg && SPELLS[v.e.spell]?.family === fam).map(v => v.e.id);
        } else ids = [d.dispelWhat];
        dispel(ids, String(d.cause || '').trim() || sourceText(d));
        toast('success', t('toast_dispel_n', { n: ids.length }));
        ui.cause.preview = '';
        ui.view = 'status';
        return changed();
    }
    const err = validate(d);
    if (err) return toast('warning', err);
    const targets = resolveTargets(d);
    if (!targets.length) return toast('warning', t('need_target'));
    const list = views();
    if (liveCount(list) + targets.length > MAX_EFFECTS) return toast('warning', t('full', { max: MAX_EFFECTS }));
    const size = new Set(['titan', 'mite']);
    for (const tg of targets) {
        const clash = list.find(v => v.status !== 'ended' && tKey(v.e.target) === tKey(tg)
            && (v.e.spell === d.spell || (size.has(v.e.spell) && size.has(d.spell))));
        if (clash) return toast('warning', t('clash', { name: targetName(tg), title: effectTitle(clash.e) }));
    }
    const spec = buildSpec(d);
    if (['object', 'place'].includes(spec.source.kind) && !spec.source.name) spec.source.name = randomName(spec.source.kind);
    if (spec.form?.custom) rememberCustomForm(spec.form);
    const ids = cast(spec, targets);
    ui.opened = new Set(ids.slice(0, 1));
    ui.allClosed = false;
    toast('success', spec.surprise ? t('toast_cast_secret') : t('toast_cast', { title: effectTitle({ ...spec, target: targets[0] }) }));
    ui.cause.preview = '';
    ui.draft = { ...newDraft(), target: d.target };
    ui.view = 'status';
    changed();
}

function sourceText(d) {
    const k = d.source?.kind;
    if (!k || k === 'unknown') return '';
    return [t(`src_${k}`), d.source.name].filter(Boolean).join(' · ');
}

function spellEnglish(d) {
    if (d.spell === 'dispel') return 'Dispel (breaks a magic effect)';
    const who = targetName(resolveTargets({ ...d, target: d.target === 'random' || d.target === 'both' ? 'user' : d.target })[0]);
    if (d.spell === 'polymorph') {
        const f = d.form.custom ? (d.form.name || 'something') : (formById(d.form.id)?.name.en || 'cat');
        return d.method === 'stacked' ? `A curse that slowly turns ${who} into a ${f}, step by step, each time "${d.trigger.text}" happens` : `${who} is turned into a ${f}`;
    }
    return d.spell === 'titan' ? `${who} grows to twice their height` : `${who} shrinks to palm size`;
}

async function doCause() {
    const c = ui.cause;
    if (c.busy) { c.ctl?.abort(); c.busy = false; return rerender(); }
    const d = ui.draft;
    const chatId = currentChatId();
    c.busy = true; c.preview = ''; c.ctl = new AbortController();
    rerender();
    try {
        const res = await askCause({ spellText: spellEnglish(d), sourceText: sourceText(d), motiveText: d.motive ? t(`mot_${d.motive}`) : '', lang: lang() }, c.ctl.signal);
        if (currentChatId() !== chatId) return; // the chat changed meanwhile
        if (!res.text) toast('warning', t('ai_empty'));
        c.preview = res.text;
    } catch (e) {
        if (e?.name !== 'AbortError' && !c.ctl?.signal.aborted) toast('error', aiError(e));
    } finally {
        c.busy = false; c.ctl = null;
        rerender();
    }
}

function aiError(e) {
    if (String(e?.message) === 'NO_PROFILE_API') return t('ai_no_profile_api');
    return t('ai_fail', { msg: String(e?.message || e).slice(0, 160) });
}

async function doAiForm() {
    const d = ui.draft;
    const name = String(d.form.name || '').trim();
    if (!name) return toast('warning', t('need_form'));
    ui.formBusy = new AbortController();
    rerender();
    try {
        const r = await askForm(name, lang(), ui.formBusy.signal);
        if (!r.can && !r.cannot) toast('warning', t('ai_empty'));
        if (r.can) d.form.can = r.can;
        if (r.cannot) d.form.cannot = r.cannot;
    } catch (e) {
        if (e?.name !== 'AbortError') toast('error', aiError(e));
    } finally {
        ui.formBusy = null;
        rerender();
    }
}

function randomForm() {
    const s = settings();
    const L = lang();
    const all = [...FORMS.map(f => `b:${f.id}`), ...s.customForms.map(c => `c:${c.id}`)];
    let pool = s.randomPool.filter(x => all.includes(x));
    if (!pool.length) pool = FORMS.map(f => `b:${f.id}`);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setForm(pick);
    toast('info', t('form_rolled', { form: formLabel(ui.draft.form, L) }));
}

function setForm(v) {
    const d = ui.draft;
    if (v === 'new') d.form = { custom: true, name: '', can: '', cannot: '' };
    else if (v.startsWith('c:')) {
        const c = settings().customForms.find(x => `c:${x.id}` === v);
        d.form = c ? { custom: true, savedId: c.id, name: c.name, can: c.can, cannot: c.cannot } : { id: 'cat' };
    } else d.form = { id: v.slice(2) };
}

function applyMotive(d) {
    const sug = MOTIVE_SUGGEST[d.motive];
    if (!sug) return;
    if (sug.duration !== undefined && !d.touched.duration) d.duration = sug.duration;
    if (sug.trigger && !d.touched.trigger && d.method === '') d.trigger.kind = sug.trigger;
    if (sug.release && !d.touched.release) d.release.kind = sug.release;
}

function loadCard(id, edit) {
    const c = settings().book.find(x => x.id === id);
    if (!c) return;
    const keepTarget = ui.draft?.target;
    ui.draft = { ...newDraft(), ...structuredClone(c.spec), touched: {} };
    ui.draft.title = c.name;
    if (keepTarget && !edit) ui.draft.target = keepTarget;
    if (!ui.draft.trigger) ui.draft.trigger = { kind: 'now', turns: 2, chance: 25, text: '' };
    ui.details = edit || !!(ui.draft.method || ui.draft.trigger.kind !== 'now');
    ui.editCard = edit ? id : null;
    ui.view = 'cast';
    renderWindow();
}

function saveCard() {
    const d = ui.draft;
    const err = validate(d, true);
    if (err) return toast('warning', err);
    const s = settings();
    const name = String(d.title || '').trim() || effectTitle({ ...buildSpec(d), title: '' });
    const spec = { ...buildSpec(d), title: name };
    delete spec.target;
    if (ui.editCard) {
        const c = s.book.find(x => x.id === ui.editCard);
        if (c) { c.name = name; c.spec = spec; delete c.desc; }
    } else s.book.unshift({ id: uid('c'), name, spec });
    if (spec.form?.custom) rememberCustomForm(spec.form);
    save();
    toast('success', t('card_saved'));
    ui.editCard = null;
    ui.draft = newDraft();
    ui.view = 'book';
    renderWindow();
}

async function deleteCard() {
    const s = settings();
    const c = s.book.find(x => x.id === ui.editCard);
    if (!c) return;
    const ok = await confirmBox(t('card_delete_q', { name: c.name }));
    if (!ok) return;
    s.book = s.book.filter(x => x.id !== c.id);
    save();
    ui.editCard = null;
    ui.draft = newDraft();
    ui.view = 'book';
    renderWindow();
}

async function confirmBox(text) {
    try {
        const c = ctx();
        if (c.callGenericPopup) return !!(await c.callGenericPopup(esc(text), c.POPUP_TYPE?.CONFIRM ?? 2));
    } catch { /* ignore */ }
    return window.confirm(text);
}

function onWinClick(e) {
    const q = (sel) => e.target.closest(sel);
    let el;
    if (q('[data-mage-close]')) return closeWindow();
    if (q('[data-mage-collapse]')) return setCollapsed(!settings().winCollapsed);
    if ((el = q('[data-mage-view]'))) {
        if (el.closest('.mage-head')) return;
        ui.view = el.dataset.mageView;
        if (ui.view !== 'cast') ui.editCard = null;
        if (ui.view === 'cast' && (!ui.draft || ui.editCard !== null)) { ui.editCard = null; ui.draft = newDraft(); }
        if (settings().winCollapsed) { settings().winCollapsed = false; save(); }
        renderWindow();
        return place();
    }
    if ((el = q('[data-mage-toggle]'))) {
        const id = el.dataset.mageToggle;
        if (ui.opened.has(id)) ui.opened.delete(id); else ui.opened.add(id);
        ui.allClosed = !views().some(v => ui.opened.has(v.e.id));
        return rerender();
    }
    if ((el = q('[data-mage-judge]'))) return doJudge(el.dataset.mageJudge, el.dataset.what);
    if ((el = q('[data-mage-dispel]'))) return doDispel(el.dataset.mageDispel);
    if (q('[data-mage-undo]')) return doUndo();
    if ((el = q('[data-mage-dur]'))) { ui.draft.duration = Number(el.dataset.mageDur); ui.draft.touched.duration = true; return rerender(); }
    if (q('[data-mage-details]')) { ui.details = !ui.details; return rerender(); }
    if (q('[data-mage-randform]')) { randomForm(); return rerender(); }
    if (q('[data-mage-aiform]')) return doAiForm();
    if (q('[data-mage-cause]')) return doCause();
    if (q('[data-mage-cause-apply]')) { ui.draft.cause = ui.cause.preview; ui.cause.preview = ''; return rerender(); }
    if (q('[data-mage-cause-close]')) { ui.cause.preview = ''; return rerender(); }
    if (q('[data-mage-cast]')) return doCast();
    if (q('[data-mage-savecard]')) { ui.editCard = ''; return rerender(); }
    if ((el = q('[data-mage-card-load]'))) return loadCard(el.dataset.mageCardLoad, false);
    if ((el = q('[data-mage-card-edit]'))) return loadCard(el.dataset.mageCardEdit, true);
    if (q('[data-mage-card-new]')) { ui.draft = newDraft(); ui.editCard = ''; ui.details = true; ui.view = 'cast'; return renderWindow(); }
    if (q('[data-mage-card-save]')) return saveCard();
    if (q('[data-mage-card-cancel]')) { ui.editCard = null; ui.draft = newDraft(); ui.view = 'book'; return renderWindow(); }
    if (q('[data-mage-card-del]')) return deleteCard();
}

function onWinChange(e) {
    const f = e.target.dataset?.f;
    const d = ui.draft;
    if (!f || !d) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    switch (f) {
        case 'target': d.target = v; d.dispelWhat = ''; break;
        case 'spell':
            d.spell = v;
            if (v !== 'polymorph' && d.method === 'stacked') d.method = '';
            if (v === 'dispel') { d.dispelWhat = ''; if (['both', 'random'].includes(d.target)) d.target = 'user'; }
            break;
        case 'formSel': setForm(v); break;
        case 'dispelWhat': d.dispelWhat = v; return;
        case 'srcKind': d.source.kind = v; break;
        case 'motive': d.motive = v; applyMotive(d); break;
        case 'method':
            d.method = v;
            if (v === 'stacked' && !d.touched.duration) d.duration = 0;
            if (v === 'curse') d.trigger.kind = 'condition';
            break;
        case 'trigKind': d.trigger.kind = v; d.touched.trigger = true; break;
        case 'relKind': d.release.kind = v; d.touched.release = true; break;
        case 'vis': d.visibility = v; return;
        case 'surprise': d.surprise = !!v; return;
        case 'customTurns': {
            const n = Math.round(Number(v));
            if (n >= 1) { d.duration = Math.min(99, n); d.touched.duration = true; }
            break;
        }
        default: onWinInput(e); return;
    }
    rerender();
}

function onWinInput(e) {
    const f = e.target.dataset?.f;
    const d = ui.draft;
    if (!f || !d) return;
    const v = e.target.value;
    switch (f) {
        case 'title': d.title = v; break;
        case 'formName': d.form.name = v; break;
        case 'formCan': d.form.can = v; break;
        case 'formCannot': d.form.cannot = v; break;
        case 'srcName': d.source.name = v; break;
        case 'trigTurns': d.trigger.turns = v; break;
        case 'trigChance': d.trigger.chance = v; break;
        case 'trigText': d.trigger.text = v; break;
        case 'relText': d.release.text = v; break;
        case 'cause': d.cause = v; break;
        default: break;
    }
}

// ---------- refresh ----------

function changed() {
    onChangeHook();
}

/** Re-draw what is on screen after anything changed. */
export function refresh() {
    const s = settings();
    const chatId = currentChatId();
    const all = s.enabled && chatId ? views() : [];
    // Toast when a waiting effect fires.
    if (ui.lastChat === chatId) {
        for (const v of all) {
            if (ui.lastStatus.get(v.e.id) === 'pending' && v.status === 'active') {
                if (v.e.surprise) {
                    const what = v.e.spell === 'polymorph' ? `${spellName('polymorph')}: ${formLabel(v.e.form)}` : spellName(v.e.spell);
                    toast('info', t('fired_surprise', { what, dur: v.e.duration > 0 ? '???' : '∞' }));
                } else toast('info', t('fired', { title: effectTitle(v.e) }));
                ui.opened.add(v.e.id);
            }
        }
    } else {
        ui.lastChat = chatId;
        ui.opened.clear();
        ui.allClosed = false;
        ui.cause.ctl?.abort();
        ui.cause.preview = '';
        if (ui.editCard === null) ui.draft = null;
    }
    ui.lastStatus = new Map(all.map(v => [v.e.id, v.status]));
    renderBar(shown(all));
    if (ui.open) {
        if (ui.view === 'cast' && !ui.draft) ui.draft = newDraft();
        if (ui.view === 'cast' && winEl?.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
            renderHeadOnly();
        } else rerender();
    }
}

function renderHeadOnly() {
    // Typing in the cast form: keep the form as it is, refresh only the tab counts.
    const live = liveCount(views());
    const tab = winEl.querySelector('[data-mage-view="status"] span');
    if (tab) tab.textContent = t('tab_status', { n: live, max: MAX_EFFECTS });
}

export function disableAll() {
    closeWindow();
    if (barEl) { barEl.hidden = true; barEl.innerHTML = ''; }
}

export function rerenderAll() {
    refresh();
    if (ui.open) renderWindow();
}

export { removeEffect };
