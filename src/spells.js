// Spell, family and form data. Text the AI sees is always English (`en`);
// text on screen follows the chosen language.

/** Families: colour + icon frame. Only "change" and "ward" are used in stage 1; the rest hold their place. */
export const FAMILIES = {
    change:   { color: '#9b6bd6' },
    ward:     { color: '#4f86d9' },
    mind:     { color: '#2fa3a0' },
    illusion: { color: '#d36aa8' },
    fate:     { color: '#c9a13b' },
    time:     { color: '#9aa3ad' },
    boost:    { color: '#e08a3c' },
    summon:   { color: '#4fa564' },
};

export const SPELLS = {
    polymorph: { family: 'change', icon: 'polymorph', forms: true },
    titan:     { family: 'change', icon: 'titan' },
    mite:      { family: 'change', icon: 'mite' },
    dispel:    { family: 'ward', icon: 'dispel', utility: true },
};
export const SPELL_ORDER = ['polymorph', 'titan', 'mite', 'dispel'];

/** What a size spell does to the body. */
export const SIZE = {
    titan: {
        look: { en: 'grown to about twice their height (same shape, only bigger)', ko: '키가 두 배쯤 커짐 (모양은 그대로)' },
        can: { en: 'much stronger, sees far', ko: '힘이 아주 셈, 멀리 보임' },
        cannot: { en: 'fit through doors, hide', ko: '문 지나가기, 숨기' },
    },
    mite: {
        look: { en: 'shrunk to palm size (same shape, only smaller)', ko: '손바닥만 해짐 (모양은 그대로)' },
        can: { en: 'get into narrow places, hide easily', ko: '좁은 곳 들어가기, 잘 숨기' },
        cannot: { en: 'open doors, lift heavy things', ko: '문 열기, 무거운 것 들기' },
    },
};

/** Default Polymorph forms, in this order. Living things only. */
export const FORMS = [
    { id: 'cat', name: { en: 'cat', ko: '고양이' },
        can: { en: 'jump, squeeze into narrow places', ko: '뛰기, 좁은 곳 들어가기' },
        cannot: { en: 'speak, open doors, hold things', ko: '말하기, 문 열기, 물건 잡기' } },
    { id: 'dog', name: { en: 'dog', ko: '강아지' },
        can: { en: 'track by smell, run', ko: '냄새 맡기, 뛰기' },
        cannot: { en: 'speak, open doors (the tail gives every feeling away)', ko: '말하기, 문 열기 (꼬리로 감정이 다 들킴)' } },
    { id: 'fox', name: { en: 'fox', ko: '여우' },
        can: { en: 'sneak around, run fast', ko: '몰래 다니기, 빠르게 뛰기' },
        cannot: { en: 'speak, hold things', ko: '말하기, 물건 잡기' } },
    { id: 'rabbit', name: { en: 'rabbit', ko: '토끼' },
        can: { en: 'jump high and fast, hear well', ko: '높이·빨리 뛰기, 잘 듣기' },
        cannot: { en: 'speak, hold things', ko: '말하기, 물건 잡기' } },
    { id: 'sheep', name: { en: 'sheep', ko: '양' },
        can: { en: 'stand the cold in thick wool, blend into a flock', ko: '털로 추위 버티기, 무리에 섞이기' },
        cannot: { en: 'speak (only bleats), run fast, hold things', ko: '말하기(매애만 함), 빨리 뛰기, 물건 잡기' } },
    { id: 'turtle', name: { en: 'turtle', ko: '거북이' },
        can: { en: 'hide in the shell, swim', ko: '등껍질로 막기, 헤엄치기' },
        cannot: { en: 'open doors, move fast', ko: '문 열기, 빨리 움직이기' } },
    { id: 'owl', name: { en: 'owl', ko: '부엉이' },
        can: { en: 'fly, see well at night, turn the head far around', ko: '날기, 밤에 잘 보기, 고개 많이 돌리기' },
        cannot: { en: 'speak, stay awake easily in daytime', ko: '말하기, 낮에 깨어 있기' } },
    { id: 'bird', name: { en: 'small bird', ko: '새' },
        can: { en: 'fly, reach high places', ko: '날기, 높은 곳 가기' },
        cannot: { en: 'speak, hold things', ko: '말하기, 물건 잡기' } },
];

export function formById(id) { return FORMS.find(f => f.id === id) || null; }

/** Stacked curse stages (Polymorph). {form} = the final form's name. */
export const STAGES = [
    { id: 'ears', short: { en: 'Ears', ko: '귀' },
        look: { en: 'has sprouted {form} ears (or the nearest {form} feature)', ko: '{form} 귀가 돋음' },
        can: { en: 'almost everything as before', ko: '대부분 그대로' },
        cannot: { en: 'hide the ears', ko: '귀 숨기기' } },
    { id: 'tail', short: { en: 'Tail', ko: '꼬리' },
        look: { en: 'has {form} ears and a {form} tail', ko: '{form} 귀 + 꼬리' },
        can: { en: 'walk, speak', ko: '걷기, 말하기' },
        cannot: { en: 'hide the tail, sit comfortably', ko: '꼬리 숨기기, 편하게 앉기' } },
    { id: 'mute', short: { en: 'No words', ko: '말 못 함' },
        look: { en: 'has {form} ears and tail; only {form} sounds come out instead of words', ko: '{form} 귀 + 꼬리, 말 대신 울음' },
        can: { en: 'walk, gesture', ko: '걷기, 몸짓' },
        cannot: { en: 'speak', ko: '말하기' } },
    { id: 'full', short: { en: 'Full change', ko: '완전 변이' },
        look: { en: 'has fully become a {form}', ko: '{form}' },
        can: null, cannot: null }, // filled from the form
];
export const STAGE_MAX = STAGES.length;

/** Small pools for "leave empty → 🎲". */
export const RANDOM_OBJECTS = {
    en: ['an old silver ring', 'a candy from a stranger', 'a cracked hand mirror', 'a chipped teacup', 'a music box', 'a dusty book', 'a white feather', 'a foreign coin'],
    ko: ['낡은 은반지', '낯선 이가 준 사탕', '금 간 손거울', '이 빠진 찻잔', '오르골', '먼지 쌓인 책', '하얀 깃털', '낯선 나라 동전'],
};
export const RANDOM_PLACES = {
    en: ['the old fountain', 'a dry well', 'the back of the library', 'an overgrown garden', 'the attic', 'a crossroads at dusk'],
    ko: ['오래된 분수대', '마른 우물', '도서관 안쪽', '풀이 무성한 정원', '다락방', '해 질 녘 갈림길'],
};

export const SOURCES = ['unknown', 'object', 'place', 'me', 'trickster'];
export const MOTIVES = ['', 'prank', 'punishment', 'mistake', 'pact', 'trial', 'accident'];
export const TRIGGERS = ['now', 'turns', 'chance', 'condition'];
export const RELEASES = ['dispel', 'truth', 'action'];
export const VISIBILITY = ['all', 'targetUnaware', 'causeHidden'];
export const METHODS = ['', 'curse', 'stacked'];
export const DURATIONS = [3, 5, 10, 0]; // 0 = no end
export const MAX_EFFECTS = 4;

/** Motive → suggested defaults (only fills fields the user has not touched). */
export const MOTIVE_SUGGEST = {
    prank:      { duration: 3, trigger: 'now', release: 'dispel' },
    punishment: { trigger: 'condition', release: 'truth' },
    mistake:    { duration: 5, trigger: 'now', release: 'dispel' },
    pact:       { duration: 10, trigger: 'now', release: 'action' },
    trial:      { duration: 0, trigger: 'now', release: 'action' },
    accident:   { duration: 3, trigger: 'chance', release: 'dispel' },
};
