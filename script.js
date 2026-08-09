const form = document.getElementById('askForm');
const input = document.getElementById('promptInput');
const btn = document.getElementById('submitBtn');
const results = document.getElementById('results');
const hint = document.getElementById('hintText');

const TIER_LABEL = {
  verified: 'Verified',
  contestable: 'Contestable',
  unverifiable: 'Unverifiable',
  opinion: 'Opinion as fact'
};

function esc(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function statusEl(text){
  const el = document.createElement('div');
  el.className = 'status';
  el.innerHTML = `<div class="spinner"></div><span>${esc(text)}</span>`;
  return el;
}

async function callClaude(messages, tools){
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages
  };
  if (tools) body.tools = tools;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("API request failed (" + res.status + ")");
  const data = await res.json();
  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
  return text;
}

function parseAudit(raw){
  let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  btn.disabled = true;
  hint.textContent = 'working…';
  results.innerHTML = '';

  const s1 = statusEl('Sending your question to Claude…');
  results.appendChild(s1);

  try {
    const answer = await callClaude([{ role: "user", content: question }]);

    s1.remove();
    const answerPanel = document.createElement('div');
    answerPanel.className = 'panel';
    answerPanel.innerHTML = `
      <div class="panel-label"><span class="n">1</span>What Claude said</div>
      <div class="answer-box">${esc(answer)}</div>
    `;
    results.appendChild(answerPanel);

    const s2 = statusEl('Auditing that answer — checking claims against the web…');
    results.appendChild(s2);

    const auditPrompt = `You are a skeptical fact-checking auditor reviewing an AI-generated answer. Be genuinely adversarial — do not rubber-stamp claims. Use web search to check specific, checkable claims.

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

    const auditRaw = await callClaude(
      [{ role: "user", content: auditPrompt }],
      [{ type: "web_search_20250305", name: "web_search" }]
    );

    s2.remove();

    let audit;
    try {
      audit = parseAudit(auditRaw);
    } catch (parseErr) {
      const fallback = document.createElement('div');
      fallback.className = 'panel';
      fallback.innerHTML = `
        <div class="panel-label"><span class="n">2</span>Under its own scrutiny</div>
        <div class="answer-box">${esc(auditRaw)}</div>
      `;
      results.appendChild(fallback);
      hint.textContent = 'nothing here is trusted by default';
      btn.disabled = false;
      return;
    }

    const claims = audit.claims || [];
    const total = claims.length;
    const shaky = claims.filter(c => c.tier !== 'verified').length;
    const verdict = total === 0 ? 'no checkable claims'
      : shaky === 0 ? 'holds up'
      : shaky === total ? 'mostly unconfirmed'
      : 'mixed';

    const auditPanel = document.createElement('div');
    auditPanel.className = 'panel';

    let gaugeHtml = '';
    if (total > 0) {
      const segs = Array.from({length: total}, (_, i) =>
        `<div class="gauge-seg ${i < shaky ? 'fill' : ''}"></div>`
      ).join('');
      gaugeHtml = `
        <div class="gauge-card">
          <div class="gauge-top">
            <div class="gauge-stat">${shaky} of ${total} claims need a second look</div>
            <div class="gauge-verdict">${esc(verdict)}</div>
          </div>
          <div class="gauge-bar">${segs}</div>
          <p class="gauge-caption">${esc(audit.summary || '')}</p>
        </div>
      `;
    } else {
      gaugeHtml = `
        <div class="gauge-card">
          <div class="gauge-top">
            <div class="gauge-stat">Nothing to check</div>
            <div class="gauge-verdict">${esc(verdict)}</div>
          </div>
          <p class="gauge-caption">${esc(audit.summary || '')}</p>
        </div>
      `;
    }

    const claimsHtml = claims.map((c, i) => {
      const tier = ['verified','contestable','unverifiable','opinion'].includes(c.tier) ? c.tier : 'contestable';
      return `
        <div class="claim ${tier}" style="animation-delay:${0.05 * i}s">
          <div class="claim-top"><span class="tag ${tier}">${TIER_LABEL[tier]}</span></div>
          <p class="claim-text">${esc(c.text)}</p>
          <p class="claim-note">${esc(c.note || '')}</p>
          ${c.check ? `<p class="claim-check">${esc(c.check)}</p>` : ''}
        </div>
      `;
    }).join('');

    auditPanel.innerHTML = `
      <div class="panel-label"><span class="n">2</span>Under its own scrutiny</div>
      ${gaugeHtml}
      ${claimsHtml}
    `;
    results.appendChild(auditPanel);

    const footer = document.createElement('div');
    footer.className = 'footer-quote';
    footer.innerHTML = `
      <div class="bar"></div>
      <p>This second pass is still Claude — it can miss things or be wrong too. Treat it as a prompt to go check, not a verdict.</p>
    `;
    results.appendChild(footer);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-link';
    resetBtn.textContent = 'Ask something else';
    resetBtn.onclick = () => { results.innerHTML = ''; input.value=''; input.focus(); };
    results.appendChild(resetBtn);

    hint.textContent = 'nothing here is trusted by default';
    btn.disabled = false;

  } catch (err) {
    s1.remove();
    const errEl = document.createElement('div');
    errEl.className = 'error-box';
    errEl.textContent = 'Something went wrong: ' + err.message;
    results.appendChild(errEl);
    hint.textContent = 'nothing here is trusted by default';
    btn.disabled = false;
  }
});
