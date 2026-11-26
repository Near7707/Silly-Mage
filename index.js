// Mage — plant "magic events" in a SillyTavern chat and keep the AI from forgetting them.
// Uses only SillyTavern's public paths (getContext, events, extension prompts). It never writes
// to character cards, chat files or chat metadata; everything lives in extension settings.

import { t, setLanguage, lang, LANGUAGES } from './src/i18n.js';
import { ctx, settings, save, uiLang, chooseLang, onChatRenamed, onChatDeleted, exportData, importData } from './src/store.js';
import { views, setSent, markDelivered, copyFromParent } from './src/engine.js';
import { buildPrompt } from './src/describe.js';
import { FORMS } from './src/spells.js';
import { getProfiles } from './src/ai.js';
import { MAGE_GLYPH } from './src/icons.js';
import { resetPos } from './src/win.js';
import { mountBar, refresh, openWindow, closeWindow, isOpen, setOnChange, disableAll, rerenderAll } from './src/ui.js';

export const VERSION = '0.1.0';
const PROMPT_KEY = 'mage_effects';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- the note for the AI ----------

let pendingGen = '';

/** Rebuild the note. During a swipe / regenerate / continue, the last message is left out. */
function updatePrompt(genType = pendingGen, live = false) {
    const c = ctx();
    const s = settings();
    let text = '';
    if (s.enabled) {
        const type = String(genType || '');
        const skipLast = ['swipe', 'regenerate', 'continue'].includes(type);
        const withNotes = !['quiet', 'impersonate'].includes(type);
        const built = buildPrompt(views({ skipLast }), { withNotes });
        text = built.text;
        if (live) setSent(withNotes ? built.notes : []);
    }
    try {
        // 1 = in chat, depth 1 (close to the reply, so it is not forgotten), no world-info scan, system role.
        c.setExtensionPrompt(PROMPT_KEY, text, 1, 1, false, 0);
    } catch (e) { console.error('[Mage] prompt', e); }
}

// ---------- refreshing ----------

let timer = 0;
function refreshSoon() {
    clearTimeout(timer);
    timer = setTimeout(() => {
        try { refresh(); updatePrompt(); } catch (e) { console.error('[Mage]', e); }
    }, 60);
}

function changedNow() {
    try { refresh(); updatePrompt(); } catch (e) { console.error('[Mage]', e); }
}

// ---------- settings panel ----------

function optionList(pairs, cur) {
    return pairs.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

function profileOptions() {
    const s = settings();
    const profiles = getProfiles();
    let h = optionList([['', t('set_profile_current')], ...profiles.map(p => [p.id, p.name])], s.profileId);
    if (s.profileId && !profiles.some(p => p.id === s.profileId)) h += `<option value="${esc(s.profileId)}" selected>${esc(t('set_profile_missing'))}</option>`;
    return h;
}

function poolHtml() {
    const s = settings();
    const L = lang();
    const items = [...FORMS.map(f => [`b:${f.id}`, f.name[L] || f.name.en]), ...s.customForms.map(c => [`c:${c.id}`, c.name])];
    return items.map(([id, name]) => `<label class="mage-pchip"><input type="checkbox" data-mage-pool="${esc(id)}"${s.randomPool.includes(id) ? ' checked' : ''}><span>${esc(name)}</span></label>`).join('');
}

function panelHtml() {
    const s = settings();
    return `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>${esc(t('ext_name'))}</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content mage-panel-body">
          <div class="mage-panel-hint">${esc(t('set_hint'))}</div>
          <button type="button" class="menu_button mage-panel-btn" data-mage-p="open">${MAGE_GLYPH}<span>${esc(t('set_open'))}</span></button>
          <label class="checkbox_label mage-panel-check"><input type="checkbox" data-mage-p="enabled"${s.enabled ? ' checked' : ''}><span>${esc(t('set_enabled'))}</span></label>
          <label class="mage-panel-field"><span>${esc(t('set_language'))}</span>
            <span class="mage-sel"><select class="text_pole mage-select" data-mage-p="lang">${optionList(LANGUAGES.map(l => [l.id, l.label]), lang())}</select></span></label>
          <label class="mage-panel-field"><span>${esc(t('set_skin'))}</span>
            <span class="mage-sel"><select class="text_pole mage-select" data-mage-p="skin">${optionList(['theme', 'tome', 'cursed'].map(k => [k, t(`skin_${k}`)]), s.skin)}</select></span></label>
          <label class="mage-panel-field"><span>${esc(t('set_world'))}</span>
            <span class="mage-sel"><select class="text_pole mage-select" data-mage-p="world">${optionList(['common', 'rare', 'none'].map(k => [k, t(`world_${k}`)]), s.world)}</select></span></label>
          <div class="mage-panel-hint">${esc(t(`world_hint_${s.world}`))}</div>
          <label class="checkbox_label mage-panel-check"><input type="checkbox" data-mage-p="trickster"${s.allowTrickster ? ' checked' : ''}><span>${esc(t('set_trickster'))}</span></label>
          <div class="mage-panel-sub">${esc(t('set_pool'))}</div>
          <div class="mage-pool">${poolHtml()}</div>
          <div class="mage-panel-hint">${esc(t('set_pool_hint'))}</div>
          <div class="mage-panel-sub">${esc(t('set_ai'))}</div>
          <label class="mage-panel-field"><span>${esc(t('set_profile'))}</span>
            <span class="mage-sel"><select class="text_pole mage-select" data-mage-p="profile">${profileOptions()}</select></span></label>
          <label class="checkbox_label mage-panel-check"><input type="checkbox" data-mage-p="preset"${s.sendPreset ? ' checked' : ''}><span>${esc(t('set_preset'))}</span></label>
          <div class="mage-panel-hint">${esc(t('set_preset_hint'))}</div>
          <label class="mage-panel-field"><span>${esc(t('set_reasoning'))}</span>
            <span class="mage-sel"><select class="text_pole mage-select" data-mage-p="reasoning">${optionList(['default', 'low', 'medium', 'high'].map(k => [k, t(`reasoning_${k}`)]), s.reasoning)}</select></span></label>
          <label class="mage-panel-field"><span>${esc(t('set_context'))}</span>
            <input class="text_pole mage-panel-num" type="number" inputmode="numeric" min="0" max="20" data-mage-p="context" value="${esc(s.contextCount)}"></label>
          <button type="button" class="menu_button mage-panel-btn" data-mage-p="resetpos"><span>${esc(t('set_reset_pos'))}</span></button>
          <div class="mage-panel-sub">${esc(t('set_backup'))}</div>
          <div class="mage-panel-row">
            <button type="button" class="menu_button mage-panel-btn" data-mage-p="export"><span>${esc(t('set_export'))}</span></button>
            <button type="button" class="menu_button mage-panel-btn" data-mage-p="import"><span>${esc(t('set_import'))}</span></button>
            <input type="file" accept=".json,application/json" data-mage-p="file" hidden>
          </div>
          <div class="mage-panel-hint mage-panel-version">${esc(t('version', { v: VERSION }))}</div>
        </div>
      </div>`;
}

function mountPanel() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;
    let panel = document.getElementById('mage_settings');
    const wasOpen = panel?.querySelector('.inline-drawer-content')?.style.display === 'block';
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'mage_settings';
        panel.className = 'mage-panel';
        host.appendChild(panel);
        panel.addEventListener('click', onPanelClick);
        panel.addEventListener('change', onPanelChange);
        panel.addEventListener('focusin', (e) => {
            // Profiles may be added after the panel was drawn.
            const sel = e.target.closest('[data-mage-p="profile"]');
            if (sel) sel.innerHTML = profileOptions();
        });
    }
    panel.innerHTML = panelHtml();
    if (wasOpen) {
        const content = panel.querySelector('.inline-drawer-content');
        content.style.display = 'block';
        panel.querySelector('.inline-drawer-icon')?.classList.replace('down', 'up');
    }
}

async function onPanelClick(e) {
    const b = e.target.closest('[data-mage-p]');
    if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
    const k = b.dataset.mageP;
    if (k === 'open') openWindow(views().length ? 'status' : 'cast');
    if (k === 'resetpos') { resetPos(); globalThis.toastr?.info?.(t('pos_reset'), 'Mage'); }
    if (k === 'export') {
        const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mage-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    if (k === 'import') b.closest('.mage-panel-row').querySelector('[data-mage-p="file"]').click();
}

async function onPanelChange(e) {
    const el = e.target;
    const s = settings();
    const pool = el.dataset.magePool;
    if (pool) {
        s.randomPool = el.checked ? [...new Set([...s.randomPool, pool])] : s.randomPool.filter(x => x !== pool);
        return save();
    }
    switch (el.dataset.mageP) {
        case 'enabled':
            s.enabled = el.checked;
            save();
            if (!s.enabled) disableAll();
            return changedNow();
        case 'lang':
            chooseLang(el.value);
            setLanguage(el.value);
            mountPanel(); mountWand(); rerenderAll();
            return;
        case 'skin': s.skin = el.value; save(); return rerenderAll();
        case 'world': s.world = el.value; save(); mountPanel(); return changedNow();
        case 'trickster': s.allowTrickster = el.checked; save(); return rerenderAll();
        case 'profile': s.profileId = el.value; return save();
        case 'preset': s.sendPreset = el.checked; return save();
        case 'reasoning': s.reasoning = el.value; return save();
        case 'context': s.contextCount = Math.min(20, Math.max(0, Math.round(Number(el.value) || 0))); el.value = s.contextCount; return save();
        case 'file': {
            const file = el.files?.[0];
            el.value = '';
            if (!file) return;
            try {
                const data = JSON.parse(await file.text());
                if (!data || data.mage === undefined) throw new Error('bad');
                const c = ctx();
                const ok = c.callGenericPopup ? await c.callGenericPopup(esc(t('import_q')), c.POPUP_TYPE?.CONFIRM ?? 2) : window.confirm(t('import_q'));
                if (!ok) return;
                importData(data);
                setLanguage(uiLang());
                mountPanel(); mountWand(); rerenderAll(); updatePrompt();
                globalThis.toastr?.success?.(t('imported'), 'Mage');
            } catch {
                globalThis.toastr?.error?.(t('import_fail'), 'Mage');
            }
            return;
        }
        default:
    }
}

function mountWand() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    let item = document.getElementById('mage_wand');
    if (!item) {
        item = document.createElement('div');
        item.id = 'mage_wand';
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = `<div class="extensionsMenuExtensionButton mage-wand-ico">${MAGE_GLYPH}</div><span></span>`;
        item.addEventListener('click', () => {
            if (isOpen()) return closeWindow();
            openWindow(views().length ? 'status' : 'cast');
        });
        menu.appendChild(item);
    }
    item.querySelector('span').textContent = t('ext_name');
}

// ---------- events ----------

function registerEvents() {
    const { eventSource } = ctx();
    const ev = ctx().eventTypes || ctx().event_types;
    const on = (name, fn) => { if (name) eventSource.on(name, (...a) => { try { return fn(...a); } catch (e) { console.error('[Mage]', e); } }); };

    on(ev.CHAT_CHANGED, () => { copyFromParent(); mountBar(); changedNow(); });
    for (const name of [ev.MESSAGE_DELETED, ev.MESSAGE_SWIPED, ev.MESSAGE_EDITED, ev.MESSAGE_UPDATED,
        ev.USER_MESSAGE_RENDERED, ev.CHARACTER_MESSAGE_RENDERED, ev.MORE_MESSAGES_LOADED, ev.CHAT_LOADED, ev.MESSAGE_SENT]) {
        on(name, refreshSoon);
    }
    on(ev.MESSAGE_RECEIVED, (mesId) => { markDelivered(mesId); refreshSoon(); });
    on(ev.GENERATION_STARTED, (type, _opts, dryRun) => {
        if (!dryRun) pendingGen = String(type || 'normal');
        updatePrompt(dryRun ? type : pendingGen, !dryRun);
    });
    // The notes that went out stay waiting for the reply (MESSAGE_RECEIVED); the next generation replaces them.
    for (const name of [ev.GENERATION_ENDED, ev.GENERATION_STOPPED]) {
        on(name, () => { pendingGen = ''; refreshSoon(); });
    }
    on(ev.CHAT_RENAMED, (data) => { onChatRenamed(data?.oldFileName, data?.newFileName); changedNow(); });
    on(ev.CHAT_DELETED, (name) => onChatDeleted(name));
    on(ev.GROUP_CHAT_DELETED, (name) => onChatDeleted(name));
    on(ev.APP_READY, () => { mountBar(); mountWand(); changedNow(); });
}

async function init() {
    settings();
    setLanguage(uiLang());
    mountPanel();
    mountWand();
    mountBar();
    setOnChange(changedNow);
    registerEvents();
    changedNow();
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) closeWindow();
    });
}

if (globalThis.jQuery) globalThis.jQuery(() => { init().catch(e => console.error('[Mage] init', e)); });
else init().catch(e => console.error('[Mage] init', e));
