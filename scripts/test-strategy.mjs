// Checks the strategy engine against the published multi-deck basic strategy charts.
import { createRequire } from 'node:module';
const S = createRequire(import.meta.url)('../js/strategy.js');
const UPS = '2 3 4 5 6 7 8 9 T A'.split(' ');
const card = r => ({ r });
let fails = 0, n = 0;
// Each row: hand, then the expected code for upcards 2..A.
function check(R, name, rows) {
  for (const [hand, codes] of rows) {
    const cards = hand.split(',').map(card);
    codes.split(' ').forEach((exp, i) => {
      const cls = S.classify(cards, true), up = S.value(UPS[i] === 'T' ? 'T' : UPS[i]);
      const got = S.code(cls.kind, cls.key, up, R);
      n++;
      if (got !== exp) { fails++; console.log(`${name}: ${hand} vs ${UPS[i]} expected ${exp} got ${got}`); }
    });
  }
}
const S17 = { h17: false, das: true, surrender: false };
check(S17, 'S17 DAS', [
  ['3,5', 'H H H H H H H H H H'],
  ['4,5', 'H Dh Dh Dh Dh H H H H H'],
  ['4,6', 'Dh Dh Dh Dh Dh Dh Dh Dh H H'],
  ['5,6', 'Dh Dh Dh Dh Dh Dh Dh Dh Dh H'],
  ['T,2', 'H H S S S H H H H H'],
  ['T,3', 'S S S S S H H H H H'],
  ['T,6', 'S S S S S H H H H H'],
  ['T,7', 'S S S S S S S S S S'],
  ['A,2', 'H H H Dh Dh H H H H H'],
  ['A,4', 'H H Dh Dh Dh H H H H H'],
  ['A,6', 'H Dh Dh Dh Dh H H H H H'],
  ['A,7', 'S Ds Ds Ds Ds S S H H H'],
  ['A,8', 'S S S S S S S S S S'],
  ['2,2', 'P P P P P P H H H H'],
  ['4,4', 'H H H P P H H H H H'],
  ['5,5', 'Dh Dh Dh Dh Dh Dh Dh Dh H H'],
  ['6,6', 'P P P P P H H H H H'],
  ['7,7', 'P P P P P P H H H H'],
  ['8,8', 'P P P P P P P P P P'],
  ['9,9', 'P P P P P S P P S S'],
  ['T,T', 'S S S S S S S S S S'],
  ['K,Q', 'S S S S S S S S S S'],
  ['A,A', 'P P P P P P P P P P'],
]);
check({ h17: true, das: true, surrender: true }, 'H17 DAS LS', [
  ['5,6', 'Dh Dh Dh Dh Dh Dh Dh Dh Dh Dh'],
  ['T,5', 'S S S S S H H H Rh Rh'],
  ['T,6', 'S S S S S H H Rh Rh Rh'],
  ['T,7', 'S S S S S S S S S Rs'],
  ['A,7', 'Ds Ds Ds Ds Ds S S H H H'],
  ['A,8', 'S S S S Ds S S S S S'],
  ['8,8', 'P P P P P P P P P Rp'],
]);
check({ h17: false, das: false, surrender: true }, 'S17 noDAS LS', [
  ['2,2', 'H H P P P P H H H H'],
  ['4,4', 'H H H H H H H H H H'],
  ['6,6', 'H P P P P H H H H H'],
  ['T,5', 'S S S S S H H H Rh H'],
  ['T,6', 'S S S S S H H Rh Rh Rh'],
  ['8,8', 'P P P P P P P P P P'],
]);
// 2 decks, from the Wizard of Odds double-deck charts.
const DD = { ...S17, decks: 2 };
check(DD, '2D S17 DAS', [
  ['4,5', 'Dh Dh Dh Dh Dh H H H H H'],
  ['5,6', 'Dh Dh Dh Dh Dh Dh Dh Dh Dh Dh'],
  ['T,2', 'H H S S S H H H H H'],
  ['A,3', 'H H H Dh Dh H H H H H'],
  ['A,6', 'H Dh Dh Dh Dh H H H H H'],
  ['A,7', 'S Ds Ds Ds Ds S S H H H'],
  ['2,2', 'P P P P P P H H H H'],
  ['4,4', 'H H H P P H H H H H'],
  ['6,6', 'P P P P P P H H H H'],
  ['7,7', 'P P P P P P P H H H'],
  ['8,8', 'P P P P P P P P P P'],
  ['9,9', 'P P P P P S P P S S'],
]);
check({ ...DD, das: false, surrender: true }, '2D S17 noDAS LS', [
  ['T,5', 'S S S S S H H H Rh H'],
  ['T,6', 'S S S S S H H H Rh Rh'],
  ['2,2', 'H H P P P P H H H H'],
  ['6,6', 'P P P P P H H H H H'],
  ['7,7', 'P P P P P P H H H H'],
]);
check({ ...DD, h17: true, surrender: true }, '2D H17 DAS LS', [
  ['T,5', 'S S S S S H H H Rh Rh'],
  ['T,6', 'S S S S S H H H Rh Rh'],
  ['T,7', 'S S S S S S S S S Rs'],
  ['A,3', 'H H Dh Dh Dh H H H H H'],
  ['A,6', 'H Dh Dh Dh Dh H H H H H'],
  ['A,7', 'Ds Ds Ds Ds Ds S S H H H'],
  ['A,8', 'S S S S Ds S S S S S'],
  ['8,8', 'P P P P P P P P P P'],
]);
check({ ...DD, h17: true, das: false, surrender: true }, '2D H17 noDAS LS', [['8,8', 'P P P P P P P P P Rp']]);
// Fallbacks when the table doesn't allow double / surrender.
const d = (cards, up, R, avail) => S.decide(cards.split(',').map(card), card(up), R, avail).action;
const no = { double: false, split: false, surrender: false };
const eq = (a, b, m) => { n++; if (a !== b) { fails++; console.log(`fallback ${m}: expected ${b} got ${a}`); } };
eq(d('A,4,3', '4', S17, no), 'stand', 'soft 18 3 cards vs 4');
eq(d('2,3,6', '6', S17, no), 'hit', 'hard 11 3 cards');
eq(d('8,8', 'A', { h17: true, das: true, surrender: true }, { double: true, split: true, surrender: false }), 'split', '8,8 vs A no surrender');
eq(d('8,8', 'T', S17, { double: true, split: false, surrender: false }), 'hit', '8,8 at split limit');
eq(d('A,A', '6', S17, { double: true, split: false, surrender: false }), 'hit', 'A,A unsplittable');
// Hi-Lo index plays: [hand, up, tc, rules, avail, expected action]
const all = { double: true, split: true, surrender: false };
const LS = { h17: false, das: true, surrender: true };
const H = { h17: true, das: true, surrender: false };
const HLS = { ...H, surrender: true };
const cp = (h, up, tc, R, av) => S.countPlay(h.split(',').map(card), card(up), R, av, tc).action;
for (const [h, up, tc, R, av, exp] of [
  ['T,6', 'T', -1, S17, all, 'hit'], ['T,6', 'T', 0, S17, all, 'stand'], ['9,7', 'T', 3, S17, all, 'stand'],
  ['T,6', 'T', -3, LS, { ...all, surrender: true }, 'surrender'],
  ['8,8', 'T', 5, S17, all, 'split'],
  ['T,5', 'T', 3, S17, all, 'hit'], ['T,5', 'T', 4, S17, all, 'stand'],
  ['T,5', 'T', -1, LS, { ...all, surrender: true }, 'hit'], ['T,5', 'T', 0, LS, { ...all, surrender: true }, 'surrender'],
  ['T,4', 'T', 3, LS, { ...all, surrender: true }, 'surrender'], ['T,4', 'T', 2, LS, { ...all, surrender: true }, 'hit'],
  ['T,T', '5', 4, S17, all, 'stand'], ['T,T', '5', 5, S17, all, 'split'], ['K,Q', '6', 4, S17, all, 'split'],
  ['T,T', '6', 6, S17, { ...all, split: false }, 'stand'],
  ['6,4', 'T', 4, S17, all, 'double'], ['6,4', 'T', 3, S17, all, 'hit'], ['2,4,4', 'T', 6, S17, no, 'hit'],
  ['T,2', '3', 2, S17, all, 'stand'], ['T,2', '2', 2, S17, all, 'hit'], ['T,2', '2', 3, S17, all, 'stand'],
  ['T,2', '4', -1, S17, all, 'hit'], ['T,2', '4', 0, S17, all, 'stand'], ['T,3', '2', -2, S17, all, 'hit'],
  ['6,5', 'A', 0, S17, all, 'hit'], ['6,5', 'A', 1, S17, all, 'double'],
  ['5,4', '2', 1, S17, all, 'double'], ['5,4', '7', 3, S17, all, 'double'], ['6,4', 'A', 4, S17, all, 'double'],
  ['T,6', '9', 5, S17, all, 'stand'], ['A,6', '2', 9, S17, all, 'hit'],
  // Pairs that aren't split play as their total, so they take that total's index plays.
  ['5,5', 'T', 3, S17, all, 'hit'], ['5,5', 'T', 4, S17, all, 'double'], ['5,5', 'A', 4, S17, all, 'double'],
  ['6,6', '2', 2, { ...S17, das: false }, all, 'hit'], ['6,6', '2', 3, { ...S17, das: false }, all, 'stand'],
  ['7,7', 'T', 2, LS, { ...all, surrender: true }, 'hit'], ['7,7', 'T', 3, LS, { ...all, surrender: true }, 'surrender'],
  ['8,8', '9', 6, S17, all, 'split'], ['6,6', '4', 9, S17, all, 'split'], ['9,9', 'T', 9, S17, all, 'stand'],
  // H17 indexes that differ from S17.
  ['T,2', '6', -2, S17, all, 'hit'], ['T,2', '6', -1, S17, all, 'stand'],
  ['T,2', '6', -4, H, all, 'hit'], ['T,2', '6', -3, H, all, 'stand'],
  ['6,5', 'A', -1, H, all, 'hit'], ['6,5', 'A', 0, H, all, 'double'],
  ['T,5', 'A', 0, LS, { ...all, surrender: true }, 'hit'], ['T,5', 'A', 1, LS, { ...all, surrender: true }, 'surrender'],
  ['T,5', 'A', -2, HLS, { ...all, surrender: true }, 'hit'], ['T,5', 'A', -1, HLS, { ...all, surrender: true }, 'surrender'],
  ['6,4', 'A', 2, H, all, 'hit'], ['6,4', 'A', 3, H, all, 'double'],
  // 2 decks: where the chart doubles, the index says when to hit, and it needs the double to be on offer.
  ['5,4', '2', 0, DD, all, 'hit'], ['5,4', '2', 1, DD, all, 'double'],
  ['6,5', 'A', -1, DD, all, 'hit'], ['6,5', 'A', 0, DD, all, 'double'],
  ['T,5', 'T', 2, DD, all, 'hit'], ['T,5', 'T', 3, DD, all, 'stand'],
  ['T,6', 'T', 0, DD, all, 'hit'], ['T,6', 'T', 1, DD, all, 'stand'],
  ['T,2', '4', 0, DD, all, 'hit'], ['T,2', '4', 1, DD, all, 'stand'],
  ['T,6', '9', 5, DD, all, 'hit'], ['T,6', '9', 6, DD, all, 'stand'],
]) eq(cp(h, up, tc, R, av), exp, `index ${h} vs ${up} at TC ${tc}`);
const pd = (h, up, R, av, tc) => S.countPlay(h.split(',').map(card), card(up), R, av, tc);
eq(pd('5,4', '2', DD, all, 0).dev?.idx, 1, '2-deck 9 v 2 shows its index');
eq(pd('2,3,4', '2', DD, no, 0).dev, null, 'no double, no index on a 3-card 9 v 2');
eq(S.insurance(S17), 3, '6-deck insurance'); eq(S.insurance(DD), 2, '2-deck insurance');
console.log(fails ? `${fails}/${n} checks failed` : `all ${n} checks passed`);
process.exit(fails ? 1 : 0);
