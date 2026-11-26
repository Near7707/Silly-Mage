# Mage

*A wizard walks into the tavern.* **Mage** is a SillyTavern extension that plants **magic events** in your chat. You set who cast the spell, why, and when, and Mage reminds the AI every turn so it doesn't forget.

[한국어 설명은 여기 (README.ko.md)](README.ko.md)

You can just type "she turned into a cat" and the AI will play along. A few turns later, though, it usually forgets. Mage handles the parts the AI can't do on its own:

- **Keeps the state.** Every turn it quietly tells the AI the current form, the turns left, and what the body can and cannot do.
- **Changes the body's abilities.** A palm-sized body can't open doors, and a turtle can't run.
- **Counts for you.** It tracks duration, curse stages and chance rolls, and only the result goes to the AI.
- **Keeps the story consistent.** The cause stays fixed and is sent every turn, so the AI doesn't invent a new reason each time.

## Spells

| Spell | Family | What it does |
|---|---|---|
| **Polymorph** | Change | Turns the target into a creature: cat, dog, fox, rabbit, sheep, turtle, owl, bird. You can also type your own form and let the AI fill in its abilities, or roll 🎲 (from all forms or only the ones you checked). |
| **Titan** | Change | The body grows to twice its height. Same shape, just bigger. |
| **Mite** | Change | The body shrinks to palm size. Same shape, just smaller. |
| **Levitate** | Change | Floats. Easy to reach high places, hard to hold things. |
| **Truth** | Mind | Cannot lie. |
| **Reverse** | Mind | Everything they say comes out reversed. |
| **Charm** | Mind | People nearby want to be kind to them. |
| **Fear** | Mind | Gripped by fear; runs or hides. |
| **Sleep** | Mind | Deep magical sleep. The **⏰ Woken up** button breaks it. |
| **Glamour** | Illusion | Only the look changes ("looks like …"). Not a real change; it may slip. |
| **Invisibility** | Illusion | Completely unseen: no sound, footsteps or scent. The **✋ Touched someone** button breaks it. |
| **Luck / Jinx** | Fate | Things go well — or, turned around, keep going wrong. |
| **Dispel** | Ward | Removes one effect, or every effect of one family. |

**Stacking curse.** Each time a condition happens (for example "💧 touched water"), the target changes one step: ears → tail → no words → full change.

## How to use

1. Open **Mage** from the wand menu (or from its panel in Extensions).
2. **Cast**: choose *Who / What / How long*. Open **More** to set who cast it, why, when it fires (now, after some turns, a chance each turn, or a condition), how it ends, and who knows.
3. **🎲 Cause** asks the AI for a cause that ties into the recent story. You see it first and choose whether to use it.
4. The **status bar above the input box** shows active effects. When the condition happens in the story, press its button. Press **↶** to undo the last press. Each chip shows the target's picture (character card or persona image); a spell cast on two people at once shares one chip.
5. Press **⌃** to open the status window. It can be dragged by its title bar, folded, and it remembers where you put it.

### Turns, swipes and deletes

- 1 turn = your message + one AI reply.
- Each condition press is tied to the message that was last when you pressed it. If that message is **deleted or re-rolled (swiped)**, the press no longer counts.
- Turns left are always counted from the chat as it is now, so a swipe never uses up a turn twice.
- A spell that hasn't fired yet is **not** told to the AI, so it can't spoil it.

### Who can break a spell

- Only magic **you** cast (who cast it = **Me**, under *More*) can be dispelled. Magic from anyone or anything else — unknown, an object, a place, a trickster — has no Dispel button: it ends only the set way (turns running out, telling the truth, or a certain act).
- The AI is also told that such magic holds even if the story claims it broke (setting: **Curses end only the set way**, on by default).
- Every card has a **⋯** menu with **Force clear (never happened)** for emergencies. It removes the effect and tells the AI nothing.

### Magic rules (optional)

Off by default — cast freely, as before. Turn on **Magic rules** in the settings and spells *you* cast follow these rules (magic from others stays free, but you can't dispel it):

- **Mana**: max 10 (changeable), +1 each turn. Costs: Change 3 · Mind 2 · Illusion 2 · Fate 2 · Dispel 2, and +2 for a spell with no end. Shown as `◆ 7/10` on the status bar.
- **Cooldown**: a spell you cast rests 3 turns; Dispel rests 2.
- **Loadout**: you carry up to 6 spells per chat (changeable). Spells you add later rest 3 turns first.
- **Reload ↻**: once per chat, fill your mana and reset every cooldown. It comes back every 20 turns.

Mana, cooldowns and Reload are worked out from the chat as it is, so deleting or re-rolling messages winds them back too.

### AI judging

After each AI reply, Mage sends one small side request asking whether a condition happened in the newest part of the story (told the truth, woken up, the curse condition…). It only asks while there is something to judge — no conditions, no request.

- **Suggest** (default): the condition button gets a **?** and a **✦ n** button appears on the status bar. Tap it to see the AI's reason, then **Apply** or **No**.
- **Auto**: applied at once, with a short notice; **↶** takes it back.
- **Off**: you press the buttons yourself, as before.

It also notices when the story *says* a spell broke. For a spell you cast, it offers **Dispel**. For anyone else's, it tells you it holds — it only ends the set way.

Suggestions belong to the reply they were made for: re-roll or delete that reply and they are gone.

### Characters who cast spells

In the **Casters** tab, give each character of the chat spells of their own (each member of a group chat has its own list). These settings belong to this chat only; **Copy from a chat** takes them from another chat with the same character.

- **Spells**: any spell except Dispel. **How often**: at most once every N turns (10 by default). **Lasts**: 3, 5 or 10 turns (5 by default).
- **A. As the story goes** (always on): when the story shows the character casting, AI judging suggests it (or casts it in Auto mode). A spell that is not on the list, or one cast too soon, always asks first.
- **B. Extension dice** (optional): on a hit, the AI writing the reply is quietly told the character casts a spell this turn. The check afterwards confirms it really happened.
- A character's spell works like magic you did not cast: no mana, no loadout, no Dispel. It ends when its turns run out, or when the character undoes it (AI judging notices that too).
- It belongs to the reply it was cast in: re-roll or delete that reply and the spell is gone. **↶** also takes it back.
- In **More**, you can also pick a character as the one who cast a spell yourself.
- **Cast in secret** (with the dice): half of the hits are cast in secret. The AI does not show the casting, and the spell shows only as an unknown effect until you press **Show answer**.

Both need AI judging to be on.

### Secrets

- **Keep how it ends a secret** (in **More**, when it ends by telling the truth or by an act): the card shows "???", and you find the way in the story. AI judging still knows it and tells you when it seems found; the answer shows on that card only. **Drop clues** sends the AI one small hint every few turns (2–20, or none). **Show answer** reveals it; the spell stays.
- **Who knows → No one knows it is magic**: everyone in the story, the target too, takes it as odd, unexplained happenings.
- **Send an omen before it fires** (for a spell that waits): one small odd sign goes to the AI, once: 1 turn before a delayed spell fires, or in the next reply for one that waits on a chance or a condition.

### Flair

- **Block**: a character's spell can be blocked instead of applied — on its AI suggestion card, on the card of a spell that just went in on its own (Auto mode), or before a waiting spell fires. Nothing takes hold, and the next reply shows the magic bouncing off. With the magic rules on a block costs 3 mana; otherwise you can block once every 10 turns. **↶** takes a block back.
- **Something is felt**: when an omen goes out for a spell you did not cast, or a secret cast comes in and you sense it, a dashed **👁 ???** shows on the status bar until the next reply. Tap it to **Block** or **Leave it**. Who and what stay hidden. How likely you sense a secret cast is set per character in the **Casters** tab (**Chance to sense it**, 30% by default, 0 = never).
- **Delayed spells**: when a character lays a spell to take hold later ("you'll see when the sun sets"), AI judging suggests it with when and in how many turns (3 when it cannot tell; change it with − / +). It waits, sends an omen 1 turn before, then takes hold.
- **Misfires · critical hits** (off by default, spells you cast yourself only): a misfire hits another target, takes another form, or bounces back at you (5%); a critical hit lasts twice as long, with no cooldown when the rules are on (10%). A toast tells you at once, the card gets a tag, and **↶** puts the spell back as you meant it. Mana is spent as usual.
- **Record cards in the chat** (on by default): a small card under each message where magic happened — under your message what you did, under a reply what happened in it. Tap a line to open its status card. The cards are on screen only: nothing is written into the message, the chat file, or what the AI is sent. They show no more than the status window does. Turning the setting (or Mage) off removes them at once.

### Settings

- **Look**: Default (follows your theme), Old tome, or Cursed book. Every look has the same buttons in the same places.
- **Magic in this world**: Common (people shrug it off), Rare (people are surprised), or None (it's just strange).
- **Connection profile** used for 🎲 Cause and "Fill in". If you leave it empty, your current API is used.
- **Magic rules**, max mana, loadout size, and **Curses end only the set way**.
- **AI judging**: mode (Off / Suggest / Auto), **Tell me when the story says a spell broke**, the connection profile for checks (same as 🎲 Cause by default), and how many recent messages it reads (4).
- **Flair**: misfires · critical hits and their chances, record cards in the chat.
- Language (English / 한국어), the random-form pool, a window-position reset, and backup export/import.

What the AI receives is always short English text (1–2 lines per effect). The AI still replies in whatever language you normally use. At most 4 effects can be active at once.

## Install

In SillyTavern, open **Extensions → Install extension** and paste:

```
https://github.com/Near7707/Silly-Mage
```

## Known limits

- The AI can still sometimes ignore or over-explain an effect. The note is kept short and clear to make this less likely.
- AI judging can be wrong, which is why Suggest asks you first. Each check is one extra small request.
- Record cards are placed under the message text; a theme or another extension that changes how messages are built may move them.
- In group chats, the dice roll for the member about to reply; this depends on SillyTavern telling which member it is.

## Trying it without SillyTavern

```
python3 test/server.py      # then open http://localhost:8124/test/index.html?fresh
python3 test/run.py         # automatic checks (needs Playwright + Chrome)
```

## License

AGPL-3.0
