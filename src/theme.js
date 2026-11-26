// "Follow SillyTavern" theme: take the user's theme colours, make the window background solid,
// and fix text colours when the contrast is too low.

function parse(color) {
    const probe = document.createElement('span');
    probe.style.color = color;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    const m = /rgba?\(([^)]+)\)/.exec(out);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function lum({ r, g, b }) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function over(top, under) {
    const a = top.a ?? 1;
    return {
        r: Math.round(top.r * a + under.r * (1 - a)),
        g: Math.round(top.g * a + under.g * (1 - a)),
        b: Math.round(top.b * a + under.b * (1 - a)),
        a: 1,
    };
}

function mix(a, b, w) {
    return { r: Math.round(a.r * w + b.r * (1 - w)), g: Math.round(a.g * w + b.g * (1 - w)), b: Math.round(a.b * w + b.b * (1 - w)), a: 1 };
}

const rgb = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

/** Best readable text colour on `bg`, preferring `want` when it is good enough. */
function readable(want, bg, min) {
    if (want && contrast(want, bg) >= min) return want;
    // Push the wanted colour towards black or white until it passes.
    const target = lum(bg) > 0.4 ? { r: 17, g: 17, b: 17, a: 1 } : { r: 242, g: 242, b: 242, a: 1 };
    if (want) {
        for (let w = 0.9; w >= 0; w -= 0.1) {
            const c = mix(want, target, w);
            if (contrast(c, bg) >= min) return c;
        }
    }
    return target;
}

export function computeTheme() {
    const tint = parse(cssVar('--SmartThemeBlurTintColor') || 'rgba(23,23,23,0.9)') || { r: 23, g: 23, b: 23, a: 1 };
    const textRaw = parse(cssVar('--SmartThemeBodyColor') || '#dcdcd2') || { r: 220, g: 220, b: 210, a: 1 };
    const borderRaw = parse(cssVar('--SmartThemeBorderColor') || 'rgba(0,0,0,0.5)');
    const accentRaw = parse(cssVar('--SmartThemeQuoteColor') || '#e18a24');

    // Solid background: put the tint over a dark or light base depending on how it looks.
    const base = lum(tint) > 0.35 ? { r: 250, g: 250, b: 250, a: 1 } : { r: 18, g: 18, b: 20, a: 1 };
    const bg = over(tint, base);
    const dark = lum(bg) < 0.4;
    const text = readable(textRaw, bg, 4.5);
    const muted = readable(mix(text, bg, 0.72), bg, 4.5);
    const surface = mix(text, bg, dark ? 0.08 : 0.06);
    const surface2 = mix(text, bg, dark ? 0.15 : 0.12);
    const border = borderRaw ? readable(over(borderRaw, bg), bg, 1.6) : mix(text, bg, 0.3);
    let accent = accentRaw ? over(accentRaw, bg) : text;
    if (contrast(accent, bg) < 3) accent = readable(accent, bg, 3);
    const onAccent = contrast(WHITE, accent) >= contrast(BLACK, accent) ? WHITE : BLACK;
    const danger = readable(dark ? { r: 255, g: 107, b: 107, a: 1 } : { r: 190, g: 30, b: 30, a: 1 }, bg, 4.5);
    const dangerBg = dark ? { r: 170, g: 40, b: 40, a: 1 } : { r: 190, g: 30, b: 30, a: 1 };
    return {
        '--mage-bg': rgb(bg),
        '--mage-text': rgb(text),
        '--mage-muted': rgb(muted),
        '--mage-surface': rgb(surface),
        '--mage-surface2': rgb(surface2),
        '--mage-border': rgb(border),
        '--mage-accent': rgb(accent),
        '--mage-on-accent': rgb(onAccent),
        '--mage-danger': rgb(danger),
        '--mage-danger-bg': rgb(dangerBg),
        '--mage-scheme': dark ? 'dark' : 'light',
        '--mage-gold': dark ? 'rgb(214, 176, 84)' : 'rgb(128, 92, 12)',
    };
}

// Fixed palettes for the two book skins (checked for contrast: text ≥ 7:1, muted ≥ 4.5:1).
const SKINS = {
    tome: {
        '--mage-bg': 'rgb(236, 221, 186)', '--mage-text': 'rgb(43, 29, 16)', '--mage-muted': 'rgb(98, 72, 46)',
        '--mage-surface': 'rgb(228, 209, 168)', '--mage-surface2': 'rgb(216, 193, 148)', '--mage-border': 'rgb(140, 52, 38)',
        '--mage-accent': 'rgb(140, 36, 28)', '--mage-on-accent': 'rgb(255, 246, 228)', '--mage-danger': 'rgb(150, 28, 22)',
        '--mage-danger-bg': 'rgb(150, 28, 22)', '--mage-scheme': 'light', '--mage-cover': 'rgb(92, 52, 28)', '--mage-gilt': 'rgb(201, 162, 74)', '--mage-gold': 'rgb(128, 92, 12)',
    },
    cursed: {
        '--mage-bg': 'rgb(38, 30, 30)', '--mage-text': 'rgb(232, 218, 208)', '--mage-muted': 'rgb(184, 160, 150)',
        '--mage-surface': 'rgb(50, 38, 38)', '--mage-surface2': 'rgb(64, 46, 46)', '--mage-border': 'rgb(122, 36, 36)',
        '--mage-accent': 'rgb(196, 52, 52)', '--mage-on-accent': 'rgb(255, 240, 236)', '--mage-danger': 'rgb(255, 120, 110)',
        '--mage-danger-bg': 'rgb(150, 30, 30)', '--mage-scheme': 'dark', '--mage-cover': 'rgb(20, 16, 16)', '--mage-gilt': 'rgb(140, 140, 146)', '--mage-gold': 'rgb(214, 176, 84)',
    },
};

/** A family colour that reads well on the current background. */
export function famColor(hex, mode) {
    const c = parseHex(hex);
    if (mode === 'tome') return rgb(mix(c, BLACK, 0.62));
    if (mode === 'dark') return rgb(mix(c, WHITE, 0.72));
    return rgb(mix(c, BLACK, 0.8));
}

function parseHex(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

/** Colour mode for icons: 'tome' (dark ink on paper), 'dark' or 'light'. */
export function colorMode(skin, vars) {
    if (skin === 'tome') return 'tome';
    if (skin === 'cursed') return 'dark';
    return vars['--mage-scheme'] === 'dark' ? 'dark' : 'light';
}

export function syncTheme(el, skin = 'theme') {
    try {
        const vars = SKINS[skin] || computeTheme();
        for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
        el.style.colorScheme = vars['--mage-scheme'];
        return vars;
    } catch (e) {
        console.warn('[Mage] theme', e);
        return {};
    }
}
