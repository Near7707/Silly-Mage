// Mage — plant "magic events" in a SillyTavern chat and keep the AI from forgetting them.
// Uses only SillyTavern's public paths (getContext, events, extension prompts). It never writes
// to character cards, chat files or chat metadata; everything lives in extension settings.

import { t, setLanguage } from './src/i18n.js';
import { ctx, settings, uiLang, onChatRenamed, onChatDeleted, currentChatId } from './src/store.js';
import { views, setSent, markDelivered, copyFromParent, chatView } from './src/engine.js';
import { rollDice, setDice, getDice, castByCharacter } from './src/casters.js';
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
        // B. The dice: a character may cast this turn (only for a new reply to my message, or a re-roll of it).
        const dice = withNotes && ['normal', 'swipe', 'regenerate'].includes(type) && s.judgeMode !== 'off' ? diceFor(skipLast) : null;
        const built = buildPrompt(views({ skipLast }), { withNotes, once: dice ? [dice.text] : [] });
        text = built.text;
        if (live) setSent(withNotes ? built.notes : []);
        if (live) setDice(dice ? { ...dice, chatId: currentChatId(),
            label: t(dice.spell === 'luck' && dice.variant === 'bad' ? 'spell_jinx' : `spell_${dice.spell}`) } : null);
    }
    try {
        // 1 = in chat, depth 1 (close to the reply, so it is not forgotten), no world-info scan, system role.
        c.setExtensionPrompt(PROMPT_KEY, text, 1, 1, false, 0);
    } catch (e) { console.error('[Mage] prompt', e); }
}

let speaker = null; // group chats: the member about to reply (GROUP_MEMBER_DRAFTED)

function diceFor(skipLast) {
    const c = ctx();
    let avatar = null;
    try {
        if (c.groupId) avatar = speaker;
        else if (c.characterId !== undefined) avatar = c.characters?.[c.characterId]?.avatar || null;
    } catch { /* ignore */ }
    try { return rollDice(chatView(skipLast), avatar, currentChatId(), skipLast); } catch (e) { console.error('[Mage] dice', e); return null; }
}

/**
 * A character cast in secret (2-C-1): the story does not show it, so the AI judging cannot
 * notice it. It goes in as soon as the reply it was asked for arrives, bound to that reply
 * (re-roll it and the spell is gone; the same roll comes back with the re-roll).
 */
function sneakCast(mesId) {
    const d = getDice(currentChatId());
    if (!d?.sneak) return;
    const list = ctx().chat || [];
    const m = list[Number(mesId)];
    if (!m || m.is_user || m.is_system || Number(mesId) !== list.length - 1) return;
    castByCharacter({ ...d, sneak: true });
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

    on(ev.CHAT_CHANGED, () => { speaker = null; setDice(null); copyFromParent(); mountBar(); changedNow(); });
    on(ev.GROUP_MEMBER_DRAFTED, (chId) => {
        try { speaker = ctx().characters?.[Number(chId)]?.avatar || null; } catch { speaker = null; }
    });
    for (const name of [ev.MESSAGE_DELETED, ev.MESSAGE_SWIPED, ev.MESSAGE_EDITED, ev.MESSAGE_UPDATED,
        ev.USER_MESSAGE_RENDERED, ev.CHARACTER_MESSAGE_RENDERED, ev.MORE_MESSAGES_LOADED, ev.CHAT_LOADED, ev.MESSAGE_SENT]) {
        on(name, refreshSoon);
    }
    on(ev.MESSAGE_RECEIVED, (mesId) => { markDelivered(mesId); sneakCast(mesId); refreshSoon(); checkSoon(); });
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
