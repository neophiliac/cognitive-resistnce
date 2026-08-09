/* ═══════════════════════════════════════════════════════════════
   graph.js — the cognition graph
   A dependency-free force simulation rendered as risograph SVG.
   Nodes are printed cells; edges are inked links; pulses are the
   audit signal travelling out from the hub to each claim.
   ═══════════════════════════════════════════════════════════════ */

window.CR = window.CR || {};

CR.graph = (function(){
  const NS = 'http://www.w3.org/2000/svg';

  const SCREEN = {
    verified:     'url(#ht-green)',
    contestable:  'url(#ht-yellow)',
    unverifiable: 'url(#ht-pink)',
    opinion:      'url(#ht-blue)',
    ink:          'url(#ht-ink)',
    sparse:       'url(#ht-sparse)'
  };
  const TIER_FILL = {
    verified:     '#00A95C',
    contestable:  '#FFD400',
    unverifiable: '#FF48B0',
    opinion:      '#0F5BD9'
  };

  /* physics constants, tuned for 3–20 nodes in a ~600×460 plate */
  const REPULSION = 3400;
  const SPRING    = 0.05;
  const GRAVITY   = 0.0026;
  const DAMPING   = 0.86;
  const MAX_V     = 9;

  /* a settled graph keeps this much energy so it still drifts; the loop
     is parked entirely whenever the plate is off screen */
  const IDLE = 0.05;

  let svg, gEdges, gPulses, gNodes;
  let W = 600, H = 460;
  let nodes = [], edges = [], pulses = [];
  let alpha = 0, running = false, raf = null, onScreen = true;
  let dragging = null, dragDX = 0, dragDY = 0;
  let hoverCB = null, clickCB = null;
  let metaEl = null;

  /* ── setup ─────────────────────────────────────────────────── */
  function mount(el, opts){
    svg = el;
    opts = opts || {};
    metaEl = opts.meta || null;

    gEdges  = svg.querySelector('.g-edges');
    gPulses = svg.querySelector('.g-pulses');
    gNodes  = svg.querySelector('.g-nodes');

    resize();
    addEventListener('resize', resize);

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('pointerleave', () => { if (!dragging) setHover(null); });

    if ('IntersectionObserver' in window){
      new IntersectionObserver((es) => {
        onScreen = es[0].isIntersecting;
        if (onScreen) heat(0.3);
      }, { threshold: 0 }).observe(svg);
    }

    return api;
  }

  function resize(){
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pw = W, ph = H;
    W = r.width; H = r.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // keep the constellation proportionally where it was
    if (pw && ph){
      const sx = W / pw, sy = H / ph;
      nodes.forEach((n) => { n.x *= sx; n.y *= sy; });
    }
    heat(0.7);
  }

  function toLocal(e){
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ── graph mutation ────────────────────────────────────────── */
  function reset(){
    nodes = []; edges = []; pulses = [];
    if (gEdges)  gEdges.textContent = '';
    if (gPulses) gPulses.textContent = '';
    if (gNodes)  gNodes.textContent = '';
    alpha = 0;
    updateMeta();
  }

  function addNode(spec){
    const n = Object.assign({
      id: 'n' + nodes.length,
      kind: 'claim',        // query | answer | hub | claim
      tier: null,
      label: '',
      cap: '',
      r: 18,
      fixed: false,
      vx: 0, vy: 0
    }, spec);

    // seed near its origin so it appears to be thrown out of the parent
    const from = spec.from ? byId(spec.from) : null;
    const a = spec.angle != null ? spec.angle : Math.random() * Math.PI * 2;
    if (from){
      n.x = from.x + Math.cos(a) * 26;
      n.y = from.y + Math.sin(a) * 26;
    } else {
      n.x = n.x != null ? n.x : W / 2 + (Math.random() - .5) * 40;
      n.y = n.y != null ? n.y : H / 2 + (Math.random() - .5) * 40;
    }

    n.el = renderNode(n);
    nodes.push(n);
    if (spec.from) addEdge(spec.from, n.id, spec.rest);
    heat(1);
    updateMeta();
    return n;
  }

  function addEdge(a, b, rest){
    const na = byId(a), nb = byId(b);
    if (!na || !nb) return null;
    const ln = document.createElementNS(NS, 'line');
    const restLen = rest || 128;
    // draw-on uses the *expected* settled length; once drawn we drop the
    // dash entirely so a stretching link never turns dotted
    ln.style.setProperty('--len', restLen.toFixed(1));
    ln.addEventListener('animationend', () => {
      ln.style.strokeDasharray = 'none';
      ln.style.strokeDashoffset = '0';
    }, { once: true });
    ln.setAttribute('x1', na.x); ln.setAttribute('y1', na.y);
    ln.setAttribute('x2', nb.x); ln.setAttribute('y2', nb.y);
    gEdges.appendChild(ln);
    const e = { a: na, b: nb, rest: restLen, el: ln };
    edges.push(e);
    updateMeta();
    return e;
  }

  function byId(id){ return nodes.find((n) => n.id === id) || null; }

  function setTier(id, tier){
    const n = byId(id);
    if (!n) return;
    n.tier = tier;
    const disc = n.el.querySelector('.disc');
    const screen = n.el.querySelector('.screen');
    disc.setAttribute('fill', TIER_FILL[tier] || '#EDE6D6');
    if (screen) screen.setAttribute('fill', SCREEN[tier] || SCREEN.sparse);
    n.el.dataset.tier = tier;
  }

  /* ── rendering ─────────────────────────────────────────────── */
  function renderNode(n){
    const pos = document.createElementNS(NS, 'g');
    pos.setAttribute('class', 'gnode-pos');
    pos.setAttribute('transform', `translate(${n.x},${n.y})`);

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'gnode' + (n.kind !== 'claim' ? ' hub' : ''));
    g.dataset.id = n.id;
    if (n.tier) g.dataset.tier = n.tier;
    g.style.animationDelay = (n.delay || 0) + 'ms';

    // ping ring (only visible when lit)
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('r', n.r + 6);
    g.appendChild(ring);

    // hard outer halo — the brutalist keyline
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('class', 'halo');
    halo.setAttribute('r', n.r + 5);
    halo.setAttribute('stroke-dasharray', n.kind === 'claim' ? '4 4' : '0');
    g.appendChild(halo);

    // the ink disc
    const disc = document.createElementNS(NS, 'circle');
    disc.setAttribute('class', 'disc');
    disc.setAttribute('r', n.r);
    disc.setAttribute('fill',
      n.kind === 'query' ? '#14110E' :
      n.kind === 'answer' ? '#EDE6D6' :
      n.kind === 'hub' ? '#14110E' :
      (TIER_FILL[n.tier] || '#EDE6D6'));
    g.appendChild(disc);

    // halftone screen printed over the disc
    const screen = document.createElementNS(NS, 'circle');
    screen.setAttribute('class', 'screen');
    screen.setAttribute('r', n.r - 1);
    screen.setAttribute('fill',
      n.kind === 'answer' ? SCREEN.ink :
      n.kind === 'claim' ? (SCREEN[n.tier] || SCREEN.sparse) : 'none');
    if (n.kind === 'answer' || n.kind === 'claim') g.appendChild(screen);

    // label inside
    if (n.label){
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'idx');
      t.textContent = n.label;
      g.appendChild(t);
    }
    // caption below
    if (n.cap){
      const c = document.createElementNS(NS, 'text');
      c.setAttribute('class', 'cap');
      c.setAttribute('y', n.r + 19);
      c.textContent = n.cap;
      g.appendChild(c);
    }

    g.addEventListener('pointerenter', () => { if (!dragging) setHover(n.id); });
    g.addEventListener('click', () => { if (clickCB) clickCB(n.id, n); });

    pos.appendChild(g);
    gNodes.appendChild(pos);
    n.pos = pos;
    return g;
  }

  /* ── audit signal pulses ───────────────────────────────────── */
  function pulse(fromId, toId, opts){
    if (CR.reduced) return;
    const a = byId(fromId), b = byId(toId);
    if (!a || !b) return;
    opts = opts || {};
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', opts.r || 4.5);
    if (opts.color) c.setAttribute('fill', opts.color);
    gPulses.appendChild(c);
    pulses.push({ a, b, t: 0, dur: opts.dur || 620, el: c, loop: !!opts.loop });
    heat(0.4);
  }

  function clearPulses(){
    pulses.forEach((p) => p.el.remove());
    pulses = [];
  }

  /* ── highlight / cross-linking ─────────────────────────────── */
  function setHover(id){
    nodes.forEach((n) => n.el.classList.toggle('lit', n.id === id));
    edges.forEach((e) => {
      e.el.classList.toggle('lit', !!id && (e.a.id === id || e.b.id === id));
    });
    if (hoverCB) hoverCB(id);
  }

  function highlight(id, on){
    const n = byId(id);
    if (!n) return;
    n.el.classList.toggle('lit', !!on);
    edges.forEach((e) => {
      if (e.a.id === id || e.b.id === id) e.el.classList.toggle('lit', !!on);
    });
  }

  /* ── pointer / drag ────────────────────────────────────────── */
  function onDown(e){
    const g = e.target.closest('.gnode');
    if (!g) return;
    const n = byId(g.dataset.id);
    if (!n) return;
    const p = toLocal(e);
    dragging = n;
    n.fixed = true;
    dragDX = n.x - p.x; dragDY = n.y - p.y;
    svg.setPointerCapture(e.pointerId);
    setHover(n.id);
    e.preventDefault();
  }

  function onMove(e){
    if (!dragging) return;
    const p = toLocal(e);
    dragging.x = clamp(p.x + dragDX, dragging.r + 8, W - dragging.r - 8);
    dragging.y = clamp(p.y + dragDY, dragging.r + 8, H - dragging.r - 26);
    dragging.vx = dragging.vy = 0;
    heat(0.55);
  }

  function onUp(e){
    if (!dragging) return;
    dragging.fixed = false;
    dragging = null;
    try { svg.releasePointerCapture(e.pointerId); } catch (_){}
    heat(0.7);
  }

  /* ── simulation ────────────────────────────────────────────── */
  function heat(a){
    if (CR.reduced){
      // no animation loop: solve the layout in one go and paint the result,
      // so reduced-motion users get the finished constellation, not a pile
      alpha = 1;
      for (let i = 0; i < 260; i++) step(1);
      paint(0);
      return;
    }
    alpha = Math.max(alpha, a);
    if (!running) start();
  }

  function start(){
    if (running) return;
    running = true;
    let last = performance.now();
    (function loop(now){
      const dt = Math.min(48, now - last); last = now;
      step(dt / 16.67);
      paint(dt);
      // park the loop the moment the plate scrolls away — no point
      // burning frames on a graph nobody is looking at
      if ((!onScreen || !nodes.length) && !dragging && !pulses.length){
        running = false; raf = null;
        return;
      }
      raf = requestAnimationFrame(loop);
    })(last);
  }

  function step(k){
    if (!nodes.length) return;
    const cx = W / 2, cy = H / 2;
    const damp = Math.pow(DAMPING, k);

    // pairwise repulsion + collision
    for (let i = 0; i < nodes.length; i++){
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++){
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01){ dx = (Math.random() - .5); dy = (Math.random() - .5); d2 = 0.01; }
        const d = Math.sqrt(d2);
        const f = Math.min(REPULSION / d2, 3.2) * k;
        const ux = dx / d, uy = dy / d;
        a.vx += ux * f; a.vy += uy * f;
        b.vx -= ux * f; b.vy -= uy * f;

        // hard collision: printed cells must not overlap
        const min = a.r + b.r + 14;
        if (d < min){
          const push = (min - d) * 0.5;
          if (!a.fixed){ a.x += ux * push; a.y += uy * push; }
          if (!b.fixed){ b.x -= ux * push; b.y -= uy * push; }
        }
      }
    }

    // link springs
    for (const e of edges){
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - e.rest) * SPRING * k;
      const ux = dx / d, uy = dy / d;
      e.a.vx += ux * f; e.a.vy += uy * f;
      e.b.vx -= ux * f; e.b.vy -= uy * f;
    }

    // gravity toward the plate centre + integrate
    for (const n of nodes){
      if (n.fixed){ n.vx = n.vy = 0; continue; }
      n.vx += (cx - n.x) * GRAVITY * k * (n.kind === 'claim' ? 1 : 2.1);
      n.vy += (cy - n.y) * GRAVITY * k * (n.kind === 'claim' ? 1 : 2.1);

      // a hair of brownian drift so a settled graph still looks alive
      n.vx += (Math.random() - .5) * 0.09;
      n.vy += (Math.random() - .5) * 0.09;

      n.vx *= damp; n.vy *= damp;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > MAX_V){ n.vx = n.vx / sp * MAX_V; n.vy = n.vy / sp * MAX_V; }

      n.x += n.vx * alpha * k;
      n.y += n.vy * alpha * k;

      n.x = clamp(n.x, n.r + 10, W - n.r - 10);
      n.y = clamp(n.y, n.r + 12, H - n.r - 24);
    }

    alpha = Math.max(alpha * 0.988, nodes.length ? IDLE : 0);
  }

  function paint(dt){
    for (const n of nodes){
      n.pos.setAttribute('transform', `translate(${n.x.toFixed(2)},${n.y.toFixed(2)})`);
    }
    for (const e of edges){
      e.el.setAttribute('x1', e.a.x.toFixed(2));
      e.el.setAttribute('y1', e.a.y.toFixed(2));
      e.el.setAttribute('x2', e.b.x.toFixed(2));
      e.el.setAttribute('y2', e.b.y.toFixed(2));
    }
    for (let i = pulses.length - 1; i >= 0; i--){
      const p = pulses[i];
      p.t += dt;
      let u = p.t / p.dur;
      if (u >= 1){
        if (p.loop){ p.t = 0; u = 0; }
        else { p.el.remove(); pulses.splice(i, 1); continue; }
      }
      // ease-out so the signal arrives with a slight thud
      const s = 1 - Math.pow(1 - u, 2.2);
      p.el.setAttribute('cx', (p.a.x + (p.b.x - p.a.x) * s).toFixed(2));
      p.el.setAttribute('cy', (p.a.y + (p.b.y - p.a.y) * s).toFixed(2));
      p.el.setAttribute('opacity', (1 - Math.pow(u, 3)).toFixed(3));
    }
  }

  function updateMeta(){
    if (metaEl) metaEl.textContent = `${nodes.length} NODES / ${edges.length} EDGES`;
  }

  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }

  const api = {
    mount, reset, addNode, addEdge, setTier, pulse, clearPulses,
    highlight, setHover,
    onHover(cb){ hoverCB = cb; return api; },
    onClick(cb){ clickCB = cb; return api; },
    heat,
    get size(){ return { w: W, h: H }; },
    get count(){ return nodes.length; }
  };

  return api;
})();
