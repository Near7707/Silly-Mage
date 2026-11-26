// Mage settings, drawn in two places: SillyTavern's extension panel and the ⚙ page
// inside the Mage window. Both use the same fields and the same handlers.

import { t, setLanguage, lang, LANGUAGES } from './i18n.js';
import { ctx, settings, save, uiLang, chooseLang, exportData, importData } from './store.js';
import { FORMS } from './spells.js';
import { getProfiles } from './ai.js';
import { resetPos } from './win.js';

export const VERSION = '0.1.2';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (kind, msg) => { try { globalThis.toastr?.[kind]?.(msg, 'Mage'); } catch { /* ignore */ } };

// Set by index.js: redraw everything (panel, menu, window, AI note), and turn Mage off.
let hooks = { redrawAll: () => {}, turnedOff: () => {} };
export function setPrefsHooks(h) { hooks = { ...hooks, ...h }; }

function optionList(pairs, cur) {
    return pairs.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

export function profileOptions() {
    const s = settings();
    const profiles = getProfiles();
    let h = optionList([['', t('set_profile_current')], ...profiles.map(p => [p.id, p.name])], s.profileId);
    if (s.profileId && !profiles.some(p => p.id === s.profileId)) h += `<option value="${esc(s.profileId)}" selected>${esc(t('set_profile_missing'))}</option>`;
    return h;
}

/**
 * The settings fields. `win` = inside the Mage window (Mage's own look);
 * otherwise SillyTavern's own controls, so the panel matches other extensions.
 */
export function prefsHtml(win) {
    const s = settings();
    const L = lang();
    const selCls = win ? 'mage-select' : 'text_pole mage-pselect';
    const btnCls = win ? 'mage-btn mage-small' : 'menu_button mage-pbtn';
    const sel = (key, pairs, cur) => `<span class="mage-sel"><select class="${selCls}" data-mage-p="${key}">${optionList(pairs, cur)}</select></span>`;
    const field = (label, inner) => `<label class="mage-pfield"><span class="mage-plabel">${esc(label)}</span>${inner}</label>`;
    const check = (key, on, label) => `<label class="checkbox_label mage-pcheck"><input type="checkbox" data-mage-p="${key}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    const hint = (text) => `<div class="mage-phint">${esc(text)}</div>`;
    const sub = (text) => `<div class="mage-psub">${esc(text)}</div>`;
    const pool = [...FORMS.map(f => [`b:${f.id}`, f.name[L] || f.name.en]), ...s.customForms.map(c => [`c:${c.id}`, c.name])]
        .map(([id, name]) => `<label class="mage-pchip"><input type="checkbox" data-mage-pool="${esc(id)}"${s.randomPool.includes(id) ? ' checked' : ''}><span>${esc(name)}</span></label>`).join('');
    return `<div class="mage-prefs${win ? ' mage-prefs-win' : ''}">`
        + check('enabled', s.enabled, t('set_enabled'))
        + field(t('set_language'), sel('lang', LANGUAGES.map(l => [l.id, l.label]), L))
        + field(t('set_skin'), sel('skin', ['theme', 'tome', 'cursed'].map(k => [k, t(`skin_${k}`)]), s.skin))
        + field(t('set_world'), sel('world', ['common', 'rare', 'none'].map(k => [k, t(`world_${k}`)]), s.world))
        + hint(t(`world_hint_${s.world}`))
        + check('trickster', s.allowTrickster, t('set_trickster'))
        + sub(t('set_pool')) + `<div class="mage-pool">${pool}</div>` + hint(t('set_pool_hint'))
        + sub(t('set_ai'))
        + field(t('set_profile'), sel('profile', [], '').replace('</select>', `${profileOptions()}</select>`))
        + check('preset', s.sendPreset, t('set_preset')) + hint(t('set_preset_hint'))
        + field(t('set_reasoning'), sel('reasoning', ['default', 'low', 'medium', 'high'].map(k => [k, t(`reasoning_${k}`)]), s.reasoning))
        + field(t('set_context'), `<input class="${win ? 'mage-input mage-num' : 'text_pole mage-pnum'}" type="number" inputmode="numeric" min="0" max="20" data-mage-p="context" value="${esc(s.contextCount)}">`)
        + `<button type="button" class="${btnCls}" data-mage-p="resetpos"><span class="mage-ell">${esc(t('set_reset_pos'))}</span></button>`
        + sub(t('set_backup'))
        + `<div class="mage-prow"><button type="button" class="${btnCls}" data-mage-p="export"><span class="mage-ell">${esc(t('set_export'))}</span></button>`
        + `<button type="button" class="${btnCls}" data-mage-p="import"><span class="mage-ell">${esc(t('set_import'))}</span></button>`
        + '<input type="file" accept=".json,application/json" data-mage-p="file" hidden></div>'
        + hint(t('version', { v: VERSION }))
        + '</div>';
}

/** Click on a settings button. Returns true when it was one. */
export function prefsClick(e) {
    const b = e.target.closest('[data-mage-p]');
    if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return false;
    const k = b.dataset.mageP;
    if (k === 'resetpos') { resetPos(); toast('info', t('pos_reset')); }
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
    if (k === 'import') b.closest('.mage-prow').querySelector('[data-mage-p="file"]').click();
    return true;
}

/** A settings field changed. Returns true when it was one. */
export function prefsChange(e) {
    const el = e.target;
    const s = settings();
    const pool = el.dataset?.magePool;
    if (pool) {
        s.randomPool = el.checked ? [...new Set([...s.randomPool, pool])] : s.randomPool.filter(x => x !== pool);
        save();
        return true;
    }
    const k = el.dataset?.mageP;
    if (!k) return false;
    switch (k) {
        case 'enabled':
            s.enabled = el.checked; save();
            if (!s.enabled) hooks.turnedOff();
            hooks.redrawAll();
            break;
        case 'lang': chooseLang(el.value); setLanguage(el.value); hooks.redrawAll(); break;
        case 'skin': s.skin = el.value; save(); hooks.redrawAll(); break;
        case 'world': s.world = el.value; save(); hooks.redrawAll(); break;
        case 'trickster': s.allowTrickster = el.checked; save(); hooks.redrawAll(); break;
        case 'profile': s.profileId = el.value; save(); break;
        case 'preset': s.sendPreset = el.checked; save(); break;
        case 'reasoning': s.reasoning = el.value; save(); break;
        case 'context': s.contextCount = Math.min(20, Math.max(0, Math.round(Number(el.value) || 0))); el.value = s.contextCount; save(); break;
        case 'file': importFile(el); break;
        default: return false;
    }
    return true;
}

async function importFile(el) {
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
        hooks.redrawAll();
        toast('success', t('imported'));
    } catch {
        toast('error', t('import_fail'));
    }
}

/** Profiles may be added after the fields were drawn. */
export function prefsFocus(e) {
    const sel = e.target.closest?.('[data-mage-p="profile"]');
    if (sel) {
        const v = sel.value;
        sel.innerHTML = profileOptions();
        sel.value = v;
    }
}
