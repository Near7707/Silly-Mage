// "Learn spells": example Spellbook cards to pick from, game skill-menu style (0.9.0).
// Each entry is a ready card: a name in both languages and the cast settings it fills in.
// `special` cards show off a feature (secret ending, nobody knows, omen) and sit in their own tab.

import { RANDOM_OBJECTS } from './spells.js';

const obj = (L, i) => RANDOM_OBJECTS[L]?.[i] || RANDOM_OBJECTS.en[i];

/** Order here = order on screen (by family, then the special cards). */
export const LEARN = [
    { id: 'water', spell: 'polymorph', en: 'Curse of Water', ko: '물의 저주',
        over: L => ({ form: { id: 'cat' }, method: 'stacked', duration: 0,
            trigger: { kind: 'now', turns: 2, chance: 25, text: L === 'ko' ? '💧 물에 닿음' : '💧 touched water' },
            source: { kind: 'object', name: obj(L, 0) }, motive: 'punishment', release: { kind: 'truth', text: '' } }) },
    { id: 'turtle', spell: 'polymorph', en: 'Turtle Prank', ko: '거북이 장난',
        over: () => ({ form: { id: 'turtle' }, duration: 3, motive: 'prank' }) },
    { id: 'pocket', spell: 'mite', en: 'Pocket Size', ko: '주머니 크기',
        over: L => ({ duration: 5, source: { kind: 'object', name: obj(L, 1) }, motive: 'mistake' }) },
    { id: 'wool', spell: 'polymorph', en: 'Woolly Prank', ko: '양털 장난',
        over: () => ({ form: { id: 'sheep' }, duration: 3, motive: 'prank' }) },
    { id: 'giant', spell: 'titan', en: "A Giant's Day", ko: '거인의 하루', over: () => ({ duration: 5 }) },
    { id: 'feather', spell: 'levitate', en: 'Feather Step', ko: '깃털 걸음',
        over: () => ({ duration: 3, trigger: { kind: 'turns', turns: 2, chance: 25, text: '' } }) },
    { id: 'stone', spell: 'bind', en: 'Stone Still', ko: '돌처럼 굳기', over: () => ({ duration: 3 }) },
    { id: 'bolt', spell: 'haste', en: 'Lightning Feet', ko: '번개 발걸음', over: () => ({ duration: 5, variant: 'good' }) },
    { id: 'snail', spell: 'haste', en: "Snail's Pace", ko: '느림보 주문', over: () => ({ duration: 3, variant: 'bad' }) },
    { id: 'tongue', spell: 'truth', en: 'Honest Tongue', ko: '진실의 혀', over: () => ({ duration: 5 }) },
    { id: 'topsy', spell: 'reverse', en: 'Topsy-Turvy Talk', ko: '뒤집힌 말', over: () => ({ duration: 3 }) },
    { id: 'crush', spell: 'charm', en: 'First-Sight Crush', ko: '첫눈에 반함', over: () => ({ duration: 5 }) },
    { id: 'coward', spell: 'fear', en: "Coward's Curse", ko: '겁쟁이 저주', over: () => ({ duration: 3 }) },
    { id: 'drowsy', spell: 'sleep', en: 'Drowsy Cloud', ko: '졸음 구름',
        over: () => ({ duration: 0, trigger: { kind: 'chance', turns: 2, chance: 20, text: '' } }) },
    { id: 'hush', spell: 'silence', en: 'Hushed Throat', ko: '고요한 목', over: () => ({ duration: 3 }) },
    { id: 'parrot', spell: 'echo', en: 'Parrot Mouth', ko: '메아리 입', over: () => ({ duration: 3 }) },
    { id: 'masque', spell: 'glamour', en: 'Masquerade', ko: '가면 무도회',
        over: L => ({ duration: 5, x: L === 'ko' ? '보석 가면을 쓴 낯선 사람' : 'a stranger in a jeweled mask' }) },
    { id: 'cloak', spell: 'invisibility', en: 'Vanishing Cloak', ko: '투명 망토', over: () => ({ duration: 0 }) },
    { id: 'haze', spell: 'smoke', en: 'Haze Shadow', ko: '연기 그림자', over: () => ({ duration: 3 }) },
    { id: 'double', spell: 'doppel', en: 'Another Me', ko: '또 하나의 나', over: () => ({ duration: 5 }) },
    { id: 'coin', spell: 'luck', en: 'Lucky Coin', ko: '행운의 동전', over: () => ({ duration: 5, variant: 'good' }) },
    { id: 'blackcat', spell: 'luck', en: 'Black Cat', ko: '검은 고양이', over: () => ({ duration: 3, variant: 'bad' }) },
    { id: 'star', spell: 'mark', en: 'Star Mark', ko: '별의 표식', over: () => ({ duration: 10 }) },
    { id: 'lips', spell: 'silence', special: true, en: 'Sealed Lips', ko: '잠긴 입술',
        over: L => ({ duration: 0, release: { kind: 'action', text: L === 'ko' ? '누군가 노래를 불러 줌' : 'someone sings them a song' },
            secretRelease: true, clueEvery: 5 }) },
    { id: 'unaware', spell: 'charm', special: true, en: 'Unknowing Crush', ko: '모르는 새 반함',
        over: () => ({ duration: 5, visibility: 'nobody' }) },
    { id: 'moon', spell: 'polymorph', special: true, en: 'Curse of the Full Moon', ko: '보름달의 저주',
        over: L => ({ form: { id: 'fox' }, duration: 5, omen: true,
            trigger: { kind: 'condition', turns: 2, chance: 25, text: L === 'ko' ? '달이 뜸' : 'the moon rises' } }) },
];

/** The entry a Spellbook card came from: its seed id, or the same name in either language. */
export function learnedIds(book) {
    const got = new Set();
    for (const c of book || []) {
        const name = String(c?.name || '').trim();
        for (const e of LEARN) if (c?.seed === e.id || (name && (name === e.en || name === e.ko))) got.add(e.id);
    }
    return got;
}
