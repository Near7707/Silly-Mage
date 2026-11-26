// Mage data lives only in extension settings (never in character cards, chat files or chat metadata).

export const MODULE = 'mage';
export const FORMAT = 2;

const DEFAULTS = Object.freeze({
    format: FORMAT,
    lang: 'en',
    langChosen: false,      // false = follow SillyTavern's language
    enabled: true,
    skin: 'theme',          // theme | tome | cursed
    world: 'rare',          // common | rare | none
    allowTrickster: false,  // "trickster" as a source can break modern settings
    profileId: '',          // connection profile for 🎲 cause / custom form ('' = current API)
    sendPreset: false,
    reasoning: 'low',
    contextCount: 6,        // recent messages the 🎲 cause reads
    randomPool: [],         // form ids for 🎲 (empty = all)
    customForms: [],        // [{ id, name, can, cannot }]
    book: [],               // Spellbook cards
    bookSeeded: false,
    winPos: {},             // { phone: {x,y}, pc: {x,y} }
    winCollapsed: false,
    // magic rules (stage 2-A)
    rules: false,           // Mana · Cooldown · Loadout · Reload (off = free, as before)
    maxMana: 10,
    loadoutSize: 6,
    strictRelease: true,    // magic I did not cast ends only the set way (an extra line for the AI)
    // AI judging (stage 2-B-1)
    judgeMode: 'suggest',   // off | suggest | auto — conditions checked by a small side request after each AI reply
    judgeUnbind: true,      // also notice when the story claims a spell broke
    judgeProfile: 'same',   // 'same' = the profile of 🎲 cause, '' = current API, or a profile id
    judgeCount: 4,          // recent messages the check reads
    // chatId -> { effects, actions, undoId, reloads: [{id,t,at}], loadout: string[]|null, loadAdds: [{spell,t,at}],
    //            casters: { avatar: { spells, every, duration, dice, chance } }, casterLog }
    chats: {},
    // branch chats already copied from their parent: chatId -> parent chatId
    branchDone: {},
});

let ctxGetter = () => globalThis.SillyTavern?.getContext?.();
export function setContextGetter(fn) { ctxGetter = fn; }
export function ctx() { return ctxGetter(); }

export function settings() {
    const all = ctx().extensionSettings;
    if (!all[MODULE] || typeof all[MODULE] !== 'object') all[MODULE] = structuredClone(DEFAULTS);
    return migrate(all[MODULE]);
}

export function migrate(s) {
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    if (typeof s.format !== 'number') s.format = 1;
    // Format 2 (0.3.0): only magic I cast can be dispelled; for the rest "Dispel" becomes "turns run out".
    if (!['theme', 'tome', 'cursed'].includes(s.skin)) s.skin = 'theme';
    if (!['common', 'rare', 'none'].includes(s.world)) s.world = 'rare';
    for (const k of ['randomPool', 'customForms', 'book']) if (!Array.isArray(s[k])) s[k] = [];
    for (const k of ['chats', 'branchDone', 'winPos']) {
        if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
    }
    for (const st of Object.values(s.chats)) {
        if (!st || typeof st !== 'object') continue;
        if (!Array.isArray(st.effects)) st.effects = [];
        if (!Array.isArray(st.actions)) st.actions = [];
        if (st.undoId === undefined) st.undoId = null;
        if (!Array.isArray(st.reloads)) st.reloads = [];
        if (!Array.isArray(st.loadAdds)) st.loadAdds = [];
        if (!Array.isArray(st.ledger)) st.ledger = [];
        if (!Array.isArray(st.checks)) st.checks = [];
        if (!st.casters || typeof st.casters !== 'object' || Array.isArray(st.casters)) st.casters = {};
        if (!Array.isArray(st.casterLog)) st.casterLog = [];
        if (st.loadout !== null && !Array.isArray(st.loadout)) st.loadout = null;
    }
    if (s.format < 2) {
        for (const st of Object.values(s.chats)) for (const e of st?.effects || []) fixRelease(e);
        for (const c of s.book) {
            if (!c?.spec) continue;
            fixRelease(c.spec);
            // A card that could now never end (not mine, no end, ended by Dispel before) ends by telling the truth instead.
            const sp = c.spec;
            if (sp.release.kind === 'time' && Number(sp.duration) === 0 && !['sleep', 'invisibility'].includes(sp.spell)) sp.release = { kind: 'truth', text: '' };
        }
        s.format = 2;
    }
    if (!['off', 'suggest', 'auto'].includes(s.judgeMode)) s.judgeMode = 'suggest';
    if (typeof s.judgeProfile !== 'string') s.judgeProfile = 'same';
    s.judgeCount = Math.min(20, Math.max(2, Math.round(Number(s.judgeCount) || 4)));
    s.contextCount = Math.min(20, Math.max(0, Number(s.contextCount) || 0));
    s.maxMana = Math.min(30, Math.max(1, Math.round(Number(s.maxMana) || 10)));
    s.loadoutSize = Math.min(13, Math.max(1, Math.round(Number(s.loadoutSize) || 6)));
    return s;
}

/** Magic someone else cast cannot be dispelled by me: its "Dispel" ending becomes "when the turns run out". */
export function fixRelease(e) {
    if (!e || typeof e !== 'object') return;
    if (!e.release || typeof e.release !== 'object') e.release = { kind: 'dispel', text: '' };
    const mine = e.source?.kind === 'me';
    if (e.source?.kind === 'character' && e.release.kind === 'dispel') e.release.kind = 'time';
    if (!mine && e.release.kind === 'dispel') e.release.kind = 'time';
    if (mine && e.release.kind === 'time') e.release.kind = 'dispel';
}

let saveFailedOnce = false;
export function save() {
    try {
        ctx().saveSettingsDebounced();
    } catch (e) {
        console.error('[Mage] save', e);
        if (!saveFailedOnce) {
            saveFailedOnce = true;
            globalThis.toastr?.error?.(String(e?.message || e), 'Mage');
        }
    }
}

/** UI language: the user's own pick, or SillyTavern's language (Korean → ko, anything else → en). */
export function uiLang() {
    const s = settings();
    if (s.langChosen && s.lang) return s.lang;
    let loc = '';
    try { loc = String(ctx().getCurrentLocale?.() || ''); } catch { /* ignore */ }
    return /^ko/i.test(loc) ? 'ko' : 'en';
}

export function chooseLang(lang) {
    const s = settings();
    s.lang = lang;
    s.langChosen = true;
    save();
}

export function uid(prefix = 'm') {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The current chat's id, or null outside a chat. */
export function currentChatId() {
    try {
        const c = ctx();
        if (c.characterId === undefined && !c.groupId) return null;
        const id = c.getCurrentChatId?.();
        return id ? String(id) : null;
    } catch { return null; }
}

/** State for a chat. With `create` false, returns null when the chat has nothing yet. */
export function chatState(chatId = currentChatId(), create = false) {
    if (!chatId) return null;
    const s = settings();
    if (!s.chats[chatId]) {
        if (!create) return null;
        s.chats[chatId] = { effects: [], actions: [], undoId: null, reloads: [], loadout: null, loadAdds: [], ledger: [], checks: [], casters: {}, casterLog: [] };
    }
    return s.chats[chatId];
}

const stripExt = (n) => String(n || '').replace(/\.jsonl$/i, '');

export function onChatRenamed(oldName, newName) {
    const s = settings();
    const from = stripExt(oldName), to = stripExt(newName);
    if (!from || !to || from === to || !s.chats[from]) return;
    s.chats[to] = s.chats[from];
    delete s.chats[from];
    for (const [k, v] of Object.entries(s.branchDone)) if (v === from) s.branchDone[k] = to;
    save();
}

export function onChatDeleted(name) {
    const s = settings();
    const id = stripExt(name);
    if (s.chats[id]) { delete s.chats[id]; save(); }
    delete s.branchDone[id];
}

/** Everything a backup holds (chat states included). */
export function exportData() {
    return { mage: FORMAT, settings: structuredClone(settings()) };
}

export function importData(obj) {
    if (!obj || typeof obj !== 'object' || !obj.settings || typeof obj.settings !== 'object') throw new Error('bad file');
    const all = ctx().extensionSettings;
    all[MODULE] = migrate(structuredClone(obj.settings));
    save();
}
