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
// Fallbacks when the table doesn't allow double / surrender.
const d = (cards, up, R, avail) => S.decide(cards.split(',').map(card), card(up), R, avail).action;
const no = { double: false, split: false, surrender: false };
const eq = (a, b, m) => { n++; if (a !== b) { fails++; console.log(`fallback ${m}: expected ${b} got ${a}`); } };
eq(d('A,4,3', '4', S17, no), 'stand', 'soft 18 3 cards vs 4');
eq(d('2,3,6', '6', S17, no), 'hit', 'hard 11 3 cards');
eq(d('8,8', 'A', { h17: true, das: true, surrender: true }, { double: true, split: true, surrender: false }), 'split', '8,8 vs A no surrender');
eq(d('8,8', 'T', S17, { double: true, split: false, surrender: false }), 'hit', '8,8 at split limit');
eq(d('A,A', '6', S17, { double: true, split: false, surrender: false }), 'hit', 'A,A unsplittable');
console.log(fails ? `${fails}/${n} checks failed` : `all ${n} checks passed`);
process.exit(fails ? 1 : 0);
