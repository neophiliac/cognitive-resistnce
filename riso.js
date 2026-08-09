/* ═══════════════════════════════════════════════════════════════
   riso.js — print artefacts + ambient motion
   reticle · ambient lattice · text scramble · reveals · ticker
   hero plate network
   ═══════════════════════════════════════════════════════════════ */

window.CR = window.CR || {};

CR.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
CR.coarse  = window.matchMedia('(pointer: coarse)').matches;

/* shared pointer state — the lattice and the reticle both read it */
CR.pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false };

/* ── crosshair reticle ───────────────────────────────────────── */
(function reticle(){
  const el = document.getElementById('reticle');
  if (!el || CR.reduced || CR.coarse) return;

  let x = CR.pointer.x, y = CR.pointer.y, tx = x, ty = y;

  addEventListener('pointermove', (e) => {
    tx = e.clientX; ty = e.clientY;
    CR.pointer.x = tx; CR.pointer.y = ty; CR.pointer.active = true;
    const hot = e.target.closest('button, a, .claim, .gnode, textarea');
    el.classList.toggle('hot', !!hot);
  }, { passive: true });

  addEventListener('pointerleave', () => { CR.pointer.active = false; });

  (function tick(){
    // slight lag so the crosshair drags behind the hand, like a plotter
    x += (tx - x) * 0.32;
    y += (ty - y) * 0.32;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    requestAnimationFrame(tick);
  })();
})();

/* ── ambient cognition lattice (background canvas) ───────────── */
(function lattice(){
  const cv = document.getElementById('lattice');
  if (!cv) return;
  const ctx = cv.getContext('2d');

  let w = 0, h = 0, dpr = 1, pts = [];

  const INKS = [
    'rgba(15,91,217,',   // blue
    'rgba(255,72,176,',  // pink
    'rgba(20,17,14,'     // key
  ];

  function build(){
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(120, Math.round((w * h) / 15000));
    pts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 1 + Math.random() * 1.9,
      ink: INKS[(Math.random() * INKS.length) | 0],
      ph: Math.random() * Math.PI * 2
    }));
  }

  const LINK = 132;

  function frame(t){
    ctx.clearRect(0, 0, w, h);

    const px = CR.pointer.x, py = CR.pointer.y, live = CR.pointer.active;

    for (const p of pts){
      p.x += p.vx; p.y += p.vy;

      // cursor pushes the field around like a magnet under iron filings
      if (live){
        const dx = p.x - px, dy = p.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 26000 && d2 > 1){
          const f = (26000 - d2) / 26000 * 0.55;
          const d = Math.sqrt(d2);
          p.vx += (dx / d) * f * 0.06;
          p.vy += (dy / d) * f * 0.06;
        }
      }

      p.vx *= 0.994; p.vy *= 0.994;
      if (Math.abs(p.vx) < 0.04) p.vx += (Math.random() - 0.5) * 0.02;
      if (Math.abs(p.vy) < 0.04) p.vy += (Math.random() - 0.5) * 0.02;

      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
    }

    // edges first, underneath
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++){
      for (let j = i + 1; j < pts.length; j++){
        const a = pts[i], b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > LINK) continue;
        const alpha = (1 - d / LINK) * 0.24;
        ctx.strokeStyle = a.ink + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // nodes on top, breathing
    for (const p of pts){
      const pulse = 1 + Math.sin(t / 900 + p.ph) * 0.28;
      ctx.fillStyle = p.ink + '0.30)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  build();
  addEventListener('resize', build);

  if (CR.reduced){
    // one static plate, no loop
    requestAnimationFrame((t) => { frame(t); });
    return;
  }
  requestAnimationFrame(frame);
})();

/* ── text scramble : letters resolve out of noise ────────────── */
const GLYPHS = '█▓▒░#%@&$?/\\<>*+=-_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

CR.scramble = function scramble(el, next, opts){
  if (!el) return Promise.resolve();
  const o = Object.assign({ frames: 26 }, opts);
  next = String(next);

  if (CR.reduced){ el.textContent = next; return Promise.resolve(); }

  const prev = el.textContent;
  const len = Math.max(prev.length, next.length);
  const queue = [];

  for (let i = 0; i < len; i++){
    const from = prev[i] || '';
    const to   = next[i] || '';
    const start = (Math.random() * o.frames * 0.45) | 0;
    const end   = start + ((Math.random() * o.frames * 0.55) | 0) + 4;
    queue.push({ from, to, start, end, ch: '' });
  }

  if (el._scrambleRAF) cancelAnimationFrame(el._scrambleRAF);

  return new Promise((resolve) => {
    let f = 0;
    (function run(){
      let out = '', done = 0;
      for (const q of queue){
        if (f >= q.end){ done++; out += q.to; }
        else if (f >= q.start){
          if (!q.ch || Math.random() < 0.3) q.ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          out += q.ch;
        } else out += q.from;
      }
      el.textContent = out;
      if (done === queue.length){ el._scrambleRAF = null; resolve(); return; }
      f++;
      el._scrambleRAF = requestAnimationFrame(run);
    })();
  });
};

/* ── scroll reveals ──────────────────────────────────────────── */
(function reveals(){
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (CR.reduced || !('IntersectionObserver' in window)){
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  items.forEach((el, i) => {
    el.style.setProperty('--d', (i % 6) * 90 + 'ms');
    io.observe(el);
  });
})();

/* ── ticker ──────────────────────────────────────────────────── */
(function ticker(){
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const msgs = [
    'CLAUDE AUDITS CLAUDE',
    'NOTHING TRUSTED BY DEFAULT',
    'TWO PASSES / ONE MIND',
    'A CONFIDENT SENTENCE IS NOT A SOURCE',
    'GRADE THE CLAIM, NOT THE TONE',
    'THE AUDITOR CAN ALSO BE WRONG',
    'GO CHECK IT YOURSELF'
  ];
  // printed twice so the -50% translate loops seamlessly
  const run = msgs.map((m) => `<span>${m}</span>`).join('');
  track.innerHTML = run + run;
})();

/* ── hero plate : a head drawn as a cognition network ────────── */
(function heroPlate(){
  const edges = document.querySelector('.plate-edges');
  const nodes = document.querySelector('.plate-nodes');
  if (!edges || !nodes) return;

  const NS = 'http://www.w3.org/2000/svg';

  // hand-placed so the constellation reads as a skull in profile
  const P = [
    [210, 82], [268, 108], [312, 158], [322, 214], [300, 262],
    [252, 244], [206, 210], [162, 176], [150, 128], [178, 118],
    [214, 148], [258, 178], [196, 288], [246, 306], [292, 322],
    [166, 246], [128, 200], [140, 292]
  ];
  const L = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,0],
    [9,10],[10,11],[11,5],[10,6],[6,12],[12,13],[13,14],[14,4],
    [12,15],[15,16],[16,7],[15,6],[12,17],[17,15],[13,5],[11,2]
  ];

  L.forEach(([a, b], i) => {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', P[a][0]); ln.setAttribute('y1', P[a][1]);
    ln.setAttribute('x2', P[b][0]); ln.setAttribute('y2', P[b][1]);
    const len = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    ln.setAttribute('stroke-dasharray', len);
    ln.setAttribute('stroke-dashoffset', CR.reduced ? 0 : len);
    ln.setAttribute('opacity', '.7');
    if (!CR.reduced){
      ln.style.animation = `draw .8s var(--ease-out) ${300 + i * 55}ms forwards`;
    }
    edges.appendChild(ln);
  });

  P.forEach((p, i) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
    c.setAttribute('r', i % 5 === 0 ? 5.5 : 3.2);
    c.setAttribute('fill', i % 5 === 0 ? '#FF48B0' : '#14110E');
    c.setAttribute('stroke', '#14110E');
    c.setAttribute('stroke-width', '1.6');
    if (!CR.reduced){
      c.style.animation = `node-twinkle 3.4s ease-in-out ${i * 140}ms infinite,
                           node-pop .5s var(--ease-out) ${300 + i * 45}ms backwards`;
    }
    nodes.appendChild(c);
  });
})();

/* ── console character meter ─────────────────────────────────── */
(function meter(){
  const ta = document.getElementById('promptInput');
  const out = document.getElementById('charMeter');
  if (!ta || !out) return;
  const sync = () => {
    out.textContent = String(ta.value.length).padStart(3, '0');
    ta.style.setProperty('--fill', Math.min(1, ta.value.length / 240));
  };
  ta.addEventListener('input', sync);
  sync();
})();
