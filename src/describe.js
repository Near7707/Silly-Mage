// Turning an effect into words: short lines for the screen (chosen language) and
// English lines for the AI.

import { ctx, settings } from './store.js';
import { FORMS, formById, SIZE, STAGES, STAGE_MAX, SIMPLE } from './spells.js';
import { clueDue, omenDue } from './engine.js';

export function targetName(target) {
    if (!target) return '?';
    if (target.kind === 'user') {
        try { return String(ctx().name1 || 'You'); } catch { return 'You'; }
    }
    try {
        const ch = (ctx().characters || []).find(c => c.avatar === target.avatar);
        if (ch?.name) return String(ch.name);
    } catch { /* ignore */ }
    return String(target.name || '?');
}

export function initial(name) {
    const s = String(name || '?').trim();
    const ch = Array.from(s)[0] || '?';
    return ch.toUpperCase();
}

/** The form an effect turns into, in a language: { name, can, cannot }. */
export function formText(e, lang) {
    const f = e.form || {};
    if (f.id && !f.custom) {
        const b = formById(f.id) || FORMS[0];
        return { name: b.name[lang] || b.name.en, can: b.can[lang] || b.can.en, cannot: b.cannot[lang] || b.cannot.en };
    }
    return { name: String(f.name || '?'), can: String(f.can || ''), cannot: String(f.cannot || '') };
}

const fill = (tpl, form) => String(tpl).replaceAll('{form}', form);

const fillX = (str, e) => (str == null ? null : String(str).replaceAll('{x}', String(e.x || '?')));

/** Current look and abilities, in a language. */
export function stateText(e, v, lang) {
    const def = SIMPLE[e.spell];
    if (def) {
        const eff = e.variant === 'bad' && def.effectBad ? def.effectBad : def.effect;
        return { look: fillX(eff[lang], e), can: def.can ? fillX(def.can[lang], e) : null, cannot: def.cannot ? fillX(def.cannot[lang], e) : null };
    }
    if (e.spell === 'titan' || e.spell === 'mite') {
        const s = SIZE[e.spell];
        return { look: s.look[lang], can: s.can[lang], cannot: s.cannot[lang] };
    }
    const form = formText(e, lang);
    if (e.method === 'stacked') {
        if (!v || v.stage <= 0) return { look: null, can: null, cannot: null };
        const st = STAGES[Math.min(STAGE_MAX, v.stage) - 1];
        if (st.id === 'full') return { look: fill(st.look[lang], form.name), can: form.can, cannot: form.cannot };
        return { look: fill(st.look[lang], form.name), can: st.can[lang], cannot: st.cannot[lang] };
    }
    return { look: form.name, can: form.can, cannot: form.cannot };
}

const SPELL_EN = {
    polymorph: 'Polymorph', titan: 'Titan', mite: 'Mite', dispel: 'Dispel', levitate: 'Levitate', truth: 'Truth',
    reverse: 'Reverse', charm: 'Charm', fear: 'Fear', sleep: 'Sleep', glamour: 'Glamour', invisibility: 'Invisibility', luck: 'Luck',
};
export const nameEn = (e) => (e.spell === 'luck' && e.variant === 'bad' ? 'Jinx' : SPELL_EN[e.spell] || e.spell);
const fillWho = (str, who, e) => fillX(String(str).replaceAll('{who}', who), e);

function sourceEn(src) {
    if (!src) return '';
    const name = String(src.name || '').trim();
    switch (src.kind) {
        case 'object': return name ? `an object (${name})` : 'an object';
        case 'place': return name ? `a place (${name})` : 'a place';
        case 'me': return `${targetName({ kind: 'user' })}`;
        case 'trickster': return name ? `a trickster (${name})` : 'a trickster spirit';
        case 'character': return name || 'a character';
        default: return '';
    }
}

function releaseEn(e, who) {
    const r = e.release || { kind: 'dispel' };
    if (r.kind === 'truth') return r.text ? `${who} tells the truth about ${r.text}` : `${who} tells the truth`;
    if (r.kind === 'action') return String(r.text || 'a certain act is done');
    if (r.kind === 'time') return 'its time runs out';
    return 'it is dispelled';
}

const WORLD = {
    common: 'Magic is common in this world: people take it in stride.',
    rare: 'Magic is rare in this world: people are surprised and flustered, and look for an explanation.',
    none: 'Magic does not exist in this world: no one understands it; treat it as a strange, inexplicable event.',
};

const REACT = {
    common: 'People nearby may react briefly and calmly.',
    rare: 'People nearby react naturally (surprised at first).',
    none: 'People nearby react naturally, baffled.',
};

/** Ongoing line (sent every turn while active). */
export function ongoingLine(v) {
    const e = v.e;
    const who = targetName(e.target);
    const s = stateText(e, v, 'en');
    const parts = [];
    if (e.method === 'stacked') {
        const form = formText(e, 'en').name;
        const cond = String(e.trigger?.text || 'the condition');
        parts.push(`${who} — Curse of "${cond}" (Polymorph, stacked): stage ${v.stage}/${STAGE_MAX}`
            + (s.look ? ` — ${s.look}.` : ' — no visible change yet.'));
        if (v.stage < STAGE_MAX) parts.push(`Each time "${cond}" happens to ${who}, it moves one stage toward a full ${form}; do not force it.`);
    } else if (e.spell === 'polymorph') {
        parts.push(`${who} — Polymorph: is a ${s.look} (mind and memories unchanged).`);
    } else {
        parts.push(`${who} — ${nameEn(e)}: ${s.look}.`);
    }
    if (s.can) parts.push(`Can: ${s.can}.`);
    if (s.cannot) parts.push(`Cannot: ${s.cannot}.`);
    const rk = e.release?.kind || 'dispel';
    if (e.duration > 0) parts.push(`${v.left} turn${v.left === 1 ? '' : 's'} left.`);
    else if (rk === 'time') parts.push('No time limit.');
    else parts.push(`No time limit; ends only when ${releaseEn(e, who)}.`);
    if (e.duration > 0 && !['dispel', 'time'].includes(rk)) parts.push(`Ends early if ${releaseEn(e, who)}.`);
    if (SIMPLE[e.spell]?.breaker) parts.push(SIMPLE[e.spell].breaker.rule.en);
    const caster = e.source?.kind === 'character' ? String(e.source.name || '').trim() : '';
    if (caster) parts.push(`${caster} cast it and can undo it whenever they choose.`);
    // Someone else's magic: the user writing "it broke" does not end it (2-B will ask instead).
    if (e.source?.kind !== 'me' && settings().strictRelease) {
        parts.push('This magic only ends the set way. If anyone claims it is broken or tries to force it off, it holds: it may seem to waver for a moment, then it returns.');
    }
    // How it ends is a secret (2-C-1): the AI still knows it, but must not give it away.
    if (e.secretRelease) parts.push('How it ends is a secret: no one in the story knows it; never state it or hint at it directly.');
    const src = sourceEn(e.source);
    const cause = String(e.cause || '').trim();
    const why = [src && `from ${src}`, cause].filter(Boolean).join(' — ');
    const hidden = e.visibility === 'causeHidden' || e.visibility === 'nobody' || e.veiled;
    if (why) parts.push(hidden ? `Cause (secret; no one in the story knows it yet, do not reveal it): ${why}.` : `Cause: ${why}.`);
    if (e.veiled && caster) parts.push(`${caster} cast it in secret; no one knows who did it.`);
    if (e.visibility === 'targetUnaware') parts.push(`${who} has not noticed it yet.`);
    if (e.visibility === 'nobody') parts.push(`No one in the story knows this is magic, not even ${who}: everyone takes it as odd, unexplained happenings.`);
    return `- ${parts.join(' ')}`;
}

/** "Just happened" notes for this reply: [{ text, kind, effectId, actionId? }]. */
export function justNotes(v, world) {
    const e = v.e;
    const who = targetName(e.target);
    const react = REACT[world] || REACT.rare;
    const notes = [];
    const def = SIMPLE[e.spell];
    if (v.status === 'active' && v.needCast) {
        let text;
        if (def) {
            text = fillWho(e.variant === 'bad' && def.startBad ? def.startBad : def.start, who, e);
            text += def.react ? ` Write it in this reply. ${react}` : ' Write it in this reply.';
        } else if (e.method === 'stacked') {
            text = `A curse was just placed on ${who}. Show at most a faint sign that something happened.`;
        } else if (e.spell === 'polymorph') {
            text = `${who} has just turned into a ${formText(e, 'en').name}. Write the change in this reply. ${react}`;
        } else if (e.spell === 'titan') {
            text = `${who} has just grown to about twice their height. Write the change in this reply. ${react}`;
        } else {
            text = `${who} has just shrunk to palm size. Write the change in this reply. ${react}`;
        }
        if (e.visibility === 'targetUnaware') text += ` ${who} does not notice it yet.`;
        if (e.visibility === 'nobody') text += ' No one realizes it is magic.';
        // A character's delayed spell (0.7.0) takes hold now.
        const by = e.source?.kind === 'character' ? String(e.source.name || '').trim() : '';
        if (e.delayed && by) text = `${by}'s spell, laid earlier to take hold ${e.trigger?.text ? `"${e.trigger.text}"` : 'later'}, takes hold now: ${text}`;
        const d = dramaEn(e);
        if (d) text += ` ${d}`;
        notes.push({ text, kind: 'cast', effectId: e.id });
    }
    for (const n of v.stageNotes || []) {
        const st = STAGES[n.stage - 1];
        const look = fill(st.look.en, formText(e, 'en').name);
        const cond = String(e.trigger?.text || 'the condition');
        notes.push({ text: `"${cond}" just happened to ${who}: the curse moved to stage ${n.stage}/${STAGE_MAX} — ${look}. Write this change in this reply. ${react}`,
            kind: 'stage', effectId: e.id, actionId: n.action.id });
    }
    if (v.status === 'ended' && v.needEnd && def) {
        let text;
        const rel = v.actions.find(a => a.type === 'judge' && a.what === 'release');
        if (v.endReason === 'release' && def.breaker && rel?.via === 'breaker') text = fillWho(def.breaker.end, who, e);
        else {
            let why = 'has just worn off';
            if (v.endReason === 'dispel') {
                const by = v.actions.find(a => a.type === 'dispel')?.by;
                why = by ? `was just dispelled (${by})` : 'was just dispelled';
            } else if (v.endReason === 'release') why = rel?.via === 'caster' ? `was just undone by ${e.source?.name || 'its caster'}` : `just broke (${releaseEn(e, who)})`;
            text = `${nameEn(e)} on ${who} ${why}. ${fillWho(def.end, who, e)}`;
        }
        notes.push({ text: `${text} Write it in this reply.`.replace('reply. Write it in this reply.', 'reply.'), kind: 'end', effectId: e.id });
    } else if (v.status === 'ended' && v.needEnd) {
        const name = e.method === 'stacked' ? 'The curse' : SPELL_EN[e.spell];
        let why = 'has just worn off';
        if (v.endReason === 'dispel') {
            const by = v.actions.find(a => a.type === 'dispel')?.by;
            why = by ? `was just dispelled (${by})` : 'was just dispelled';
        } else if (v.endReason === 'release') {
            const rel = v.actions.find(a => a.type === 'judge' && a.what === 'release');
            why = rel?.via === 'caster' ? `was just undone by ${e.source?.name || 'its caster'}` : `just broke (${releaseEn(e, who)})`;
        }
        notes.push({ text: `${name} on ${who} ${why}. Write ${who} returning to normal in this reply.`, kind: 'end', effectId: e.id });
    }
    return notes;
}

/** A misfire or a critical hit (0.7.0), told once with the cast. */
function dramaEn(e) {
    const d = e.drama;
    if (!d) return '';
    const who = targetName(e.target);
    if (d.kind === 'crit') return 'The spell took hold unusually strongly (a critical hit): the effect is vivid and lasts longer than usual.';
    if (d.type === 'self') return `The spell misfired: it bounced back onto ${who}, the one who cast it.`;
    if (d.type === 'target') return `The spell misfired: it was aimed at ${targetName(d.orig?.target)} but went astray and hit ${who} instead.`;
    if (d.type === 'form') {
        const meant = d.orig?.form ? formText({ form: d.orig.form }, 'en').name : 'something else';
        return `The spell misfired and came out wrong: ${who} became a ${formText(e, 'en').name} instead of the intended ${meant}.`;
    }
    return 'The spell misfired and went oddly astray.';
}

/**
 * "It bounced off" (Counter, 0.7.0), once, for the reply after the block.
 * `a` = the block, `e` = the effect it took off (or null for a spell that was only suggested).
 */
export function counterNote(a, e) {
    const me = targetName({ kind: 'user' });
    const who = targetName(e ? e.target : a.target);
    const spell = e ? nameEn(e) : (a.spell === 'luck' && a.variant === 'bad' ? 'Jinx' : SPELL_EN[a.spell] || 'spell');
    const by = String((e?.source?.kind === 'character' ? e.source.name : a.name) || '').trim();
    if (e?.veiled) {
        return `The unseen magic that had quietly begun on ${who} was suddenly thrown off by ${me}: it bounced away and faded, and has no effect anymore. Do not reveal who cast it or what it was. Write it in this reply.`;
    }
    if (e && (a.kind === 'omen' || a.kind === 'pending')) {
        return by && !e.veiled
            ? `${by}'s waiting ${spell} spell on ${who} was turned aside by ${me} before it could take hold: it bounced off and faded. Write it in this reply.`
            : `The unseen magic gathering around ${who} was turned aside by ${me} before it could take hold: it bounced off and faded. Do not explain where it came from. Write it in this reply.`;
    }
    return `${by || 'Someone'}'s ${spell} on ${who} was blocked by ${me}: the magic bounced off and fizzled out, so it has no effect. Write it in this reply.`;
}

/** One-off asks for this reply only (2-C-1): clues for a secret ending, omens of a waiting spell. */
export function onceLines(list) {
    const out = [];
    for (const v of list) {
        const who = targetName(v.e.target);
        if (clueDue(v)) out.push(`Let one small, indirect clue about how the magic on ${who} can end slip into this scene: a hint, never the answer.`);
        if (omenDue(v)) out.push(`Something unseen is gathering around ${who}. Show one small, odd sign near them (a flicker, a chill, a strange coincidence). Do not explain it.`);
    }
    return out;
}

/** The whole note for the AI, or '' when nothing is going on. `once`: extra lines for this reply only. */
export function buildPrompt(list, { withNotes = true, once = [], blocks = [] } = {}) {
    const world = settings().world;
    const ongoing = list.filter(v => v.status === 'active').map(ongoingLine);
    // `blocks`: [{ text, kind: 'counter', actionId }] — spells that bounced off (0.7.0).
    const notes = withNotes ? [...list.flatMap(v => justNotes(v, world)), ...blocks] : [];
    const thisTurn = withNotes ? [...onceLines(list), ...once] : [];
    if (!ongoing.length && !notes.length && !thisTurn.length) return { text: '', notes: [] };
    const lines = ['[Magic effects in this story — keep them consistent. Do not mention this note or its numbers.]'];
    lines.push(WORLD[world] || WORLD.rare);
    if (ongoing.length) lines.push('Ongoing:', ...ongoing);
    if (notes.length) lines.push('Just happened (write it into this reply, once):', ...notes.map(n => `- ${n.text}`));
    if (thisTurn.length === 1) lines.push(`This turn (once): ${thisTurn[0]}`);
    else if (thisTurn.length) lines.push('This turn (once):', ...thisTurn.map(x => `- ${x}`));
    return { text: lines.join('\n'), notes };
}
