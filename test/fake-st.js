// A small stand-in for SillyTavern's getContext(), events and chat screen, for trying Mage.
(function () {
    const params = new URLSearchParams(location.search);
    const listeners = {};
    const eventTypes = {
        APP_READY: 'app_ready', CHAT_CHANGED: 'chat_id_changed', CHAT_LOADED: 'chatLoaded',
        MESSAGE_SENT: 'message_sent', MESSAGE_RECEIVED: 'message_received', MESSAGE_DELETED: 'message_deleted',
        MESSAGE_SWIPED: 'message_swiped', MESSAGE_EDITED: 'message_edited', MESSAGE_UPDATED: 'message_updated',
        USER_MESSAGE_RENDERED: 'user_message_rendered', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
        MORE_MESSAGES_LOADED: 'more_messages_loaded', GENERATION_STARTED: 'generation_started',
        GENERATION_ENDED: 'generation_ended', GENERATION_STOPPED: 'generation_stopped',
        CHAT_RENAMED: 'chat_renamed', CHAT_DELETED: 'chat_deleted', GROUP_CHAT_DELETED: 'group_chat_deleted',
    };
    const eventSource = {
        on(n, f) { (listeners[n] ||= []).push(f); },
        async emit(n, ...a) { for (const f of listeners[n] || []) await f(...a); },
    };
    const characters = [
        { name: 'Mira', avatar: 'mira.png' },
        { name: 'Bramwell Longname-of-the-Northern-Hills', avatar: 'bram.png' },
    ];
    const extensionSettings = {
        connectionManager: { profiles: [{ id: 'p1', name: 'Fast model' }] },
    };
    try { Object.assign(extensionSettings, JSON.parse(localStorage.getItem('mage_test_settings') || '{}')); } catch { /* ignore */ }
    if (params.has('fresh')) for (const k of Object.keys(extensionSettings)) if (k !== 'connectionManager') delete extensionSettings[k];
    if (params.get('lang')) extensionSettings.mage = { ...(extensionSettings.mage || {}), lang: params.get('lang'), langChosen: true };

    const state = { characterId: params.has('nochat') ? undefined : 0, chatName: 'Mira - 2026-01-01', clock: Date.now() - 3600_000 };
    const chats = {};
    const metas = {};
    const stamp = () => new Date(state.clock += 60_000).toISOString();
    function chat() {
        if (!chats[state.chatName]) chats[state.chatName] = [{ is_user: false, is_system: false, name: 'Mira', mes: 'Hello! Welcome to the old library.', send_date: stamp() }];
        return chats[state.chatName];
    }
    let lastPrompt = '';
    let sentPrompt = '';
    async function fakeAI(sys, user) {
        await new Promise(r => setTimeout(r, 300));
        const ko = /Korean/.test(user);
        if (/CAN:/.test(sys)) return ko ? 'CAN: 헤엄치기, 미끄러지기\nCANNOT: 날기, 빨리 걷기' : 'CAN: swim fast, slide on ice\nCANNOT: fly, walk quickly';
        return ko ? '<think>hmm</think>아까 도서관에서 펼친 낡은 책에 변이 마법이 걸려 있었다.' : '<think>hmm</think>The dusty book opened in the library earlier held a hidden spell.';
    }
    const ctx = {
        characters, extensionSettings, eventSource, eventTypes, event_types: eventTypes,
        get characterId() { return state.characterId; },
        groupId: null, groups: [],
        name1: 'Juno',
        getCurrentLocale: () => params.get('stlocale') || 'en',
        getCurrentChatId: () => (state.characterId === undefined ? undefined : state.chatName),
        get chat() { return state.characterId === undefined ? [] : chat(); },
        get chatMetadata() { return (metas[state.chatName] ||= {}); },
        saveSettingsDebounced: () => localStorage.setItem('mage_test_settings', JSON.stringify(extensionSettings)),
        setExtensionPrompt: (key, value) => { lastPrompt = value; },
        POPUP_TYPE: { TEXT: 1, CONFIRM: 2 },
        callGenericPopup: async () => (window.__confirmAnswer ?? true),
        ConnectionManagerRequestService: { sendRequest: async (_id, messages) => ({ content: await fakeAI(messages[0].content, messages[1].content) }) },
        generateRaw: async ({ systemPrompt, prompt }) => fakeAI(systemPrompt, prompt),
    };
    window.SillyTavern = { getContext: () => ctx };

    function render() {
        const box = document.getElementById('chat');
        box.innerHTML = '';
        ctx.chat.forEach((m, i) => {
            const d = document.createElement('div');
            d.className = 'mes';
            d.innerHTML = `<b>#${i} ${m.is_user ? ctx.name1 : m.name}</b> <small>${m.send_date.slice(11, 19)}</small><div>${m.mes}</div>`;
            box.appendChild(d);
        });
        box.scrollTop = box.scrollHeight;
    }

    let replyNo = 0;
    async function generate(type = 'normal') {
        await eventSource.emit(eventTypes.GENERATION_STARTED, type, {}, false);
        sentPrompt = lastPrompt; // what this reply was generated with
        const out = document.getElementById('prompt_out'); if (out) out.textContent = sentPrompt || '(nothing sent)';
        const list = chat();
        const ch = characters[state.characterId];
        const text = `Reply ${++replyNo}${lastPrompt ? ' (saw Mage note)' : ''}`;
        if (type === 'swipe') {
            const i = list.length - 1;
            list[i] = { ...list[i], mes: text, send_date: stamp() };
            await eventSource.emit(eventTypes.MESSAGE_RECEIVED, i, 'swipe');
            await eventSource.emit(eventTypes.MESSAGE_SWIPED, i);
        } else {
            list.push({ is_user: false, is_system: false, name: ch.name, mes: text, send_date: stamp() });
            await eventSource.emit(eventTypes.MESSAGE_RECEIVED, list.length - 1, type);
            await eventSource.emit(eventTypes.CHARACTER_MESSAGE_RENDERED, list.length - 1);
        }
        await eventSource.emit(eventTypes.GENERATION_ENDED, list.length);
        render();
    }

    async function send(text) {
        chat().push({ is_user: true, is_system: false, name: ctx.name1, mes: text || '(my message)', send_date: stamp() });
        await eventSource.emit(eventTypes.MESSAGE_SENT, chat().length - 1);
        await eventSource.emit(eventTypes.USER_MESSAGE_RENDERED, chat().length - 1);
        render();
        await generate('normal');
    }

    window.__fakeST = {
        ctx, chats, metas, state, render, generate, send,
        get prompt() { return sentPrompt; },
        get livePrompt() { return lastPrompt; },
        /** One full turn: my message + an AI reply. */
        turn: (text) => send(text),
        swipe: () => generate('swipe'),
        async deleteLast() { chat().pop(); await eventSource.emit(eventTypes.MESSAGE_DELETED, chat().length); render(); },
        async branch() {
            const from = state.chatName;
            state.chatName = `${from} Branch`;
            chats[state.chatName] = structuredClone(chats[from]).slice(0, -2);
            metas[state.chatName] = { main_chat: from };
            render();
            await eventSource.emit(eventTypes.CHAT_CHANGED, state.chatName);
        },
        async openChat(name) { state.chatName = name; render(); await eventSource.emit(eventTypes.CHAT_CHANGED, name); },
        async selectChar(i) { state.characterId = i; state.chatName = `${characters[i].name} - 2026-01-0${i + 1}`; render(); await eventSource.emit(eventTypes.CHAT_CHANGED, state.chatName); },
    };

    window.__mageBoot = () => {
        const theme = params.get('theme');
        const css = document.getElementById('theme_override');
        if (theme === 'light') css.textContent = ':root{--SmartThemeBodyColor:rgb(40,40,40);--SmartThemeBlurTintColor:rgba(235,232,224,0.9);--SmartThemeBorderColor:rgba(0,0,0,0.25);--SmartThemeQuoteColor:rgb(200,120,20)} body{background:#f3efe6;color:#222}';
        else if (theme === 'lowcontrast') css.textContent = ':root{--SmartThemeBodyColor:rgb(120,120,120);--SmartThemeBlurTintColor:rgba(90,90,90,0.6);--SmartThemeQuoteColor:rgb(110,110,110)} body{background:#555}';
        else css.textContent = ':root{--SmartThemeBodyColor:rgb(220,220,210);--SmartThemeBlurTintColor:rgba(23,23,23,0.9);--SmartThemeBorderColor:rgba(0,0,0,0.5);--SmartThemeQuoteColor:rgb(225,138,36)} body{background:#222;color:#ddd}';
        document.getElementById('btn_turn').onclick = () => send(document.getElementById('send_textarea').value);
        document.getElementById('btn_swipe').onclick = () => generate('swipe');
        document.getElementById('btn_del').onclick = () => window.__fakeST.deleteLast();
        document.getElementById('btn_branch').onclick = () => window.__fakeST.branch();
        render();
    };
})();
