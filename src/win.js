// The floating status window: dragged by its title bar only, kept on screen, position
// remembered per device kind (phone / PC), collapsible, and moved up out of the way of the
// iPhone keyboard.

import { settings, save } from './store.js';

let el = null;
let head = null;
let drag = null;
let kbShift = 0;

const isPhone = () => window.innerWidth <= 600 || (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth <= 900);
const kind = () => (isPhone() ? 'phone' : 'pc');

function area() {
    // The visible part of the page. Right after the iPhone keyboard closes, visualViewport still
    // reports the small keyboard-open size for a moment; only trust it while typing in the window.
    const vv = window.visualViewport;
    const focused = document.activeElement;
    const typing = !!focused && el?.contains(focused) && /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName);
    if (vv && typing && vv.height < window.innerHeight) {
        return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height, typing: true };
    }
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight, typing: false };
}

function defaultPos(w) {
    if (isPhone()) return { x: Math.max(0, Math.round((window.innerWidth - w) / 2)), y: 8 };
    return { x: Math.max(8, window.innerWidth - w - 24), y: 64 };
}

/** Keep the whole window inside the page. */
function clamp(x, y) {
    const w = el.offsetWidth, h = el.offsetHeight;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) };
}

function stored() {
    const p = settings().winPos?.[kind()];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}

/** Put the window where it belongs (saved place, kept on screen, above the keyboard). */
export function place() {
    if (!el || el.hidden) return;
    const p = stored() || defaultPos(el.offsetWidth);
    const { x, y } = clamp(p.x, p.y);
    // Keyboard open: lift the window so the focused part stays visible (not saved).
    const a = area();
    let top = y;
    kbShift = 0;
    if (a.typing) {
        const bottom = a.top + a.height;
        const h = el.offsetHeight;
        if (top + h > bottom) top = Math.max(a.top, bottom - h);
        kbShift = y - top;
    }
    el.style.left = `${x}px`;
    el.style.top = `${top}px`;
}

function savePos(x, y) {
    const s = settings();
    s.winPos = { ...(s.winPos || {}), [kind()]: { x: Math.round(x), y: Math.round(y) } };
    save();
}

export function resetPos() {
    const s = settings();
    s.winPos = {};
    save();
    place();
}

function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    el?.classList.remove('mage-dragging');
    if (d.moved) savePos(parseFloat(el.style.left) || 0, (parseFloat(el.style.top) || 0) + kbShift);
}

function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button, select, input, textarea, a')) return; // buttons in the title bar still work
    // A new touch drops anything left over from a drag that never got its "let go".
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: el.offsetLeft, y: el.offsetTop, moved: false };
    try { head.setPointerCapture(e.pointerId); } catch { /* not needed everywhere */ }
}

function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; el.classList.add('mage-dragging'); }
    e.preventDefault();
    const { x, y } = clamp(drag.x + dx, drag.y + dy);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
}

const onUp = (e) => { if (drag && (!e || e.pointerId === undefined || e.pointerId === drag.id)) endDrag(); };
const onHide = () => { if (document.visibilityState === 'hidden') endDrag(); };
let placeTimer = 0;
const placeSoon = () => { clearTimeout(placeTimer); placeTimer = setTimeout(place, 60); };
const onFocusIn = (e) => {
    placeSoon();
    const t = e.target;
    if (/^(INPUT|TEXTAREA)$/.test(t?.tagName)) setTimeout(() => { try { t.scrollIntoView({ block: 'nearest' }); } catch { /* ignore */ } }, 320);
};
const onFocusOut = () => setTimeout(place, 450); // after the keyboard has gone

export function attachWindow(root, handle) {
    detachWindow();
    el = root;
    head = handle;
    head.addEventListener('pointerdown', onDown);
    head.addEventListener('pointermove', onMove);
    head.addEventListener('pointerup', onUp);
    head.addEventListener('pointercancel', onUp);
    head.addEventListener('lostpointercapture', onUp);
    window.addEventListener('blur', onUp);
    window.addEventListener('pagehide', onUp);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('resize', placeSoon);
    window.visualViewport?.addEventListener('resize', placeSoon);
    window.visualViewport?.addEventListener('scroll', placeSoon);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
}

export function detachWindow() {
    if (!el) return;
    endDrag();
    head?.removeEventListener('pointerdown', onDown);
    head?.removeEventListener('pointermove', onMove);
    head?.removeEventListener('pointerup', onUp);
    head?.removeEventListener('pointercancel', onUp);
    head?.removeEventListener('lostpointercapture', onUp);
    window.removeEventListener('blur', onUp);
    window.removeEventListener('pagehide', onUp);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('resize', placeSoon);
    window.visualViewport?.removeEventListener('resize', placeSoon);
    window.visualViewport?.removeEventListener('scroll', placeSoon);
    el.removeEventListener('focusin', onFocusIn);
    el.removeEventListener('focusout', onFocusOut);
    el = null;
    head = null;
}
