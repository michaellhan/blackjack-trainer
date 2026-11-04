# Blackjack Trainer

A minimal blackjack trainer: basic strategy and Hi-Lo card counting. Static site, no build step.

Live at **https://www.michael-han.com/blackjack/**

- **Play** — full hands from a 6-deck shoe (reshuffled at 75%): splits (up to 4 hands, split aces get one card), doubles, late surrender, dealer peek, 3:2 blackjack. Every decision is still graded; flat $10 bets against a $1,000 bankroll (reset in Settings).
- **Count** — a full 6-deck shoe where you count while you play: bet off the true count ($10 to TC +1, then $20 / $40 / $60 / $80 at +2 / +3 / +4 / +5+), take insurance at TC +3, and use the Illustrious 18 + Fab 4 index plays. Bets, plays (index plays tracked separately) and random count checks are graded; each shoe ends with a summary. Separate $1,000 bankroll. The true count only shows after a mistake unless the live count is on. Each tab keeps its own hand and shoe when you switch away.
- **Count → Running count drill** — 10 / 20 / 52 cards flash by (slow → pro speed, 1 or 2 at a time), then you enter the count and get a card-by-card review.
- **Count checks** — press `K` in Play or Game to check your count of every card seen this shoe (hole card once flipped); optional live count display in Settings.
- **Chart** — the full strategy chart for the current rules, with the last spot highlighted and a dot on every cell you've missed.
- **Rules** — dealer stands/hits soft 17, double after split, late surrender. The chart and grading follow whatever is set.
- Sound for right / wrong (and win / lose in Play), toggle with `M`.

## Keys

`H` hit · `S` stand · `D` double · `P` split · `R` surrender (or `1`–`5`) · `Space`/`Enter` deal / next · `K` check count (Play, Game) · `1`–`5` bet (Game) · `Y`/`N` insurance (Game) · `0`–`9` `-` `↑` `↓` `Enter` type a count · `T` play/count · `C` chart · `A` about · `M` mute · `?` settings · `Esc` close

## Run

```bash
node scripts/serve.mjs 8792
```

## Test

```bash
node scripts/test-strategy.mjs
```

Checks the chart against published 4–8 deck basic strategy for three rule sets, plus the double/surrender fallbacks and the Hi-Lo index plays.

## Deploy

```bash
scripts/deploy.sh
```

Runs the tests, copies the app into `michaellhan/michaellhan.github.io` under `blackjack/` (with cache-busting `?v=<commit>` on css/js), pushes, then pushes this repo.
