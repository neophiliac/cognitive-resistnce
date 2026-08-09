/* ═══════════════════════════════════════════════════════════════
   script.js — pipeline + choreography
   Pass 1: ask Claude.  Pass 2: make Claude audit itself with a
   web search.  Everything the audit finds is staged as a node in
   the cognition graph and as a card in the feed, cross-linked.
   ═══════════════════════════════════════════════════════════════ */

window.CR = window.CR || {};

/* ── configuration ───────────────────────────────────────────── */
const CONFIG = Object.assign({
  // proxy.js serves this page and attaches the key upstream. A browser can
  // never call api.anthropic.com directly — no safe place for the key, and
  // CORS blocks it regardless — so the relative proxy path is the default.
  endpoint: '/api/claude',
  model: 'claude-sonnet-4-6',
  maxTokens: 1200,
  // demo by default so the interface runs with no key;
  // set CR_CONFIG.live = true, or add ?live=1, to hit the endpoint
  live: new URLSearchParams(location.search).has('live')
}, window.CR_CONFIG || {});

const IS_LIVE = !!CONFIG.live;

/* ── dom ─────────────────────────────────────────────────────── */
const form     = document.getElementById('askForm');
const input    = document.getElementById('promptInput');
const btn      = document.getElementById('submitBtn');
const results  = document.getElementById('results');
const hint     = document.getElementById('hintText');
const stage    = document.getElementById('stage');
const roLines  = document.getElementById('roLines');
const graphSvg = document.getElementById('graph');
const graphMeta= document.getElementById('graphMeta');
const specMode = document.querySelector('#specMode i');
const specStat = document.querySelector('#specStatus i');
const root     = document.documentElement;

const TIER_LABEL = {
  verified: 'VERIFIED',
  contestable: 'CONTESTABLE',
  unverifiable: 'UNVERIFIABLE',
  opinion: 'OPINION AS FACT'
};
const TIERS = ['verified', 'contestable', 'unverifiable', 'opinion'];

let graphReady = false;
let busy = false;

/* ── helpers ─────────────────────────────────────────────────── */
function esc(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function setPhase(p){ root.dataset.phase = p; }

function setStatus(text){
  if (specStat) CR.scramble(specStat, text);
}

/* process log — one line per beat, last line is "live" */
function log(text, cls){
  if (!roLines) return null;
  roLines.querySelectorAll('.live').forEach((el) => el.classList.remove('live'));
  const li = document.createElement('li');
  li.className = 'live' + (cls ? ' ' + cls : '');
  li.textContent = text;
  roLines.appendChild(li);
  roLines.scrollTop = roLines.scrollHeight;
  return li;
}
function logDone(li, cls){
  if (!li) return;
  li.classList.remove('live');
  if (cls) li.classList.add(cls);
}

function statusStrip(text){
  const el = document.createElement('div');
  el.className = 'status-strip';
  el.innerHTML = `<div class="spinner"></div><span>${esc(text)}</span>`;
  return el;
}

function openStage(){
  if (!stage.hidden) return Promise.resolve();
  stage.hidden = false;
  // let layout settle before the graph measures itself
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/* ── model calls (same two-pass contract as the original) ────── */
async function callClaude(messages, tools){
  const body = {
    model: CONFIG.model,
    max_tokens: CONFIG.maxTokens,
    messages
  };
  if (tools) body.tools = tools;

  const res = await fetch(CONFIG.endpoint, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, CONFIG.headers || {}),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('API request failed (' + res.status + ')');

  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function auditPromptFor(question, answer){
  return `You are a skeptical fact-checking auditor reviewing an AI-generated answer. Be genuinely adversarial — do not rubber-stamp claims. Use web search to check specific, checkable claims.

ORIGINAL QUESTION:
${question}

ANSWER TO AUDIT:
${answer}

Break the answer into its distinct factual or evaluative claims (skip pure filler/pleasantries). For each claim, assign exactly one tier:
- "verified": checked against a real source and confirmed
- "contestable": reasonable people or sources disagree, or it depends on unstated context
- "unverifiable": no way to confirm this from available sources, too vague, or a future prediction
- "opinion": stated as fact but is actually a judgment call or value claim

Respond with ONLY raw JSON, no markdown fences, no preamble, in exactly this shape:
{
  "summary": "one blunt sentence on how much of this answer should be trusted as-is",
  "claims": [
    {"text": "short paraphrase of the claim, under 20 words", "tier": "verified|contestable|unverifiable|opinion", "note": "one sentence on why", "check": "a concrete way to verify it yourself, or null if tier is verified"}
  ]
}

If the answer has no meaningful factual claims (e.g. it's creative writing or a simple greeting), return an empty claims array and say so in the summary.`;
}

function parseAudit(raw){
  let cleaned = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a !== -1 && b !== -1) cleaned = cleaned.slice(a, b + 1);
  return JSON.parse(cleaned);
}

/* pass 1 */
async function getAnswer(question){
  if (!IS_LIVE) return CR.demo.answer(question);
  return callClaude([{ role: 'user', content: question }]);
}

/* pass 2 — network failures propagate; malformed JSON comes back as raw
   text so the auditor's words are shown rather than swallowed */
async function getAudit(question, answer){
  if (!IS_LIVE) return { ok: true, audit: await CR.demo.audit(question) };
  const raw = await callClaude(
    [{ role: 'user', content: auditPromptFor(question, answer) }],
    [{ type: 'web_search_20250305', name: 'web_search' }]
  );
  try { return { ok: true, audit: parseAudit(raw) }; }
  catch (_){ return { ok: false, raw }; }
}

/* ── graph wiring ────────────────────────────────────────────── */
function ensureGraph(){
  if (graphReady) return;
  CR.graph.mount(graphSvg, { meta: graphMeta });
  CR.graph.onHover((id) => {
    results.querySelectorAll('.claim').forEach((c) => {
      c.classList.toggle('lit', !!id && c.dataset.node === id);
    });
  });
  CR.graph.onClick((id) => {
    const card = results.querySelector(`.claim[data-node="${id}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  graphReady = true;
}

/* ── renderers ───────────────────────────────────────────────── */
function renderDemoNotice(){
  const el = document.createElement('div');
  el.className = 'error-box';
  el.style.borderLeftColor = 'var(--yellow)';
  el.innerHTML = `<b style="color:var(--ink)">DEMO MODE — NO MODEL WAS CALLED</b>
    <p>Every grade below is scripted so the interface can be driven end to end without an API key.
    Serve with <code>node proxy.js</code> and add <code>?live=1</code> for a real two-pass audit.</p>`;
  return el;
}

function renderAnswer(answer){
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-label"><span>WHAT CLAUDE SAID</span><span class="n">PASS 01</span></div>
    <div class="answer-box">${esc(answer)}</div>`;
  return panel;
}

function verdictFor(claims){
  const total = claims.length;
  if (!total) return { word: 'NO CLAIMS', cls: 'v-none' };
  const shaky = claims.filter((c) => c.tier !== 'verified').length;
  if (shaky === 0)     return { word: 'HOLDS UP',           cls: 'v-holds' };
  if (shaky === total) return { word: 'MOSTLY UNCONFIRMED', cls: 'v-weak'  };
  return { word: 'MIXED', cls: 'v-mixed' };
}

function renderGauge(audit, claims){
  const total = claims.length;
  const shaky = claims.filter((c) => c.tier !== 'verified').length;
  const v = verdictFor(claims);

  const segs = claims.map((c, i) =>
    `<div class="gauge-seg t-${c.tier}" style="animation-delay:${i * 55}ms"></div>`
  ).join('') || '<div class="gauge-seg" style="animation-delay:0ms"></div>';

  const el = document.createElement('div');
  el.className = 'gauge';
  el.innerHTML = `
    <div class="gauge-top">
      <div class="gauge-stat">
        ${total ? `${shaky}<span style="opacity:.4">/${total}</span>` : '00'}
        <small>${total ? 'CLAIMS NEED A SECOND LOOK' : 'NOTHING CHECKABLE FOUND'}</small>
      </div>
      <div class="gauge-verdict ${v.cls}">${esc(v.word)}</div>
    </div>
    <div class="gauge-bar">${segs}</div>
    <p class="gauge-caption">${esc(audit.summary || '')}</p>`;
  return el;
}

function renderClaimCard(claim, i, nodeId){
  const el = document.createElement('div');
  el.className = 'claim ' + claim.tier;
  el.dataset.node = nodeId;
  el.innerHTML = `
    <div class="claim-top">
      <span class="claim-idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="tag">${TIER_LABEL[claim.tier]}</span>
    </div>
    <p class="claim-text">${esc(claim.text)}</p>
    <p class="claim-note">${esc(claim.note || '')}</p>
    ${claim.check ? `<p class="claim-check">${esc(claim.check)}</p>` : ''}`;

  el.addEventListener('pointerenter', () => CR.graph.highlight(nodeId, true));
  el.addEventListener('pointerleave', () => CR.graph.highlight(nodeId, false));
  return el;
}

function renderError(err){
  const el = document.createElement('div');
  el.className = 'error-box';
  const hintLine = /failed \((401|403)\)/.test(err.message)
    ? 'The endpoint rejected the request — it needs a server that attaches your <code>x-api-key</code>. Browsers cannot hold that key safely.'
    : /Failed to fetch|NetworkError/i.test(err.message)
      ? 'The request never landed — usually CORS, because <code>api.anthropic.com</code> cannot be called straight from a page. Proxy it through your own endpoint.'
      : 'Check the endpoint and payload, then try again.';
  el.innerHTML = `<b>TRANSMISSION FAILED</b>
    <p>${esc(err.message)}<br>${hintLine}</p>`;
  return el;
}

/* ── the run ─────────────────────────────────────────────────── */
async function run(question){
  busy = true;
  btn.disabled = true;
  setPhase('working');
  setStatus('WORKING');
  CR.scramble(hint, 'INTERROGATION IN PROGRESS');

  results.innerHTML = '';
  roLines.innerHTML = '';

  await openStage();
  ensureGraph();
  CR.graph.reset();

  const { w, h } = CR.graph.size;

  log('QUERY ACCEPTED — ' + question.slice(0, 46).toUpperCase() + (question.length > 46 ? '…' : ''));
  CR.graph.addNode({ id: 'q', kind: 'query', label: 'Q', cap: 'QUERY', r: 21, x: w * 0.24, y: h * 0.52 });

  const l1 = log(IS_LIVE ? 'PASS 01 — TRANSMITTING TO CLAUDE' : 'PASS 01 — SCRIPTED DEMO RESPONSE');
  const strip = statusStrip('Pass 01 — asking Claude…');
  results.appendChild(strip);

  try {
    /* ── PASS 1 ─────────────────────────────────────────────── */
    const answer = await getAnswer(question);
    logDone(l1, 'ok');
    strip.remove();

    CR.graph.addNode({
      id: 'a', kind: 'answer', label: 'A', cap: 'ANSWER',
      r: 29, from: 'q', rest: 132, angle: -0.2
    });
    log('ANSWER RECEIVED — ' + answer.length + ' CHARS');

    if (!IS_LIVE) results.appendChild(renderDemoNotice());
    results.appendChild(renderAnswer(answer));

    /* ── PASS 2 ─────────────────────────────────────────────── */
    const l2 = log(IS_LIVE ? 'PASS 02 — ADVERSARIAL AUDIT + WEB SEARCH' : 'PASS 02 — SCRIPTED AUDIT');
    const strip2 = statusStrip('Pass 02 — auditing that answer against the web…');
    results.appendChild(strip2);

    CR.graph.addNode({
      id: 'x', kind: 'hub', label: 'AX', cap: 'AUDITOR',
      r: 25, from: 'a', rest: 128, angle: 0.85
    });
    CR.graph.pulse('a', 'x', { dur: 760, loop: true, r: 5 });

    const res = await getAudit(question, answer);

    CR.graph.clearPulses();
    strip2.remove();

    if (!res.ok){
      // the auditor answered, but not in JSON — show its own words rather than nothing
      logDone(l2, 'bad');
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `
        <div class="panel-label"><span>UNDER ITS OWN SCRUTINY</span><span class="n">RAW</span></div>
        <div class="answer-box">${esc(res.raw)}</div>`;
      results.appendChild(panel);
      finish();
      return;
    }

    const audit = res.audit;
    logDone(l2, 'ok');

    const claims = (audit.claims || []).map((c) => ({
      text: c.text || '',
      note: c.note || '',
      check: c.check || null,
      tier: TIERS.includes(c.tier) ? c.tier : 'contestable'
    }));

    results.appendChild(renderGauge(audit, claims));

    const head = document.createElement('div');
    head.className = 'claims-head';
    head.innerHTML = `<span>CLAIMS, PULLED APART</span><span>${String(claims.length).padStart(2, '0')} TOTAL</span>`;
    results.appendChild(head);

    const list = document.createElement('div');
    list.className = 'claims';
    results.appendChild(list);

    /* stage each claim: node fires out of the hub, card lands in the feed */
    const total = claims.length;
    const nodeR = total > 10 ? 13 : total > 6 ? 15 : 18;

    for (let i = 0; i < total; i++){
      const c = claims[i];
      const id = 'c' + i;
      const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;

      CR.graph.addNode({
        id, kind: 'claim', tier: c.tier, label: String(i + 1),
        r: nodeR, from: 'x', rest: total > 8 ? 96 : 112, angle
      });
      CR.graph.pulse('x', id, { dur: 480, r: 4 });

      const card = renderClaimCard(c, i, id);
      card.style.animationDelay = '60ms';
      list.appendChild(card);

      log(`CLAIM ${String(i + 1).padStart(2, '0')} → ${TIER_LABEL[c.tier]}`,
          c.tier === 'verified' ? 'ok' : c.tier === 'unverifiable' ? 'bad' : '');

      if (!CR.reduced) await new Promise((r) => setTimeout(r, 170));
    }

    const v = verdictFor(claims);
    log('AUDIT COMPLETE — VERDICT: ' + v.word, v.cls === 'v-holds' ? 'ok' : 'bad');
    finish();

  } catch (err){
    CR.graph.clearPulses();
    results.querySelectorAll('.status-strip').forEach((s) => s.remove());
    results.appendChild(renderError(err));
    log('FAILED — ' + err.message.toUpperCase(), 'bad');
    setPhase('error');
    setStatus('ERROR');
    CR.scramble(hint, 'NOTHING HERE IS TRUSTED BY DEFAULT');
    btn.disabled = false;
    busy = false;
  }
}

function finish(){
  const reset = document.createElement('button');
  reset.className = 'reset-link';
  reset.textContent = 'ASK SOMETHING ELSE ↻';
  reset.addEventListener('click', () => {
    results.innerHTML = '';
    roLines.innerHTML = '';
    CR.graph.reset();
    stage.hidden = true;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
    setPhase('idle');
    setStatus('IDLE');
    document.getElementById('console').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  results.appendChild(reset);

  setPhase('done');
  setStatus('AUDITED');
  CR.scramble(hint, 'NOTHING HERE IS TRUSTED BY DEFAULT');
  btn.disabled = false;
  busy = false;
}

/* ── events ──────────────────────────────────────────────────── */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy) return;
  const q = input.value.trim();
  if (!q){
    input.focus();
    CR.scramble(hint, 'TYPE SOMETHING FIRST');
    return;
  }
  run(q);
});

/* cmd/ctrl + enter submits */
input.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') form.requestSubmit();
});

/* seed buttons */
document.getElementById('seeds').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-seed]');
  if (!b) return;
  input.value = b.dataset.seed;
  input.dispatchEvent(new Event('input'));
  input.focus();
});

/* boot */
if (specMode) CR.scramble(specMode, IS_LIVE ? 'LIVE' : 'DEMO');
setStatus('IDLE');
