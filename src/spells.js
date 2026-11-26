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
    polymorph:    { family: 'change', icon: 'polymorph', forms: true },
    titan:        { family: 'change', icon: 'titan' },
    mite:         { family: 'change', icon: 'mite' },
    levitate:     { family: 'change', icon: 'levitate', simple: true },
    truth:        { family: 'mind', icon: 'truth', simple: true },
    reverse:      { family: 'mind', icon: 'reverse', simple: true },
    charm:        { family: 'mind', icon: 'charm', simple: true },
    fear:         { family: 'mind', icon: 'fear', simple: true },
    sleep:        { family: 'mind', icon: 'sleep', simple: true },
    glamour:      { family: 'illusion', icon: 'glamour', simple: true },
    invisibility: { family: 'illusion', icon: 'invisibility', simple: true },
    luck:         { family: 'fate', icon: 'luck', simple: true },
    dispel:       { family: 'ward', icon: 'dispel', utility: true },
};
export const SPELL_ORDER = ['polymorph', 'titan', 'mite', 'levitate', 'truth', 'reverse', 'charm', 'fear', 'sleep',
    'glamour', 'invisibility', 'luck', 'dispel'];

/**
 * Spells that only change what someone can do (no new body). {who} = target name, {x} = typed
 * detail (Glamour). `breaker`: a built-in button that ends it (Sleep: woken up, Invisibility:
 * touched someone). `react`: whether people nearby react when it starts.
 */
export const SIMPLE = {
    levitate: {
        effect: { en: 'floats in the air, drifting gently', ko: '몸이 둥둥 뜸' },
        can: { en: 'reach high places, cross gaps', ko: '높은 곳 가기, 틈 건너기' },
        cannot: { en: 'stand firmly, grab things easily', ko: '땅에 서 있기, 물건 잘 잡기' },
        start: '{who} has just started to float off the ground.',
        end: '{who} has just drifted back down to the ground.', react: true,
    },
    truth: {
        effect: { en: 'cannot lie; whatever they say comes out as the truth', ko: '거짓말을 못 함 — 하는 말이 다 진실로 나옴' },
        can: { en: 'speak, stay silent', ko: '말하기, 입 다물기' },
        cannot: { en: 'lie, dodge with half-truths', ko: '거짓말, 얼버무리기' },
        start: '{who} has just been put under Truth: from this reply on, they cannot lie.',
        end: '{who} can lie again.', react: false,
    },
    reverse: {
        effect: { en: 'everything they say comes out as the opposite of what they mean', ko: '하는 말이 전부 반대로 나옴' },
        can: { en: 'gesture, show things', ko: '몸짓, 보여 주기' },
        cannot: { en: 'say what they really mean', ko: '하고 싶은 말 그대로 하기' },
        start: "{who}'s words have just started coming out reversed (they say the opposite of what they mean).",
        end: "{who}'s words come out normally again.", react: true,
    },
    charm: {
        effect: { en: 'irresistibly likable; people nearby want to be kind to them and help them', ko: '호감이 쏠려 주변 사람들이 잘해 주고 도우려 함' },
        can: { en: 'ask favors easily', ko: '부탁하기 쉬움' },
        cannot: { en: 'make people dislike them', ko: '미움받기' },
        start: '{who} has just become strangely charming; people nearby start treating them kindly.',
        end: 'The charm on {who} has faded; people act normally again.', react: false,
    },
    fear: {
        effect: { en: 'gripped by magical fear; avoids danger and tends to run or hide', ko: '겁에 질려 피하거나 도망치려 함' },
        can: { en: 'run, hide', ko: '도망치기, 숨기' },
        cannot: { en: 'stay calm, face what scares them', ko: '침착하기, 무서운 것 마주하기' },
        start: '{who} is suddenly gripped by magical fear.',
        end: 'The fear has left {who}.', react: true,
    },
    sleep: {
        effect: { en: 'in a deep magical sleep', ko: '마법에 걸려 깊이 잠듦' },
        can: { en: 'dream, mumble in their sleep', ko: '꿈꾸기, 잠꼬대' },
        cannot: { en: 'move on purpose, talk, notice what happens', ko: '움직이기, 말하기, 주변 알아채기' },
        start: '{who} has just fallen into a deep magical sleep.',
        end: '{who} has just woken up.', react: true,
        breaker: { label: { en: '⏰ Woken up', ko: '⏰ 깨움' }, rule: { en: 'Ends if someone wakes them.', ko: '누가 깨우면 풀림' }, end: 'Someone woke {who}: they have just woken up.' },
    },
    glamour: {
        needsX: true,
        effect: { en: 'looks like {x} to everyone (only an illusion; the body is unchanged, and it may slip)', ko: '겉모습이 {x}(으)로 보임 (환영일 뿐, 들킬 수 있음)' },
        can: { en: 'pass as {x} at a glance', ko: '{x}인 척하기' },
        cannot: { en: 'change their voice or habits', ko: '목소리·버릇 바꾸기' },
        start: '{who} has just started to look like {x} to everyone (an illusion, not a real change).',
        end: 'The illusion on {who} has fallen away; they look like themselves again.', react: false,
    },
    invisibility: {
        effect: { en: 'completely unseen: no sight, sound, footsteps or scent; no one notices them at all', ko: '완전히 안 보임 — 소리·발자국·냄새도 없음' },
        can: { en: 'move unseen, listen in', ko: '몰래 다니기, 엿듣기' },
        cannot: { en: 'be noticed in any way', ko: '누구에게든 알아채지기' },
        start: '{who} has just vanished completely. From now on no one can see, hear or sense them; do not write anyone noticing a presence.',
        end: '{who} has just become visible again. Write the moment they reappear.', react: false,
        breaker: { label: { en: '✋ Touched someone', ko: '✋ 건드림' }, rule: { en: 'Ends at once if they touch or bump into anyone.', ko: '누구를 건드리거나 부딪히면 바로 풀림' }, end: '{who} touched or bumped into someone and has just been revealed. Write the moment they appear.' },
    },
    luck: {
        variants: ['good', 'bad'],
        effect: { en: 'very lucky; things tend to work out for them', ko: '운이 좋아 일이 잘 풀림' },
        effectBad: { en: 'jinxed; small things keep going wrong for them', ko: '자꾸 일이 꼬임' },
        can: null, cannot: null,
        start: '{who} has just become very lucky.', startBad: '{who} has just been jinxed.',
        end: "{who}'s luck is back to normal.", react: false,
    },
};

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

export const SOURCES = ['unknown', 'object', 'place', 'me', 'character', 'trickster'];
export const MOTIVES = ['', 'prank', 'punishment', 'mistake', 'pact', 'trial', 'accident'];
export const TRIGGERS = ['now', 'turns', 'chance', 'condition'];
export const RELEASES = ['dispel', 'truth', 'action'];
export const VISIBILITY = ['all', 'targetUnaware', 'causeHidden', 'nobody'];
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
