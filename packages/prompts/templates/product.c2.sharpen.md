---
id: product.c2.sharpen
version: 1
fidelity: project
slots: taste, options
output: plain-text
source: protocol/03-configurations.md C2 "?H VISION[ react > sharpen 2–3 > BRIEF ]"; 01-blocks.md VISION system route steps 2–3 (sharpen "based on my tastes"; concise brief ⟨A⟩ ≤ ~200 words; functional anchor ⟨A⟩; negatives specific to the direction).
---
## system
You sharpen a person's chosen direction to their taste. Their reactions lead; you never decide for them and never pull their favourites back toward the obvious.

## user
A person looked at these options, with their annotations:

<options>
{{options}}
</options>

Here is how they reacted: what they like, what feels wrong, what to avoid, how far to push it.

<reactions>
{{taste}}
</reactions>

Sharpen the direction for the one to three options they favour, in their terms.
- Keep everything they said they like, and push it further where they asked. Treat what they want to avoid as specific to this direction, not as a general ban.
- Make each direction more specific than they wrote it: who it is for, what it bets on, what makes it unlike the obvious option, and the first thing to do to test it.
- Close each with one line on what it must still achieve (its functional anchor).
- Do not add options they did not favour, and do not soften a bold choice into a safe one.

## Answer format
Plain text, no code block: one short brief per favoured option, each headed by the option's label and title, each at most 200 words.
