(() => {
  const $ = s => document.querySelector(s);
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const DECKS = 6;
  const BET = 10, START = 1000; // Play mode: flat $10 bets from a $1,000 bankroll
  const usd = n => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US');
  const { value, total, isPair } = Strategy;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('bj:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bj:' + k, JSON.stringify(v)); } catch {} },
  };
  const freshStats = () => ({ n: 0, ok: 0, streak: 0, best: 0, kind: { hard: [0, 0], soft: [0, 0], pair: [0, 0] } });
  const freshCount = () => ({ n: 0, ok: 0, streak: 0, best: 0 });
  const freshGame = () => ({ bets: [0, 0], plays: [0, 0], devs: [0, 0], checks: [0, 0], net: 0 });
  // Game bet spread: 1 unit until the true count reaches +2, then 2 / 4 / 6 / 8 units at +2 / +3 / +4 / +5.
  const BETS = [1, 2, 4, 6, 8];
  const ramp = tc => (tc >= 5 ? 8 : tc >= 4 ? 6 : tc >= 3 ? 4 : tc >= 2 ? 2 : 1);
  // Whole true counts a player could fairly use: floored, rounded, or rounded from the 1-decimal display.
  const tcInts = tc => [...new Set([Math.round(tc), Math.floor(tc), Math.round(+tc.toFixed(1))])];

  const st = {
    mode: store.get('mode', 'drill'),
    focus: store.get('focus', 'all'),
    rules: Object.assign({ h17: false, das: true, surrender: false }, store.get('rules', {})),
    sound: store.get('sound', true),
    stats: Object.assign(freshStats(), store.get('stats', {})),
    misses: store.get('misses', {}),
    bank: store.get('cash', START),
    shoe: [], dealer: [], hands: [], active: 0,
    phase: 'idle', // idle | decide | answered (drill) | busy | over (play) | running | answer (count)
    holeHidden: true, last: null, timer: 0,
    // Counting: drill settings and stats, the current run / true-count spot, the open count prompt,
    // and every card dealt from the Play shoe.
    cnt: Object.assign({ type: 'game', speed: 'medium', len: 20, per: 1 }, store.get('count', {})),
    cstats: Object.assign(freshCount(), store.get('cstats', {})),
    showCount: store.get('showCount', false),
    run: null, cin: null, runId: 0, dealt: [],
    // Counting game: its own bankroll, lifetime stats, this shoe's stats, and the insurance bet.
    gbank: store.get('gcash', START),
    gstats: Object.assign(freshGame(), store.get('gstats', {})),
    gshoe: freshGame(), ins: 0,
  };
  if (st.cnt.type !== 'running') st.cnt.type = 'game'; // the old true-count drill is gone
  const inGame = () => st.mode === 'count' && st.cnt.type === 'game';
  const shoeMode = () => st.mode === 'play' || inGame();
  const save = () => {
    store.set('stats', st.stats); store.set('misses', st.misses); store.set('cash', st.bank); store.set('cstats', st.cstats);
    store.set('gcash', st.gbank); store.set('gstats', st.gstats);
  };

  // ---------- sound: right / wrong cues, plus win / lose when a played hand settles ----------
  const Sound = (() => {
    let ctx, out;
    function ac() {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C(); out = ctx.createGain(); out.gain.value = 0.6; out.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, t, dur, { type = 'sine', vol = 0.2, to } = {}) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    const arp = (t, fs, gap, opts) => fs.forEach((f, i) => tone(f, t + i * gap, 0.22, opts));
    const fx = {
      right: t => arp(t, [880, 1320], 0.07, { vol: 0.12 }),
      wrong: t => { tone(196, t, 0.13, { type: 'triangle', vol: 0.28 }); tone(147, t + 0.12, 0.22, { type: 'triangle', vol: 0.28 }); },
      win: t => arp(t, [523, 659, 784], 0.07, { vol: 0.13 }),
      lose: t => tone(330, t, 0.28, { vol: 0.12, to: 196 }),
    };
    return { play(n) { if (st.sound && ac()) fx[n](ctx.currentTime + 0.005); } };
  })();

  // ---------- cards ----------
  let cid = 0;
  const mk = (r, s) => ({ r, s: s || SUITS[Math.random() * 4 | 0], id: ++cid });
  const randCard = () => mk(RANKS[Math.random() * 13 | 0]);
  function shuffledShoe() {
    const s = [];
    for (let d = 0; d < DECKS; d++) for (const r of RANKS) for (const su of SUITS) s.push(mk(r, su));
    for (let i = s.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [s[i], s[j]] = [s[j], s[i]]; }
    return s;
  }
  function newShoe() { st.shoe = shuffledShoe(); st.dealt = []; st.gshoe = freshGame(); }
  function draw() {
    if (st.mode === 'drill') return randCard();
    const c = st.shoe.pop(); st.dealt.push(c); return c;
  }
  const isBJ = cards => cards.length === 2 && total(cards).total === 21;
  const mkHand = (cards, bet = 1) => ({ cards, bet, done: false, split: false, splitAces: false, surrendered: false, net: null, res: '' });
  const hand = () => st.hands[st.active];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Drill spots: weighted toward real decisions (skips naturals, hard 18+, hard 8-, soft 20+).
  function genDrill() {
    const kind = st.focus === 'all' ? ['hard', 'hard', 'soft', 'pair'][Math.random() * 4 | 0] : st.focus;
    for (;;) {
      let cards;
      if (kind === 'pair') {
        const v = 2 + (Math.random() * 10 | 0);
        const r = () => (v === 11 ? 'A' : v === 10 ? 'TJQK'[Math.random() * 4 | 0] : String(v));
        cards = [mk(r()), mk(r())];
      } else {
        cards = [randCard(), randCard()];
        if (Math.random() < 0.2) cards.push(randCard());
      }
      const t = total(cards), up = randCard();
      if (kind === 'hard') {
        if (cards.some(c => c.r === 'A') || isPair(cards) || t.total < 9 || t.total > 17) continue;
        if (t.total === 17 && Strategy.code('hard', 17, value(up.r), st.rules) === 'S') continue;
      }
      if (kind === 'soft' && (!t.soft || isPair(cards) || t.total < 13 || t.total > 19)) continue;
      return { cards, up };
    }
  }

  function avail(h) {
    const two = h.cards.length === 2;
    return {
      double: two && (!h.split || st.rules.das),
      split: two && isPair(h.cards) && st.hands.length < 4 && !(h.split && h.cards[0].r === 'A'),
      surrender: two && st.rules.surrender && !h.split,
    };
  }

  // ---------- round flow ----------
  async function deal() {
    if (st.cin) return;
    if (st.mode === 'count' && !inGame()) return startCount();
    if (['busy', 'decide', 'insure', 'bet'].includes(st.phase)) return;
    if (inGame()) return toBet();
    dealRound(1);
  }

  // Game: clear the table and wait for a bet (sometimes asking for the count first).
  function toBet() {
    clearTimeout(st.timer);
    st.dealer = []; st.hands = []; st.last = null; st.phase = 'bet';
    let msg = '<span class="prompt">Place your bet</span>';
    if (st.shoe.length < DECKS * 52 * 0.25) {
      const g = st.gshoe;
      msg = `<span class="muted">New shoe · last shoe ${g.net > 0 ? '+' : ''}${usd(g.net * BET)} · bets ${g.bets[0]}/${g.bets[1]} · plays ${g.plays[0]}/${g.plays[1]}</span>` + msg;
      newShoe();
    }
    setFeedback(msg);
    if (st.dealt.length && Math.random() < 0.2) return ask('play');
    render();
  }

  function placeBet(u) {
    if (!inGame() || st.phase !== 'bet' || st.cin) return;
    const p = playCount(), want = ramp(Math.round(p.tc));
    const ok = tcInts(p.tc).some(t => ramp(t) === u);
    recordGame('bets', ok);
    Sound.play(ok ? 'right' : 'wrong');
    setFeedback(`<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} Bet ${usd(u * BET)}</span><span class="spot">TC ${signed(p.tc, 1)}${ok ? '' : ` → bet <b>${usd(want * BET)}</b>`}</span>`);
    dealRound(u, true);
  }

  async function dealRound(units, keepFeedback) {
    clearTimeout(st.timer);
    st.last = null; st.holeHidden = true; st.active = 0; st.ins = 0;
    if (!keepFeedback) setFeedback('');
    if (st.mode === 'drill') {
      const { cards, up } = genDrill();
      st.hands = [mkHand(cards)];
      st.dealer = [up, randCard()];
      st.phase = 'decide';
      render();
      return;
    }
    st.phase = 'busy';
    if (!inGame() && st.shoe.length < DECKS * 52 * 0.25) {
      newShoe(); setFeedback('<span class="muted">Shuffling a fresh shoe · count resets to 0</span>');
      st.dealer = []; st.hands = []; render(); await wait(500);
    }
    st.dealer = []; st.hands = [mkHand([], units)];
    render(); await wait(180);
    for (const to of [st.hands[0].cards, st.dealer, st.hands[0].cards, st.dealer]) {
      to.push(draw()); render(); await wait(200);
    }
    if (inGame() && st.dealer[0].r === 'A') {
      st.phase = 'insure';
      $('#feedback').insertAdjacentHTML('beforeend', '<span class="prompt">Insurance?</span>');
      return render();
    }
    afterPeek();
  }

  async function afterPeek() {
    const pbj = isBJ(st.hands[0].cards), dbj = isBJ(st.dealer);
    if (pbj || dbj) {
      if (dbj) { st.holeHidden = false; render(); await wait(400); }
      return settle();
    }
    st.phase = 'decide'; render();
  }

  // Game: insurance (or even money) with an ace up is worth it from a true count of +3.
  function insure(take) {
    if (st.phase !== 'insure' || st.cin) return;
    const tc = playCount().tc, want = Math.round(tc) >= Strategy.INSURANCE;
    const ok = tcInts(tc).some(t => take === t >= Strategy.INSURANCE);
    recordGame('plays', ok); recordGame('devs', ok);
    Sound.play(ok ? 'right' : 'wrong');
    const name = t => (t ? 'Insurance' : 'No insurance');
    setFeedback(`<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${name(take)}</span><span class="spot">${ok ? '' : `<b>${name(want)}</b> · `}insure at TC ≥ +${Strategy.INSURANCE} · TC ${signed(tc, 1)}</span>`);
    st.ins = take ? st.hands[0].bet / 2 : 0;
    st.phase = 'busy'; render();
    afterPeek();
  }

  async function act(a) {
    if (st.phase !== 'decide' || st.cin) return;
    const h = hand(), av = avail(h);
    if (!(a === 'hit' || a === 'stand' || av[a])) return bump(a);
    let d, ok;
    if (inGame()) {
      // Grade at every fair whole true count, so rounding or flooring both pass.
      const tc = playCount().tc;
      const plays = tcInts(tc).map(t => Strategy.countPlay(h.cards, st.dealer[0], st.rules, av, t));
      ok = plays.some(x => x.action === a);
      d = { ...plays[0], dev: plays.find(x => x.dev)?.dev || null, tc };
      recordGame('plays', ok);
      if (d.dev) recordGame('devs', ok);
    } else {
      d = Strategy.decide(h.cards, st.dealer[0], st.rules, av);
      ok = d.action === a;
      record(d, ok);
    }
    st.last = { ...d, chosen: a, ok };
    showGrade();
    Sound.play(ok ? 'right' : 'wrong');

    if (st.mode === 'drill') {
      st.phase = 'answered'; render();
      if (ok) st.timer = setTimeout(deal, 750);
      return;
    }

    st.phase = 'busy'; render();
    if (a === 'hit') {
      h.cards.push(draw());
      if (total(h.cards).total >= 21) h.done = true;
    } else if (a === 'stand') {
      h.done = true;
    } else if (a === 'double') {
      h.bet *= 2; render(); await wait(160);
      h.cards.push(draw()); h.done = true;
    } else if (a === 'surrender') {
      h.surrendered = true; h.done = true;
    } else if (a === 'split') {
      const nh = mkHand([h.cards.pop()], h.bet);
      h.split = nh.split = true;
      h.splitAces = nh.splitAces = h.cards[0].r === 'A';
      st.hands.splice(st.active + 1, 0, nh);
      render(); await wait(220);
      h.cards.push(draw());
      if (h.splitAces || total(h.cards).total === 21) h.done = true;
    }
    render(); await wait(240);
    advance();
  }

  // Move to the next unfinished hand, dealing the second card to split hands as they come up.
  async function advance() {
    while (st.active < st.hands.length) {
      const h = hand();
      if (h.cards.length === 1) {
        h.cards.push(draw()); render(); await wait(240);
        if (h.splitAces || total(h.cards).total === 21) h.done = true;
      }
      if (!h.done) { st.phase = 'decide'; return render(); }
      st.active++;
    }
    dealerPlay();
  }

  async function dealerPlay() {
    st.phase = 'busy';
    st.holeHidden = false; render(); await wait(450);
    if (st.hands.some(h => !h.surrendered && total(h.cards).total <= 21)) {
      for (;;) {
        const t = total(st.dealer);
        if (t.total > 17 || (t.total === 17 && !(t.soft && st.rules.h17))) break;
        st.dealer.push(draw()); render(); await wait(480);
      }
    }
    settle();
  }

  function settle() {
    if (st.holeHidden) { st.holeHidden = false; }
    const dt = total(st.dealer).total, dbj = isBJ(st.dealer);
    let sum = 0;
    for (const h of st.hands) {
      const t = total(h.cards).total, nat = !h.split && isBJ(h.cards);
      let net;
      if (h.surrendered) { net = -h.bet / 2; h.res = 'Surrendered'; }
      else if (t > 21) { net = -h.bet; h.res = 'Bust'; }
      else if (nat && dbj) { net = 0; h.res = 'Push'; }
      else if (nat) { net = 1.5 * h.bet; h.res = 'Blackjack'; }
      else if (dbj) { net = -h.bet; h.res = 'Dealer blackjack'; }
      else if (dt > 21 || t > dt) { net = h.bet; h.res = dt > 21 ? 'Dealer busts' : 'Win'; }
      else if (t === dt) { net = 0; h.res = 'Push'; }
      else { net = -h.bet; h.res = 'Lose'; }
      h.net = net; sum += net;
    }
    if (st.ins) {
      const v = dbj ? 2 * st.ins : -st.ins;
      sum += v;
      $('#feedback').insertAdjacentHTML('beforeend', `<span class="note">Insurance ${v > 0 ? 'pays +' : 'loses '}${usd(v * BET)}</span>`);
    }
    if (inGame()) { st.gbank += sum * BET; st.gshoe.net += sum; } else st.bank += sum * BET;
    save();
    if (sum) Sound.play(sum > 0 ? 'win' : 'lose');
    st.phase = 'over'; st.active = -1;
    render();
  }

  // ---------- grading ----------
  const cellKey = (kind, key, up) => kind + ':' + (kind === 'hard' ? Math.min(18, Math.max(8, key)) : key) + ':' + up;

  function record(d, ok) {
    const s = st.stats;
    s.n++; s.kind[d.kind][1]++;
    if (ok) { s.ok++; s.kind[d.kind][0]++; s.streak++; s.best = Math.max(s.best, s.streak); }
    else { s.streak = 0; const k = cellKey(d.kind, d.key, d.up); st.misses[k] = (st.misses[k] || 0) + 1; }
    save();
  }

  function recordGame(k, ok) {
    for (const g of [st.gstats, st.gshoe]) { g[k][1]++; if (ok) g[k][0]++; }
    save();
  }

  function showGrade() {
    const L = st.last, N = Strategy.NAMES;
    const spot = `${L.label} vs ${Strategy.upLabel(L.up)}`;
    const note = L.dev
      ? `<span class="note">Index play: ${N[L.dev.act].toLowerCase()} at TC ${L.dev.below ? '<' : '≥'} ${signed(L.dev.idx)} · TC now ${signed(L.tc, 1)}</span>`
      : L.note && !L.ok ? `<span class="note">${L.note}</span>` : '';
    setFeedback(L.ok
      ? `<span class="ok">✓ ${N[L.chosen]}</span><span class="spot">${spot}</span>${note}`
      : `<span class="bad">✗ ${N[L.chosen]}</span><span class="spot">${spot} → <b>${N[L.action]}</b></span>${note}`);
  }

  function setFeedback(html) { $('#feedback').innerHTML = html; }

  function bump(a) {
    const b = document.querySelector(`[data-a="${a}"]`);
    b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
  }

  // ---------- card counting (Hi-Lo) ----------
  const hilo = c => ('23456'.includes(c.r) ? 1 : '789'.includes(c.r) ? 0 : -1);
  const signed = (n, dp = 0) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(dp);
  const SPEEDS = { slow: 1000, medium: 700, fast: 450, pro: 300 };

  async function startCount() {
    if (st.phase === 'running' || st.cin) return;
    clearTimeout(st.timer);
    setFeedback(''); st.run = null;
    const cards = shuffledShoe().slice(0, st.cnt.len);
    st.run = { cards, shown: 0, rc: cards.reduce((n, c) => n + hilo(c), 0) };
    st.phase = 'running'; render();
    const id = ++st.runId;
    await wait(350);
    while (st.run && st.run.shown < cards.length) {
      if (id !== st.runId) return;
      st.run.shown = Math.min(cards.length, st.run.shown + st.cnt.per); render();
      await wait(SPEEDS[st.cnt.speed]);
    }
    if (id === st.runId) ask('running');
  }

  // Visible Play count: every card dealt this shoe except a face-down hole card.
  function playCount() {
    const hole = st.holeHidden && st.dealer[1] ? st.dealer[1].id : null;
    const rc = st.dealt.reduce((n, c) => n + (c.id === hole ? 0 : hilo(c)), 0);
    const decks = (st.shoe.length + (hole ? 1 : 0)) / 52;
    return { rc, decks, tc: rc / decks };
  }

  function checkCount() {
    if (!shoeMode() || st.phase === 'busy' || st.cin) return;
    ask('play');
  }

  function ask(kind) {
    if (kind !== 'play') st.phase = 'answer';
    st.cin = { kind, text: '' };
    setFeedback('<span class="prompt">Running count?</span>');
    render();
  }

  // Keyboard entry while a count prompt is open; returns true if the key was used.
  function countKey(key) {
    const c = st.cin;
    if (/^[0-9]$/.test(key)) { if (c.text.replace('-', '').length < 3) c.text = (c.text === '0' ? '' : c.text) + key; }
    else if (key === '-' || key === '_') c.text = c.text.startsWith('-') ? c.text.slice(1) : '-' + c.text;
    else if (key === 'ArrowUp' || key === '+' || key === '=') return step(1), true;
    else if (key === 'ArrowDown') return step(-1), true;
    else if (key === 'Backspace') c.text = c.text.slice(0, -1);
    else if (key === 'Enter') return submitCount(), true;
    else if (key === 'Escape' && c.kind === 'play') { st.cin = null; setFeedback(''); render(); return true; }
    else return false;
    render(); return true;
  }
  function step(d) { st.cin.text = String((parseInt(st.cin.text, 10) || 0) + d); render(); }

  function submitCount() {
    const c = st.cin; if (!c) return;
    const ans = parseInt(c.text, 10) || 0;
    let ok, detail;
    if (c.kind === 'play') {
      const p = playCount();
      ok = ans === p.rc;
      detail = `${ok ? 'Running count' : `Running count is <b>${signed(p.rc)}</b>`} · true ${signed(p.tc, 1)} · ${p.decks.toFixed(1)} decks left`;
    } else {
      ok = ans === st.run.rc;
      detail = ok ? `after ${st.run.cards.length} cards` : `The count was <b>${signed(st.run.rc)}</b>`;
    }
    if (inGame()) recordGame('checks', ok);
    else {
      const s = st.cstats;
      s.n++;
      if (ok) { s.ok++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
      save();
    }
    Sound.play(ok ? 'right' : 'wrong');
    setFeedback(`<span class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'} ${signed(ans)}</span><span class="spot">${detail}</span>`);
    st.cin = null;
    if (c.kind !== 'play') st.phase = 'answered';
    render();
  }

  function renderCount() {
    const busy = st.phase === 'running' || st.phase === 'answer';
    $('#count-config').hidden = busy;
    document.querySelectorAll('.seg[data-cfg]').forEach(g => {
      const k = g.dataset.cfg;
      g.hidden = st.cnt.type !== 'running' && k !== 'type';
      g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(st.cnt[k])));
    });
    let html = '';
    if (st.run) {
      const { cards, shown } = st.run;
      if (st.phase === 'running') {
        const cur = shown ? cards.slice(Math.max(0, shown - st.cnt.per), shown) : [];
        html = `<div class="cards">${cur.map(c => cardHTML(c)).join('')}</div><div class="progress">${shown} / ${cards.length}</div>`;
      } else if (st.phase === 'answer') {
        html = `<div class="cards"><div class="card ghost">?</div></div><div class="progress">${cards.length} / ${cards.length}</div>`;
      } else {
        let rc = 0;
        html = `<div class="review">${cards.map(c => {
          const v = hilo(c); rc += v;
          const red = c.s === '♥' || c.s === '♦' ? ' red' : '';
          return `<span class="mini ${v > 0 ? 'p' : v < 0 ? 'n' : 'z'}${red}" title="count ${signed(rc)}">${c.r === 'T' ? '10' : c.r}${c.s}<b>${signed(v)}</b></span>`;
        }).join('')}</div>`;
      }
    } else {
      html = `<div class="count-intro">Keep a running count as ${st.cnt.len} cards flash by, then enter it.</div>`;
    }
    $('#count-stage').innerHTML = html;
  }

  // ---------- rendering ----------
  const seen = new Set();
  function cardHTML(c, hidden) {
    const id = hidden ? 'b' + c.id : c.id;
    const fresh = seen.has(id) ? '' : seen.has('b' + c.id) ? ' flip' : ' enter';
    seen.add(id);
    if (hidden) return `<div class="card back${fresh}"></div>`;
    const red = c.s === '♥' || c.s === '♦' ? ' red' : '';
    const r = c.r === 'T' ? '10' : c.r;
    return `<div class="card${red}${fresh}"><span class="idx">${r}<i>${c.s}</i></span><span class="pip">${c.s}</span></div>`;
  }

  function totalLabel(cards, natural = true) {
    const t = total(cards);
    if (natural && isBJ(cards)) return 'BJ';
    return t.soft && t.total < 21 ? `${t.total - 10}/${t.total}` : String(t.total);
  }

  function render() {
    document.body.dataset.mode = inGame() ? 'game' : st.mode;
    if (st.mode === 'count') renderCount();
    const hideHole = st.holeHidden && st.dealer.length > 1;
    $('#dealer-cards').innerHTML = st.dealer.map((c, i) => cardHTML(c, i === 1 && hideHole)).join('');
    const shown = hideHole ? [st.dealer[0]] : st.dealer;
    $('#dealer-total').textContent = shown.length ? totalLabel(shown) : '';

    const multi = st.hands.length > 1;
    $('#hands').innerHTML = st.hands.map((h, i) => {
      const cls = ['hand'];
      if (multi && i === st.active && st.phase !== 'over') cls.push('active');
      if (h.net != null) cls.push(h.net > 0 ? 'won' : h.net < 0 ? 'lost' : 'pushed');
      const bet = shoeMode() ? `<span class="chip">${usd(h.bet * BET)}</span>` : '';
      const res = h.res ? `<span class="res">${h.res}${h.net ? ` ${h.net > 0 ? '+' : ''}${usd(h.net * BET)}` : ''}</span>` : '';
      return `<div class="${cls.join(' ')}"><div class="cards">${h.cards.map(c => cardHTML(c)).join('')}</div>
        <div class="label">${bet}<span class="total">${h.cards.length ? totalLabel(h.cards, !h.split) : ''}</span>${res}</div></div>`;
    }).join('');

    const deciding = st.phase === 'decide';
    const av = deciding ? avail(hand()) : {};
    const graded = st.phase === 'answered' ? st.last : null;
    document.querySelectorAll('#actions button').forEach(b => {
      const a = b.dataset.a;
      b.hidden = a === 'surrender' && !st.rules.surrender;
      b.disabled = !deciding || !(a === 'hit' || a === 'stand' || av[a]);
      b.classList.toggle('right', !!graded && graded.action === a);
      b.classList.toggle('wrong', !!graded && !graded.ok && graded.chosen === a);
    });
    const betting = st.phase === 'bet' && !st.cin, insuring = st.phase === 'insure' && !st.cin;
    $('#bet-row').hidden = !betting;
    $('#ins-row').hidden = !insuring;
    $('#actions').hidden = betting || insuring;
    const next = $('#next'), cin = $('#count-input');
    next.disabled = deciding || ['busy', 'running', 'bet', 'insure'].includes(st.phase);
    next.firstChild.textContent = inGame() ? (st.phase === 'bet' ? 'Place a bet' : 'Next hand')
      : st.mode === 'count'
      ? (st.phase === 'running' ? 'Counting…' : st.phase === 'idle' ? 'Start' : 'Next run')
      : st.phase === 'idle' ? 'Deal' : st.mode === 'drill' ? 'Next hand' : 'Deal again';
    cin.hidden = !st.cin;
    if (st.cin) {
      $('#count-value').textContent = st.cin.text === '' ? '0' : st.cin.text.replace('-', '−');
      $('#count-value').classList.toggle('empty', st.cin.text === '');
    }
    document.body.classList.toggle('asking', !!st.cin);
    $('#count-check').hidden = !shoeMode();
    $('#count-check').disabled = st.phase === 'busy';

    document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    renderStats();
    if ($('#chart').classList.contains('open')) renderChart();
  }

  function renderStats() {
    if (inGame()) return renderGameStats();
    const s = st.mode === 'count' ? st.cstats : st.stats, pct = s.n ? Math.round(100 * s.ok / s.n) + '%' : '—';
    const items = [
      ['Accuracy', pct, s.n ? `${s.ok}/${s.n}` : ''],
      ['Streak', s.streak, ''],
      ['Best', s.best, ''],
    ];
    if (st.mode === 'play') {
      const b = st.bank, shoe = st.shoe.length ? Math.round(100 * st.shoe.length / (DECKS * 52)) + '%' : '100%';
      items.push(['Bankroll', usd(b), ''], ['Shoe', shoe, '']);
      if (st.showCount) { const p = playCount(); items.push(['Count', signed(p.rc), `true ${signed(p.tc, 1)}`]); }
    }
    $('#stats').innerHTML = items.map(([k, v, sub]) =>
      `<div><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="s">${sub}</span>` : ''}</div>`).join('');
  }

  function renderGameStats() {
    const g = st.gstats, pc = ([ok, n]) => (n ? Math.round(100 * ok / n) + '%' : '—');
    const items = [
      ['Bankroll', usd(st.gbank), ''],
      ['Bets', pc(g.bets), g.bets[1] ? `${g.bets[0]}/${g.bets[1]}` : ''],
      ['Plays', pc(g.plays), g.devs[1] ? `index ${g.devs[0]}/${g.devs[1]}` : ''],
      ['Count', pc(g.checks), g.checks[1] ? `${g.checks[0]}/${g.checks[1]}` : ''],
      ['Shoe', Math.round(100 * st.shoe.length / (DECKS * 52)) + '%', ''],
    ];
    if (st.showCount) { const p = playCount(); items.push(['True', signed(p.tc, 1), `RC ${signed(p.rc)}`]); }
    $('#stats').innerHTML = items.map(([k, v, sub]) =>
      `<div><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="s">${sub}</span>` : ''}</div>`).join('');
  }

  // ---------- chart ----------
  const ROWS = {
    hard: [[8, '≤8'], ...[9, 10, 11, 12, 13, 14, 15, 16, 17].map(t => [t, String(t)]), [18, '18+']],
    soft: [13, 14, 15, 16, 17, 18, 19, 20].map(t => [t, 'A,' + (t - 11)]),
    pair: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(v => [v, v === 11 ? 'A,A' : v === 10 ? 'T,T' : v + ',' + v]),
  };
  const TITLES = { hard: 'Hard totals', soft: 'Soft totals', pair: 'Pairs' };

  function renderChart() {
    const R = st.rules;
    $('#chart-rules').textContent = `${DECKS} decks · ${R.h17 ? 'H17' : 'S17'} · ${R.das ? 'DAS' : 'no DAS'}${R.surrender ? ' · late surrender' : ''}`;
    $('#legend-r').hidden = !R.surrender;
    const L = st.last, lastKey = L ? cellKey(L.kind, L.key, L.up) : '';
    let html = '';
    for (const kind of ['hard', 'soft', 'pair']) {
      const [c, n] = st.stats.kind[kind];
      html += `<h3>${TITLES[kind]}${n ? `<span>${Math.round(100 * c / n)}% of ${n}</span>` : ''}</h3><table><tr><th></th>${Strategy.UPS.map(u => `<th>${Strategy.upLabel(u)}</th>`).join('')}</tr>`;
      for (const [key, label] of ROWS[kind]) {
        html += `<tr><th>${label}</th>`;
        for (const u of Strategy.UPS) {
          const code = Strategy.code(kind, key, u, R);
          const k = cellKey(kind, key, u), miss = st.misses[k];
          const txt = code === 'Ds' ? 'Ds' : code[0];
          html += `<td class="c-${code[0]}${k === lastKey ? ' cur' : ''}" title="${label} vs ${Strategy.upLabel(u)}: ${code}">${txt}${miss ? `<i title="missed ${miss}×"></i>` : ''}</td>`;
        }
        html += '</tr>';
      }
      html += '</table>';
    }
    const N = Strategy.NAMES;
    html += `<h3>Count index plays<span>Hi-Lo, true count</span></h3><table class="list">`;
    html += `<tr><td>Insurance</td><td>A</td><td>Take at TC ≥ +${Strategy.INSURANCE}</td></tr>`;
    for (const d of Strategy.deviations(R)) {
      if (d.sur && !R.surrender) continue;
      html += `<tr><td>${d.pair ? 'T,T' : 'Hard ' + d.t}</td><td>${Strategy.upLabel(d.u)}</td><td>${N[d.act]} at TC ${d.below ? '<' : '≥'} ${signed(d.idx)}</td></tr>`;
    }
    html += `</table><h3>Bet ramp<span>$10 units</span></h3><table class="list">`;
    for (const [lbl, tc] of [['≤ +1', 1], ['+2', 2], ['+3', 3], ['+4', 4], ['+5 or more', 5]]) html += `<tr><td>TC ${lbl}</td><td>${usd(ramp(tc) * BET)}</td></tr>`;
    html += '</table>';
    $('#chart-body').innerHTML = html;
  }

  // ---------- panels & settings ----------
  function openPanel(id) {
    const was = $('#' + id).classList.contains('open');
    closePanels();
    if (was) return;
    $('#' + id).classList.add('open'); $('#' + id).setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('show');
    if (id === 'chart') renderChart();
  }
  function closePanels() {
    document.querySelectorAll('.drawer').forEach(d => { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); });
    $('#scrim').classList.remove('show');
  }

  function syncSettings() {
    document.querySelectorAll('#focus button').forEach(b => b.classList.toggle('on', b.dataset.focus === st.focus));
    document.querySelectorAll('#rule-h17 button').forEach(b => b.classList.toggle('on', b.dataset.v === (st.rules.h17 ? '1' : '0')));
    $('#rule-das').checked = st.rules.das;
    $('#rule-surrender').checked = st.rules.surrender;
    $('#opt-sound').checked = st.sound;
    $('#opt-showcount').checked = st.showCount;
    $('#about-h17').textContent = st.rules.h17 ? 'hits' : 'stands';
    $('#about-das').textContent = st.rules.das ? 'allowed' : 'not allowed';
    $('#about-surrender').textContent = st.rules.surrender ? 'allowed' : 'off';
    document.body.classList.toggle('muted', !st.sound);
  }

  function setRules(patch) {
    Object.assign(st.rules, patch); store.set('rules', st.rules);
    syncSettings(); render();
  }

  function setSound(on) {
    st.sound = on; store.set('sound', on); syncSettings();
    if (on) Sound.play('right');
  }

  function setMode(m) {
    if (m === st.mode || st.phase === 'busy') return;
    clearTimeout(st.timer);
    st.mode = m; store.set('mode', m);
    st.dealer = []; st.hands = []; st.phase = 'idle'; st.last = null;
    st.runId++; st.run = st.cin = null;
    if (m === 'play' || inGame()) newShoe();
    setFeedback('');
    if (m === 'count' && !inGame()) render(); else deal();
  }
  const MODES = ['drill', 'play', 'count'];

  $('#mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('#actions').addEventListener('click', e => { const b = e.target.closest('button'); if (b) act(b.dataset.a); });
  $('#next').addEventListener('click', deal);
  $('#count-check').addEventListener('click', checkCount);
  $('#count-submit').addEventListener('click', submitCount);
  $('#count-input').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b && st.cin) step(Number(b.dataset.step)); });
  document.addEventListener('click', e => {
    const b = e.target.closest('.seg[data-cfg] button');
    if (!b || st.phase === 'busy') return;
    const k = b.closest('.seg').dataset.cfg;
    st.cnt[k] = k === 'len' || k === 'per' ? Number(b.dataset.v) : b.dataset.v;
    store.set('count', st.cnt);
    clearTimeout(st.timer); st.runId++; st.run = st.cin = null;
    st.dealer = []; st.hands = []; st.phase = 'idle'; st.last = null; setFeedback('');
    if (inGame()) { newShoe(); toBet(); } else render();
  });
  $('#bet-row').addEventListener('click', e => { const b = e.target.closest('[data-bet]'); if (b) placeBet(Number(b.dataset.bet)); });
  $('#ins-row').addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (b) insure(b.dataset.ins === '1'); });
  $('#opt-showcount').addEventListener('change', e => { st.showCount = e.target.checked; store.set('showCount', st.showCount); render(); });
  $('#btn-about').addEventListener('click', () => openPanel('about'));
  $('#btn-chart').addEventListener('click', () => openPanel('chart'));
  $('#btn-settings').addEventListener('click', () => openPanel('settings'));
  $('#btn-sound').addEventListener('click', () => setSound(!st.sound));
  $('#scrim').addEventListener('click', closePanels);
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  $('#focus').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.focus = b.dataset.focus; store.set('focus', st.focus); syncSettings();
  });
  $('#rule-h17').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setRules({ h17: b.dataset.v === '1' }); });
  $('#rule-das').addEventListener('change', e => setRules({ das: e.target.checked }));
  $('#rule-surrender').addEventListener('change', e => setRules({ surrender: e.target.checked }));
  $('#opt-sound').addEventListener('change', e => setSound(e.target.checked));
  $('#reset').addEventListener('click', () => {
    if (!confirm('Reset accuracy, streaks, missed spots, counting stats and bankroll?')) return;
    st.stats = freshStats(); st.cstats = freshCount(); st.gstats = freshGame(); st.misses = {};
    st.bank = st.gbank = START; save(); render(); renderChart();
  });
  // Buttons shouldn't keep focus, or Space would re-press them.
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });

  const KEYS = { h: 'hit', 1: 'hit', s: 'stand', 2: 'stand', d: 'double', 3: 'double', p: 'split', 4: 'split', r: 'surrender', 5: 'surrender' };
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target.closest?.('input, textarea, select')) return;
    if (st.cin && countKey(e.key)) return e.preventDefault();
    const k = e.key.toLowerCase();
    if (st.phase === 'bet' && /^[1-5]$/.test(k)) return placeBet(BETS[k - 1]), e.preventDefault();
    if (st.phase === 'insure' && (k === 'y' || k === 'i' || k === 'n')) return insure(k !== 'n'), e.preventDefault();
    let handled = true;
    if (k === 'escape') closePanels();
    else if (KEYS[k]) act(KEYS[k]);
    else if (k === ' ' || k === 'enter' || k === 'n') deal();
    else if (k === 'c') openPanel('chart');
    else if (k === 'a') openPanel('about');
    else if (k === '?' || k === '/') openPanel('settings');
    else if (k === 'm') setSound(!st.sound);
    else if (k === 'k') checkCount();
    else if (k === 't') setMode(MODES[(MODES.indexOf(st.mode) + 1) % MODES.length]);
    else handled = false;
    if (handled) e.preventDefault();
  });

  if (shoeMode()) newShoe();
  syncSettings();
  render();
  if (st.mode !== 'count' || inGame()) deal();
})();
