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

### Settings

- **Look**: Default (follows your theme), Old tome, or Cursed book. Every look has the same buttons in the same places.
- **Magic in this world**: Common (people shrug it off), Rare (people are surprised), or None (it's just strange).
- **Connection profile** used for 🎲 Cause and "Fill in". If you leave it empty, your current API is used.
- Language (English / 한국어), the random-form pool, a window-position reset, and backup export/import.

What the AI receives is always short English text (1–2 lines per effect). The AI still replies in whatever language you normally use. At most 4 effects can be active at once.

## Install

In SillyTavern, open **Extensions → Install extension** and paste:

```
https://github.com/Near7707/Silly-Mage
```

## Known limits

- The AI can still sometimes ignore or over-explain an effect. The note is kept short and clear to make this less likely.
- Conditions are judged by your button press. AI-suggested judging, secret conditions, characters casting spells, and the other spell families come in later stages.

## Trying it without SillyTavern

```
python3 test/server.py      # then open http://localhost:8124/test/index.html?fresh
python3 test/run.py         # automatic checks (needs Playwright + Chrome)
```

## License

AGPL-3.0
