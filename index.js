// Mage — plant "magic events" in a SillyTavern chat and keep the AI from forgetting them.
// Uses only SillyTavern's public paths (getContext, events, extension prompts). It never writes
// to character cards, chat files or chat metadata; everything lives in extension settings.

import { t, setLanguage } from './src/i18n.js';
import { ctx, settings, uiLang, onChatRenamed, onChatDeleted } from './src/store.js';
import { views, setSent, markDelivered, copyFromParent } from './src/engine.js';
import { buildPrompt } from './src/describe.js';
import { MAGE_GLYPH } from './src/icons.js';
import { VERSION, prefsHtml, prefsClick, prefsChange, prefsFocus, setPrefsHooks } from './src/prefs.js';
import { maybeCheck, setJudgeHook } from './src/judge.js';
import { mountBar, refresh, openWindow, closeWindow, isOpen, setOnChange, disableAll, rerenderAll } from './src/ui.js';

export { VERSION };
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

// ---------- AI judging: one small check after each finished AI reply ----------

let generating = false;
let checkTimer = 0;
function checkSoon() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
        if (generating) return; // the end of this generation schedules it again
        maybeCheck().catch(e => console.error('[Mage] judge', e));
    }, 800);
}

// ---------- settings panel ----------

function panelHtml() {
    return `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>${esc(t('ext_name'))}</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="mage-phint">${esc(t('set_hint'))}</div>
          <button type="button" class="menu_button mage-pbtn mage-popen" data-mage-open>${MAGE_GLYPH}<span class="mage-ell">${esc(t('set_open'))}</span></button>
          ${prefsHtml(false)}
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
        panel.addEventListener('click', (e) => {
            if (e.target.closest('[data-mage-open]')) return openWindow(views().length ? 'status' : 'cast');
            prefsClick(e);
        });
        panel.addEventListener('change', prefsChange);
        panel.addEventListener('focusin', prefsFocus);
    }
    panel.innerHTML = panelHtml();
    if (wasOpen) {
        panel.querySelector('.inline-drawer-content').style.display = 'block';
        panel.querySelector('.inline-drawer-icon')?.classList.replace('down', 'up');
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
    on(ev.MESSAGE_RECEIVED, (mesId) => { markDelivered(mesId); refreshSoon(); checkSoon(); });
    on(ev.GENERATION_STARTED, (type, _opts, dryRun) => {
        if (!dryRun) { pendingGen = String(type || 'normal'); generating = true; }
        updatePrompt(dryRun ? type : pendingGen, !dryRun);
    });
    // The notes that went out stay waiting for the reply (MESSAGE_RECEIVED); the next generation replaces them.
    for (const name of [ev.GENERATION_ENDED, ev.GENERATION_STOPPED]) {
        on(name, () => { pendingGen = ''; generating = false; refreshSoon(); });
    }
    on(ev.GENERATION_ENDED, checkSoon);
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
    setJudgeHook(changedNow);
    setPrefsHooks({
        redrawAll: () => { mountPanel(); mountWand(); rerenderAll(); updatePrompt(); },
        turnedOff: disableAll,
    });
    registerEvents();
    changedNow();
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) closeWindow();
    });
}

if (globalThis.jQuery) globalThis.jQuery(() => { init().catch(e => console.error('[Mage] init', e)); });
else init().catch(e => console.error('[Mage] init', e));
