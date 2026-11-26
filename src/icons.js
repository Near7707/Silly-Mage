// Hand-drawn SVG icons (drawn once per spell; each skin only swaps the frame around them).
// Bold strokes, one family colour (currentColor).

const r2 = (n) => Math.round(n * 100) / 100;
const pt = (cx, cy, r, deg) => [r2(cx + r * Math.cos(deg * Math.PI / 180)), r2(cy + r * Math.sin(deg * Math.PI / 180))];

/** Clockwise arc from a to b (degrees, y down) with an arrow head at the end. */
function arcArrow(cx, cy, r, a, b, head = 2.6) {
    const [x1, y1] = pt(cx, cy, r, a);
    const [x2, y2] = pt(cx, cy, r, b);
    const large = ((b - a + 360) % 360) > 180 ? 1 : 0;
    const t = b * Math.PI / 180;
    const dx = -Math.sin(t), dy = Math.cos(t); // direction of travel at the end
    const back = (ang) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        const bx = -(dx * c - dy * s), by = -(dx * s + dy * c);
        return [r2(x2 + bx * head), r2(y2 + by * head)];
    };
    const [hx1, hy1] = back(0.55), [hx2, hy2] = back(-0.55);
    return `M${x1} ${y1}A${r} ${r} 0 ${large} 1 ${x2} ${y2}M${hx1} ${hy1}L${x2} ${y2}L${hx2} ${hy2}`;
}

function arrow(x1, y1, x2, y2, head = 2.4) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / len, dy = (y2 - y1) / len;
    const side = (ang) => {
        const c = Math.cos(ang), s = Math.sin(ang);
        return [r2(x2 - (dx * c - dy * s) * head), r2(y2 - (dx * s + dy * c) * head)];
    };
    const [a1, b1] = side(0.6), [a2, b2] = side(-0.6);
    return `M${x1} ${y1}L${x2} ${y2}M${a1} ${b1}L${x2} ${y2}L${a2} ${b2}`;
}

// Filled shapes (wings, a person) read better than thin outlines at chip size.
const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${r2(24 - Number(x))} ${y}`);
const WING_UP = 'M11.2 11.3C9.6 7.2 6.4 5.7 5.4 7.5C4.6 9 6.2 11.6 11.2 12Z';
const WING_LOW = 'M11.2 12.8C7.7 13 6.7 15.3 7.6 16.5C8.6 17.7 10.6 16.3 11.2 13.6Z';
const BUTTERFLY_FILL = WING_UP + WING_LOW + mirror(WING_UP) + mirror(WING_LOW);
const BUTTERFLY_LINE = 'M12 9.4V16.4M12 9.4L10.9 7.6M12 9.4L13.1 7.6';
const BUBBLE = 'M5 3.8H19A2 2 0 0 1 21 5.8V14A2 2 0 0 1 19 16H12L7.6 19.6V16H5A2 2 0 0 1 3 14V5.8A2 2 0 0 1 5 3.8Z';
const PERSON_FILL = 'M14.2 9.4A2.2 2.2 0 1 1 9.8 9.4A2.2 2.2 0 1 1 14.2 9.4Z M8.4 16.8C8.4 12.9 15.6 12.9 15.6 16.8Z';

function dispelPath() {
    const arcs = [[-70, 10], [40, 120], [150, 230], [255, 275]];
    let d = '';
    for (const [a, b] of arcs) {
        const [x1, y1] = pt(12, 12, 6.6, a), [x2, y2] = pt(12, 12, 6.6, b);
        d += `M${x1} ${y1}A6.6 6.6 0 0 1 ${x2} ${y2}`;
    }
    // Crack across, and shards flying out of the gaps.
    d += 'M9.4 6.4L11.4 10L9.8 12.4L12.6 14.8L11.6 17.8';
    for (const g of [25, 135, 243]) {
        const [x1, y1] = pt(12, 12, 8.8, g), [x2, y2] = pt(12, 12, 10.9, g);
        d += `M${x1} ${y1}L${x2} ${y2}`;
    }
    return d;
}

// Each icon: [stroke path, fill path].
const PATHS = {
    polymorph: () => [BUTTERFLY_LINE + arcArrow(12, 12, 10.4, 200, 315) + arcArrow(12, 12, 10.4, 20, 135), BUTTERFLY_FILL],
    dispel: () => [dispelPath(), ''],
    titan: () => [arrow(7, 7, 3.2, 3.2) + arrow(17, 7, 20.8, 3.2) + arrow(7, 17, 3.2, 20.8) + arrow(17, 17, 20.8, 20.8), PERSON_FILL],
    levitate: () => ['M6 18.6C8 17.2 10 20 12 18.6S16 20 18 18.6M8 21.6C9.4 20.6 10.8 22.6 12.2 21.6S15 22.6 16.4 21.6'
        + arrow(4.4, 11, 4.4, 4.6, 2) + arrow(19.6, 11, 19.6, 4.6, 2),
        'M14.2 6.4A2.2 2.2 0 1 1 9.8 6.4A2.2 2.2 0 1 1 14.2 6.4Z M8.4 14.4C8.4 10.2 15.6 10.2 15.6 14.4Z'],
    truth: () => [BUBBLE + 'M8.4 10.8L10.8 13.2L15.6 8.4', ''],
    reverse: () => [BUBBLE + 'M8 8.8H16M14 6.8L16 8.8L14 10.8M16 12.8H8M10 10.8L8 12.8L10 14.8', ''],
    charm: () => ['M12 20.2S4.6 15.6 4.6 10.4A3.9 3.9 0 0 1 12 8.4A3.9 3.9 0 0 1 19.4 10.4C19.4 15.6 12 20.2 12 20.2ZM19.6 1.8V5.4M17.8 3.6H21.4', ''],
    fear: () => ['M12 4.4V13.6M5.4 6.6L7.4 8.6L5.4 10.6L7.4 12.6L5.4 14.6M18.6 6.6L16.6 8.6L18.6 10.6L16.6 12.6L18.6 14.6',
        'M13.5 18.4A1.5 1.5 0 1 1 10.5 18.4A1.5 1.5 0 1 1 13.5 18.4Z'],
    sleep: () => ['M10.4 5.4A7.6 7.6 0 1 0 18.6 15.4A6.2 6.2 0 0 1 10.4 5.4ZM14.8 2.6H19.6L14.8 7.4H19.6', ''],
    glamour: () => ['M2.8 8.8C5.8 7.2 9 7.2 12 8.8C15 7.2 18.2 7.2 21.2 8.8C21.2 13 19.2 16 16.4 16C14.4 16 13 14.6 12 13C11 14.6 9.6 16 7.6 16C4.8 16 2.8 13 2.8 8.8ZM6.4 11.4H9.2M14.8 11.4H17.6M12 19V22', ''],
    invisibility: () => ['M2.6 12S6 5.8 12 5.8S21.4 12 21.4 12S18 18.2 12 18.2S2.6 12 2.6 12ZM14.6 12A2.6 2.6 0 1 1 9.4 12A2.6 2.6 0 1 1 14.6 12ZM4 20L20 4', ''],
    luck: () => ['M12 10C13 14 14.6 17.6 16.4 21',
        [[9.3, 7.3], [14.7, 7.3], [9.3, 12.7], [14.7, 12.7]].map(([x, y]) => `M${r2(x + 2.5)} ${y}A2.5 2.5 0 1 1 ${r2(x - 2.5)} ${y}A2.5 2.5 0 1 1 ${r2(x + 2.5)} ${y}Z`).join('')],
    mite: () => [arrow(3, 3, 6.6, 6.6) + arrow(21, 3, 17.4, 6.6) + arrow(3, 21, 6.6, 17.4) + arrow(21, 21, 17.4, 17.4), PERSON_FILL],
};

const cache = {};
function parts(name) { return (cache[name] ||= (PATHS[name] || PATHS.polymorph)()); }
function glyph(name) {
    const [line, fill] = parts(name);
    return `<path d="${line}"/>` + (fill ? `<path d="${fill}" fill="currentColor" stroke="none"/>` : '');
}

/** The bare icon (chips: no frame). */
export function iconSvg(name, { size = 18, curse = false } = {}) {
    return `<span class="mage-ico" style="width:${size}px;height:${size}px" aria-hidden="true">`
        + `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph(name)}</svg>`
        + (curse ? curseBadge() : '') + '</span>';
}

export function curseBadge() {
    return '<svg class="mage-badge" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#b3261e" stroke="#fff" stroke-width="1.6"/>'
        + '<path d="M4.6 12Q12 4.8 19.4 12Q12 19.2 4.6 12Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" fill="#fff"/></svg>';
}

function hexagram() {
    const tri = (rot) => [0, 120, 240].map(a => pt(24, 24, 15.5, a + rot).join(' ')).join('L');
    return `<path d="M${tri(-90)}Z M${tri(90)}Z" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/>`;
}

function runeTicks() {
    let d = '';
    for (let i = 0; i < 16; i++) {
        const a = i * 22.5;
        const [x1, y1] = pt(24, 24, 19.2, a), [x2, y2] = pt(24, 24, i % 2 ? 20.6 : 21.6, a);
        d += `M${x1} ${y1}L${x2} ${y2}`;
    }
    return `<path d="${d}" stroke="currentColor" stroke-width="1" opacity=".6"/>`;
}

/** Frame for each skin: rune circle / ink stamp / magic circle. */
function frame(skin, curse) {
    if (skin === 'tome') {
        return '<rect x="2" y="2" width="44" height="44" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'
            + '<rect x="6" y="6" width="36" height="36" rx="1" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/>';
    }
    if (skin === 'cursed') {
        return '<circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="1.6"/>'
            + '<circle cx="24" cy="24" r="18.5" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/>'
            + (curse ? hexagram() : '');
    }
    return '<circle cx="24" cy="24" r="22.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' + runeTicks()
        + '<circle cx="24" cy="24" r="17.6" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/>';
}

/** Framed icon for cards and the Spellbook. */
export function framedIcon(name, { skin = 'theme', curse = false, size = 46 } = {}) {
    const inner = Math.round(size * 0.52);
    return `<span class="mage-fico" style="width:${size}px;height:${size}px" aria-hidden="true">`
        + `<svg class="mage-frame" viewBox="0 0 48 48" width="${size}" height="${size}">${frame(skin, curse)}</svg>`
        + `<svg class="mage-inner" viewBox="0 0 24 24" width="${inner}" height="${inner}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph(name)}</svg>`
        + (curse ? curseBadge() : '') + '</span>';
}

/** The wand-menu / title glyph. */
export const MAGE_GLYPH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 20L14.5 9.5M13 6.5l1-3 1 3 3 1-3 1-1 3-1-3-3-1zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z"/></svg>';
