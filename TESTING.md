# Test Plan — Cognitive Resistance

Manual test plan. No test framework in this repo (static HTML/CSS/JS, no backend) — all checks below are done by hand in a browser with devtools open.

Setup: serve the folder (`python3 -m http.server`) and open `cognitive-resistance.html` (or `index.html`, which redirects to it), or open the file directly. Keep the browser console visible throughout — any uncaught JS error is a fail even if the UI looks fine.

**The app boots in DEMO mode by default** — `script.js` calls `CR.demo` (scripted output from `demo-data.js`) instead of the real API, so the full two-pass pipeline runs end to end with no key and no network dependency. This is the primary path to test. Add `?live=1` to the URL to force a real call to `CONFIG.endpoint`, which now defaults to the relative `/api/claude` — served by `proxy.js`. Under `python3 -m http.server` that path 404s (expected); to exercise live mode properly, serve with `ANTHROPIC_API_KEY=... node proxy.js` instead.

## Smoke test (~2 min)

Run this before anything else. If any step fails, stop and file it — don't bother with the full suite yet.

1. Load the page. It renders with no console errors: masthead (`[CR]`, spec strip showing `MODE: DEMO`, `STATUS: IDLE`), hero, the "INPUT / 01" console section with textarea, seed buttons, and "INTERROGATE" button.
2. Type a factual question (e.g. "Should a startup pick Rust over Go?") and click **INTERROGATE** (or press Cmd/Ctrl+Enter).
3. The stage section (hidden by default) opens: cognition graph panel (FIG.02) on the left, process log below it, results feed on the right.
4. Process log shows `QUERY ACCEPTED`, then `PASS 01 — SCRIPTED DEMO RESPONSE` with a spinner status line.
5. A yellow "DEMO MODE — NO MODEL WAS CALLED" notice renders, followed by Panel 1 ("WHAT CLAUDE SAID") with an answer. A query node and answer node appear in the graph, connected by an edge.
6. Process log shows `PASS 02 — SCRIPTED AUDIT`; an auditor hub node appears with a pulsing edge from the answer node.
7. Gauge card renders (`N/M CLAIMS NEED A SECOND LOOK`, verdict word, segmented bar), followed by claim cards staggering in one at a time. Each claim also spawns a node in the graph radiating from the hub, colored by tier.
8. Hovering a claim card lights up its matching graph node (and vice versa); process log ends with `AUDIT COMPLETE — VERDICT: ...`.
9. **INTERROGATE** button re-enables, hint text resets to "NOTHING HERE IS TRUSTED BY DEFAULT", spec strip STATUS reads `AUDITED`.
10. Click "ASK SOMETHING ELSE ↻" — results, log, and graph all clear; stage hides; textarea is empty and focused.

## Full test suite (outline)

### 1. Input handling
- Empty submit (blank/whitespace-only textarea) — form does not submit; hint scrambles to "TYPE SOMETHING FIRST" and focus returns to the textarea.
- Char meter (`#charMeter`) updates live as you type.
- Very long input (multi-paragraph) — layout doesn't break, textarea scrolls/resizes.
- Input containing HTML/script-like text (`<img src=x onerror=alert(1)>`) — rendered as literal text, not executed. Confirms `esc()` is applied (still used everywhere model/user text hits `innerHTML`).
- Input containing markdown-ish characters, emoji, non-Latin scripts — renders without mangling.
- Seed buttons (`#seeds button[data-seed]`) — clicking one fills the textarea with its question and focuses it; does not auto-submit.
- Cmd/Ctrl+Enter in the textarea submits the form same as clicking the button.
- Rapid double-click/double-submit — `busy` flag + disabled button prevents a second concurrent run.

### 2. Demo mode — pass 1 (answer)
- The three seeded topics (fasting/calorie, Great Wall, Rust vs Go) each return their matching scripted answer from `demo-data.js`; any other question falls back to the generic `[DEMO MODE]` answer.
- Demo notice banner (`.error-box` styled yellow) always appears above the answer panel in demo mode.
- Process log line reads `PASS 01 — SCRIPTED DEMO RESPONSE` (not the live wording) when `IS_LIVE` is false.

### 3. Demo mode — pass 2 (audit)
- Gauge's `N/M` and the verdict word (`HOLDS UP` / `MIXED` / `MOSTLY UNCONFIRMED` / `NO CLAIMS`) match the actual tier breakdown of the rendered claim cards.
- Each claim card's border/tag color matches its tier — cross-check against the CSS tier colors and the legend in both the hero (`.tier-key`) and graph frame (`.glegend`).
- Claims with `check: null` render without a verification-hint line; claims with a check string do.
- Claim cards and graph nodes stagger in together (~170ms apart per claim when motion isn't reduced).

### 4. Cognition graph
- Graph mounts on first run (`CR.graph.mount`) and resets between runs (`CR.graph.reset` clears nodes/edges).
- `#graphMeta` node/edge counts update as nodes are added (query → answer → auditor hub → one node per claim).
- Hovering a claim card toggles `.lit` on its graph node and vice versa (`CR.graph.onHover`); clicking a graph node scrolls its card into view (`CR.graph.onClick`).
- Dragging a node repositions it and the simulation responds (springs/repulsion/collision) without throwing.
- Pulses animate from answer→hub and hub→each claim node during the run, then clear via `CR.graph.clearPulses()` (no stray pulses left after the run finishes or errors).
- With `prefers-reduced-motion: enabled` (devtools → Rendering → emulate CSS media), the graph solves layout in one synchronous pass instead of animating, and claim cards appear without the staggered delay.

### 5. Live mode (`?live=1`)
- Load `cognitive-resistance.html?live=1`. Spec strip MODE reads `LIVE` instead of `DEMO`.
- **Served by `proxy.js` with a valid key:** submitting a question calls `POST /api/claude`; the proxy attaches `x-api-key` + `anthropic-version` upstream. Expect a real answer and a real audit. Run the full smoke test in this mode: confirm real content renders, the web-search-backed tiers look plausible, and a malformed-JSON audit falls back to the raw-text panel (`UNDER ITS OWN SCRUTINY` / `RAW`) without hanging — hint/button must still reset.
- **Served by any plain static server (no proxy):** `/api/claude` 404s. Confirm the failure surfaces via `renderError()`: `.error-box` titled "TRANSMISSION FAILED" with a tailored hint line — mentions `x-api-key`/proxy for 401/403, CORS for `Failed to fetch`/`NetworkError`.
- **Key missing from the proxy env:** `proxy.js` exits at startup rather than serving keyless — confirm it does not boot into a half-working state.
- Process log's last line reads `FAILED — ...` in the `bad` style; spec strip STATUS reads `ERROR`.
- No orphaned spinner or stuck pulses after the failure; **INTERROGATE** re-enables.
- Overriding `window.CR_CONFIG` (endpoint/model/live) before `script.js` loads takes effect — useful for pointing at a deployed proxy rather than localhost.

### 6. Error handling detail
- Simulate network failure for pass 1 only (devtools → offline, or block the request) in live mode → error box shows, spinner removed, button re-enabled, no partial graph nodes left dangling mid-animation.
- Simulate failure on pass 2 only (answer succeeds, audit fails) → Panel 1 stays visible, error box appears below it, no orphaned spinner or pulse.
- Simulate a non-200 API response → error message includes the status code and the 401/403-specific hint line where applicable.

### 7. Repeated use / state reset
- Submit a question, get results, submit a second question without clicking reset — log, results, and graph are all cleared before the new run starts (`results.innerHTML = ''`, `roLines.innerHTML = ''`, `CR.graph.reset()`).
- Use "ASK SOMETHING ELSE ↻" reset, then submit again — full cycle works a second time without stale nodes/edges or log lines from the first run.

### 8. Visual / responsive
- Narrow viewport (mobile width, ~375px) — hero, console, and the two-column stage (`.graph-col` / `.feed-col`) reflow (likely to a single column) without horizontal scroll or clipped text; graph SVG stays legible.
- Wide viewport — content stays capped at the layout max-width and centered; hero plate SVG and ticker render without overflow.
- Light-content readability: check tier colors (verified/contestable/unverifiable/opinion) have enough contrast in both the claim cards and the graph node fills against the paper/riso background.
- Riso print layers (`paper-grain`, `paper-halftone`, animated lattice canvas, reticle) render without obscuring text or tanking scroll performance.

### 9. Cross-browser
- Repeat the smoke test in at least one Chromium browser and one non-Chromium browser (Firefox or Safari) — flag any CSS filter/animation differences (the riso SVG filters — `feTurbulence`/`feDisplacementMap` — are the most likely to diverge), and any Canvas (`#lattice`) or SVG graph rendering differences.

### 10. Security spot-check
- Re-confirm every place model/user output reaches the DOM goes through `esc()` (answer text, claim text/note/check, gauge summary/verdict, process log lines built from user input) — grep `script.js` for `innerHTML` assignments and check each interpolated value.
- Confirm no API key or secret is present in `script.js`, `demo-data.js`, or shipped to the client. Confirm demo mode never calls `fetch()` at all (check the Network tab — zero requests to `api.anthropic.com` unless `?live=1` is set).
