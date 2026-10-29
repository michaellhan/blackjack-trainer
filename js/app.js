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

  const st = {
    mode: store.get('mode', 'drill'),
    focus: store.get('focus', 'all'),
    rules: Object.assign({ h17: false, das: true, surrender: false }, store.get('rules', {})),
    sound: store.get('sound', true),
    stats: Object.assign(freshStats(), store.get('stats', {})),
    misses: store.get('misses', {}),
    bank: store.get('cash', START),
    shoe: [], dealer: [], hands: [], active: 0,
    phase: 'idle', // idle | decide | answered (drill) | busy | over (play)
    holeHidden: true, last: null, timer: 0,
  };
  const save = () => {
    store.set('stats', st.stats); store.set('misses', st.misses); store.set('cash', st.bank);
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
  function newShoe() {
    const s = [];
    for (let d = 0; d < DECKS; d++) for (const r of RANKS) for (const su of SUITS) s.push(mk(r, su));
    for (let i = s.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [s[i], s[j]] = [s[j], s[i]]; }
    st.shoe = s;
  }
  const draw = () => (st.mode === 'drill' ? randCard() : st.shoe.pop());
  const isBJ = cards => cards.length === 2 && total(cards).total === 21;
  const mkHand = cards => ({ cards, bet: 1, done: false, split: false, splitAces: false, surrendered: false, net: null, res: '' });
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
    if (st.phase === 'busy' || st.phase === 'decide') return;
    clearTimeout(st.timer);
    st.last = null; st.holeHidden = true; st.active = 0;
    setFeedback('');
    if (st.mode === 'drill') {
      const { cards, up } = genDrill();
      st.hands = [mkHand(cards)];
      st.dealer = [up, randCard()];
      st.phase = 'decide';
      render();
      return;
    }
    st.phase = 'busy';
    if (st.shoe.length < DECKS * 52 * 0.25) {
      newShoe(); setFeedback('<span class="muted">Shuffling a fresh shoe</span>');
      st.dealer = []; st.hands = []; render(); await wait(500);
    }
    st.dealer = []; st.hands = [mkHand([])];
    render(); await wait(180);
    for (const to of [st.hands[0].cards, st.dealer, st.hands[0].cards, st.dealer]) {
      to.push(draw()); render(); await wait(200);
    }
    const pbj = isBJ(st.hands[0].cards), dbj = isBJ(st.dealer);
    if (pbj || dbj) {
      if (dbj) { st.holeHidden = false; render(); await wait(400); }
      return settle();
    }
    st.phase = 'decide'; render();
  }

  async function act(a) {
    if (st.phase !== 'decide') return;
    const h = hand(), av = avail(h);
    if (!(a === 'hit' || a === 'stand' || av[a])) return bump(a);
    const d = Strategy.decide(h.cards, st.dealer[0], st.rules, av);
    const ok = d.action === a;
    record(d, ok);
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
      h.bet = 2; render(); await wait(160);
      h.cards.push(draw()); h.done = true;
    } else if (a === 'surrender') {
      h.surrendered = true; h.done = true;
    } else if (a === 'split') {
      const nh = mkHand([h.cards.pop()]);
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
      if (h.surrendered) { net = -0.5; h.res = 'Surrendered'; }
      else if (t > 21) { net = -h.bet; h.res = 'Bust'; }
      else if (nat && dbj) { net = 0; h.res = 'Push'; }
      else if (nat) { net = 1.5; h.res = 'Blackjack'; }
      else if (dbj) { net = -h.bet; h.res = 'Dealer blackjack'; }
      else if (dt > 21 || t > dt) { net = h.bet; h.res = dt > 21 ? 'Dealer busts' : 'Win'; }
      else if (t === dt) { net = 0; h.res = 'Push'; }
      else { net = -h.bet; h.res = 'Lose'; }
      h.net = net; sum += net;
    }
    st.bank += sum * BET; save();
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

  function showGrade() {
    const L = st.last, N = Strategy.NAMES;
    const spot = `${L.label} vs ${Strategy.upLabel(L.up)}`;
    const note = L.note ? `<span class="note">${L.note}</span>` : '';
    setFeedback(L.ok
      ? `<span class="ok">✓ ${N[L.action]}</span><span class="spot">${spot}</span>`
      : `<span class="bad">✗ ${N[L.chosen]}</span><span class="spot">${spot} → <b>${N[L.action]}</b></span>${note}`);
  }

  function setFeedback(html) { $('#feedback').innerHTML = html; }

  function bump(a) {
    const b = document.querySelector(`[data-a="${a}"]`);
    b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
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
    const hideHole = st.holeHidden && st.dealer.length > 1;
    $('#dealer-cards').innerHTML = st.dealer.map((c, i) => cardHTML(c, i === 1 && hideHole)).join('');
    const shown = hideHole ? [st.dealer[0]] : st.dealer;
    $('#dealer-total').textContent = shown.length ? totalLabel(shown) : '';

    const multi = st.hands.length > 1;
    $('#hands').innerHTML = st.hands.map((h, i) => {
      const cls = ['hand'];
      if (multi && i === st.active && st.phase !== 'over') cls.push('active');
      if (h.net != null) cls.push(h.net > 0 ? 'won' : h.net < 0 ? 'lost' : 'pushed');
      const bet = st.mode === 'play' ? `<span class="chip">${usd(h.bet * BET)}</span>` : '';
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
    const next = $('#next');
    next.disabled = deciding || st.phase === 'busy';
    next.firstChild.textContent = st.phase === 'idle' ? 'Deal' : st.mode === 'drill' ? 'Next hand' : 'Deal again';

    document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    renderStats();
    if ($('#chart').classList.contains('open')) renderChart();
  }

  function renderStats() {
    const s = st.stats, pct = s.n ? Math.round(100 * s.ok / s.n) + '%' : '—';
    const items = [
      ['Accuracy', pct, s.n ? `${s.ok}/${s.n}` : ''],
      ['Streak', s.streak, ''],
      ['Best', s.best, ''],
    ];
    if (st.mode === 'play') {
      const b = st.bank, shoe = st.shoe.length ? Math.round(100 * st.shoe.length / (DECKS * 52)) + '%' : '100%';
      items.push(['Bankroll', usd(b), ''], ['Shoe', shoe, '']);
    }
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
    if (m === 'play' && !st.shoe.length) newShoe();
    setFeedback('');
    deal();
  }

  $('#mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('#actions').addEventListener('click', e => { const b = e.target.closest('button'); if (b) act(b.dataset.a); });
  $('#next').addEventListener('click', deal);
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
    if (!confirm('Reset accuracy, streaks, missed spots and bankroll?')) return;
    st.stats = freshStats(); st.misses = {}; st.bank = START; save(); render(); renderChart();
  });
  // Buttons shouldn't keep focus, or Space would re-press them.
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });

  const KEYS = { h: 'hit', 1: 'hit', s: 'stand', 2: 'stand', d: 'double', 3: 'double', p: 'split', 4: 'split', r: 'surrender', 5: 'surrender' };
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    let handled = true;
    if (k === 'escape') closePanels();
    else if (KEYS[k]) act(KEYS[k]);
    else if (k === ' ' || k === 'enter' || k === 'n') deal();
    else if (k === 'c') openPanel('chart');
    else if (k === 'a') openPanel('about');
    else if (k === '?' || k === '/') openPanel('settings');
    else if (k === 'm') setSound(!st.sound);
    else if (k === 't') setMode(st.mode === 'drill' ? 'play' : 'drill');
    else handled = false;
    if (handled) e.preventDefault();
  });

  if (st.mode === 'play') newShoe();
  syncSettings();
  render();
  deal();
})();
