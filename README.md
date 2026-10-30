# Blackjack Trainer

A minimal blackjack trainer: basic strategy and Hi-Lo card counting. Static site, no build step.

Live at **https://www.michael-han.com/blackjack/**

- **Drill** — random decision spots (weighted toward real decisions: no naturals, no hard 18+), graded instantly against basic strategy. Correct answers auto-advance; misses show the right play and wait for you. Focus on hard totals, soft totals or pairs in Settings.
- **Play** — full hands from a 6-deck shoe (reshuffled at 75%): splits (up to 4 hands, split aces get one card), doubles, late surrender, dealer peek, 3:2 blackjack. Every decision is still graded; flat $10 bets against a $1,000 bankroll (reset in Settings).
- **Count** — Hi-Lo drills. *Running count*: 10 / 20 / 52 cards flash by (slow → pro speed, 1 or 2 at a time), then you enter the count and get a card-by-card review. *True count*: a running count and decks left; rounding or flooring both accepted.
- **Count in Play** — press `K` anytime to check your count of every card seen this shoe (hole card once flipped); optional live count display in Settings.
- **Chart** — the full strategy chart for the current rules, with the last spot highlighted and a dot on every cell you've missed.
- **Rules** — dealer stands/hits soft 17, double after split, late surrender. The chart and grading follow whatever is set.
- Sound for right / wrong (and win / lose in Play), toggle with `M`.

## Keys

`H` hit · `S` stand · `D` double · `P` split · `R` surrender (or `1`–`5`) · `Space`/`Enter` deal / next · `K` check count (Play) · `0`–`9` `-` `↑` `↓` `Enter` type a count · `T` drill/play/count · `C` chart · `A` about · `M` mute · `?` settings · `Esc` close

## Run

```bash
node scripts/serve.mjs 8792
```

## Test

```bash
node scripts/test-strategy.mjs
```

Checks every chart cell against published 4–8 deck basic strategy (S17/H17, DAS/no DAS, surrender) plus the double/surrender fallbacks.

## Deploy

```bash
scripts/deploy.sh
```

Runs the tests, copies the app into `michaellhan/michaellhan.github.io` under `blackjack/` (with cache-busting `?v=<commit>` on css/js), pushes, then pushes this repo.
