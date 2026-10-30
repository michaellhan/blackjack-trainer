// Basic strategy for multi-deck (4–8 decks) blackjack, dealer peeks for blackjack.
// Rules: h17 (dealer hits soft 17), das (double after split), surrender (late surrender).
// Chart codes: H hit, S stand, Dh double else hit, Ds double else stand, P split,
// Rh / Rs / Rp surrender else hit / stand / split.
const Strategy = (() => {
  const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 11 = ace

  const value = r => (r === 'A' ? 11 : 'TJQK'.includes(r) ? 10 : Number(r));

  function total(cards) {
    let t = 0, aces = 0;
    for (const c of cards) { t += value(c.r); if (c.r === 'A') aces++; }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { total: t, soft: aces > 0 };
  }

  const isPair = cards => cards.length === 2 && value(cards[0].r) === value(cards[1].r);

  function hardCode(t, u, R) {
    if (R.surrender) {
      if (t === 16 && u >= 9) return 'Rh';
      if (t === 15 && (u === 10 || (R.h17 && u === 11))) return 'Rh';
      if (t === 17 && R.h17 && u === 11) return 'Rs';
    }
    if (t <= 8) return 'H';
    if (t === 9) return u >= 3 && u <= 6 ? 'Dh' : 'H';
    if (t === 10) return u <= 9 ? 'Dh' : 'H';
    if (t === 11) return u <= 10 || R.h17 ? 'Dh' : 'H';
    if (t === 12) return u >= 4 && u <= 6 ? 'S' : 'H';
    if (t <= 16) return u <= 6 ? 'S' : 'H';
    return 'S';
  }

  function softCode(t, u, R) {
    if (t <= 12) return 'H'; // A,A that can't be split
    if (t <= 14) return u === 5 || u === 6 ? 'Dh' : 'H';
    if (t <= 16) return u >= 4 && u <= 6 ? 'Dh' : 'H';
    if (t === 17) return u >= 3 && u <= 6 ? 'Dh' : 'H';
    if (t === 18) {
      if (u >= 3 && u <= 6) return 'Ds';
      if (u === 2) return R.h17 ? 'Ds' : 'S';
      return u <= 8 ? 'S' : 'H';
    }
    if (t === 19) return R.h17 && u === 6 ? 'Ds' : 'S';
    return 'S';
  }

  // Pair code, or null when the pair should be played as a normal total.
  function pairCode(v, u, R) {
    switch (v) {
      case 11: return 'P';
      case 10: return null;
      case 9: return u === 7 || u >= 10 ? null : 'P';
      case 8: return R.h17 && R.surrender && u === 11 ? 'Rp' : 'P';
      case 7: return u <= 7 ? 'P' : null;
      case 6: return u <= 6 && (R.das || u >= 3) ? 'P' : null;
      case 5: return null;
      case 4: return R.das && (u === 5 || u === 6) ? 'P' : null;
      default: return u <= 7 && (R.das || u >= 4) ? 'P' : null; // 2s, 3s
    }
  }

  // Which chart row a hand belongs to. canSplit=false plays a pair as its total.
  function classify(cards, canSplit) {
    const { total: t, soft } = total(cards);
    if (canSplit && isPair(cards)) {
      const v = value(cards[0].r);
      return { kind: 'pair', key: v, label: (v === 11 ? 'A' : v) + ',' + (v === 11 ? 'A' : v) };
    }
    if (soft && t < 21) return { kind: 'soft', key: t, label: 'Soft ' + t };
    return { kind: 'hard', key: t, label: 'Hard ' + t };
  }

  function code(kind, key, u, R) {
    if (kind === 'pair') {
      const c = pairCode(key, u, R);
      if (c) return c;
      return key === 11 ? softCode(12, u, R) : hardCode(key * 2, u, R);
    }
    return kind === 'soft' ? softCode(key, u, R) : hardCode(key, u, R);
  }

  // avail: { double, split, surrender } — what the table allows for this hand right now.
  function resolve(c, avail) {
    switch (c) {
      case 'H': return 'hit';
      case 'S': return 'stand';
      case 'P': return 'split';
      case 'Dh': return avail.double ? 'double' : 'hit';
      case 'Ds': return avail.double ? 'double' : 'stand';
      case 'Rh': return avail.surrender ? 'surrender' : 'hit';
      case 'Rs': return avail.surrender ? 'surrender' : 'stand';
      case 'Rp': return avail.surrender ? 'surrender' : 'split';
    }
  }

  const NAMES = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' };
  const NOTES = {
    Dh: 'double if allowed, otherwise hit', Ds: 'double if allowed, otherwise stand',
    Rh: 'surrender if allowed, otherwise hit', Rs: 'surrender if allowed, otherwise stand',
    Rp: 'surrender if allowed, otherwise split',
  };

  function decide(cards, up, R, avail) {
    const u = value(up.r);
    const cls = classify(cards, avail.split);
    const c = code(cls.kind, cls.key, u, R);
    return { action: resolve(c, avail), code: c, ...cls, up: u, note: NOTES[c] || '' };
  }

  const upLabel = u => (u === 11 ? 'A' : String(u));

  // Hi-Lo index plays for multi-deck: the Illustrious 18 (insurance is separate) and the Fab 4
  // surrenders. Take `act` when the true count is at or above `idx` (below it, for `below`).
  const INSURANCE = 3;
  function deviations(R) {
    return [
      { t: 16, u: 10, idx: 0, act: 'stand' },
      { t: 15, u: 10, idx: 4, act: 'stand' },
      { pair: 10, u: 5, idx: 5, act: 'split' },
      { pair: 10, u: 6, idx: 4, act: 'split' },
      { t: 10, u: 10, idx: 4, act: 'double' },
      { t: 12, u: 3, idx: 2, act: 'stand' },
      { t: 12, u: 2, idx: 3, act: 'stand' },
      ...(R.h17 ? [] : [{ t: 11, u: 11, idx: 1, act: 'double' }]),
      { t: 9, u: 2, idx: 1, act: 'double' },
      { t: 10, u: 11, idx: R.h17 ? 3 : 4, act: 'double' },
      { t: 9, u: 7, idx: 3, act: 'double' },
      { t: 16, u: 9, idx: 5, act: 'stand' },
      { t: 13, u: 2, idx: -1, act: 'hit', below: true },
      { t: 12, u: 4, idx: 0, act: 'hit', below: true },
      { t: 12, u: 5, idx: -2, act: 'hit', below: true },
      { t: 12, u: 6, idx: -1, act: 'hit', below: true },
      { t: 13, u: 3, idx: -2, act: 'hit', below: true },
      { t: 14, u: 10, idx: 3, act: 'surrender', sur: true },
      { t: 15, u: 10, idx: 0, act: 'hit', below: true, sur: true },
      { t: 15, u: 9, idx: 2, act: 'surrender', sur: true },
      ...(R.h17 ? [] : [{ t: 15, u: 11, idx: 1, act: 'surrender', sur: true }]),
    ];
  }

  // Like decide(), but at true count `tc`. `dev` is the index play for this spot (if any),
  // `deviated` whether the count moved the play off basic strategy.
  function countPlay(cards, up, R, avail, tc) {
    const base = { ...decide(cards, up, R, avail), dev: null, deviated: false };
    if (base.kind === 'soft' || (base.kind === 'pair' && base.key !== 10)) return base;
    const list = deviations(R).filter(d => d.u === base.up && (base.kind === 'pair' ? d.pair === 10 : d.t === base.key));
    const hit = d => (d.below ? tc < d.idx : tc >= d.idx);
    const sur = avail.surrender ? list.find(d => d.sur) : null;
    if (sur && hit(sur)) return { ...base, action: sur.act, dev: sur, deviated: true };
    if (base.action === 'surrender') return { ...base, dev: sur };
    for (const d of list) {
      if (d.sur || (d.act === 'double' && !avail.double) || (d.act === 'split' && !avail.split)) continue;
      return hit(d) ? { ...base, action: d.act, dev: d, deviated: true } : { ...base, dev: d };
    }
    return { ...base, dev: sur };
  }

  return { UPS, value, total, isPair, classify, code, resolve, decide, NAMES, upLabel, INSURANCE, deviations, countPlay };
})();

if (typeof module !== 'undefined') module.exports = Strategy;
