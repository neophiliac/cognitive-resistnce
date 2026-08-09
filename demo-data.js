/* ═══════════════════════════════════════════════════════════════
   demo-data.js — scripted output for offline / no-key demos
   Nothing here is a real verification. It exists so the interface
   can be driven end to end without calling a model. DEMO mode is
   labelled in the UI on purpose.
   ═══════════════════════════════════════════════════════════════ */

window.CR = window.CR || {};

CR.demo = (function(){

  const SAMPLES = [
    {
      match: /fasting|calorie|fat loss|weight/i,
      answer:
`Intermittent fasting and straight calorie counting produce very similar fat-loss results when total calorie intake is matched. The main mechanism behind fat loss in both cases is an energy deficit — fasting is one way to create that deficit, not a separate metabolic lever.

Where fasting can win is adherence: some people find "don't eat before noon" easier to follow than tracking every meal. Where it can lose is training quality and protein intake — a compressed eating window makes it harder to hit protein targets, which matters for keeping muscle while losing fat.

If you lift regularly, prioritise total protein and total calories first. Pick whichever schedule you'll actually stick to for six months.`,
      audit: {
        summary: 'The core energy-balance claim is solid; the adherence and protein claims are reasonable but softer than the confident tone suggests.',
        claims: [
          { text: 'Fasting and calorie counting give similar fat loss when calories are matched', tier: 'verified',
            note: 'Multiple controlled trials and meta-analyses find no meaningful difference once intake is equated.', check: null },
          { text: 'Fat loss is driven by energy deficit, not fasting itself', tier: 'verified',
            note: 'This is the consensus position across the isocaloric trial literature.', check: null },
          { text: 'Some people find fasting easier to adhere to', tier: 'contestable',
            note: 'Adherence findings split by population and study length; drop-out rates are not consistently lower.', check: 'Look for adherence data in trials running 12 months or longer, not 8-week studies.' },
          { text: 'A compressed eating window makes protein targets harder to hit', tier: 'contestable',
            note: 'True on average, but very achievable with planning — it is a practical friction, not a hard ceiling.', check: 'Check protein intake data in time-restricted-eating trials with a resistance-training arm.' },
          { text: 'Prioritise total protein and calories if you lift', tier: 'opinion',
            note: 'A defensible coaching heuristic stated as if it were a finding.', check: 'Treat as advice; the underlying protein-for-muscle-retention evidence is separate and stronger.' },
          { text: 'You should pick the schedule you can hold for six months', tier: 'opinion',
            note: 'A value judgement about what matters, not an empirical result.', check: null }
        ]
      }
    },
    {
      match: /great wall|from space|visible from/i,
      answer:
`The Great Wall of China was not built to be visible from space — it was built over many centuries, largely from the 3rd century BC onward, as a defensive and border-control structure against northern incursions.

The "visible from space" idea is a modern myth that predates spaceflight entirely. In practice the Wall is extremely hard to see with the naked eye from low Earth orbit: it is long but only a few metres wide, and it is made of local materials that blend into the surrounding terrain.

Astronauts have generally reported being unable to pick it out unaided, though it can be captured from orbit with a good camera and the right lighting and snow conditions.`,
      audit: {
        summary: 'Mostly holds up — the historical and optical claims are well supported, with one detail that is looser than stated.',
        claims: [
          { text: 'The Wall was built for defence and border control, not visibility', tier: 'verified',
            note: 'Consistent with the standard historical record of its construction purpose.', check: null },
          { text: 'Construction ran from roughly the 3rd century BC over many centuries', tier: 'verified',
            note: 'Matches the accepted chronology, with the surviving Ming-era sections much later.', check: null },
          { text: 'The "visible from space" claim predates spaceflight', tier: 'verified',
            note: 'The myth is documented in print well before any crewed orbital flight.', check: null },
          { text: 'It is very hard to see unaided from low Earth orbit', tier: 'verified',
            note: 'Width and material contrast make unaided naked-eye detection impractical.', check: null },
          { text: 'Astronauts have generally reported being unable to see it unaided', tier: 'contestable',
            note: 'Reports conflict — a few astronauts have claimed sightings under ideal conditions.', check: 'Compare first-hand astronaut accounts directly rather than secondary summaries.' },
          { text: 'It can be photographed from orbit with the right conditions', tier: 'verified',
            note: 'Orbital imagery of Wall sections exists, notably with snow contrast.', check: null }
        ]
      }
    },
    {
      match: /\brust\b|\bgo\b|golang|backend|throughput/i,
      answer:
`For a high-throughput API backend, Go is usually the faster choice to get to production and Rust is usually the faster choice at runtime under sustained load.

Go's scheduler and garbage collector are tuned for exactly this workload, and its compile times and standard library make iteration quick. Rust removes garbage-collection pauses entirely and gives you tighter tail latencies, but you pay for it in ramp-up time — teams typically report several months before engineers are fully productive.

For most startups the bottleneck is the database and the network, not the language runtime, so hiring pool and shipping speed should dominate the decision. Pick Go unless you have a specific latency or memory constraint that Go cannot meet.`,
      audit: {
        summary: 'Directionally sound engineering advice, but much of this is judgement and rules of thumb rather than checkable fact.',
        claims: [
          { text: 'Rust gives tighter tail latencies than Go under sustained load', tier: 'contestable',
            note: 'Generally true because of GC pauses, but the gap depends heavily on workload and tuning.', check: 'Benchmark your own p99 with a representative payload before deciding.' },
          { text: 'Go has no garbage-collection pauses of consequence', tier: 'contestable',
            note: 'Go GC pauses are sub-millisecond in modern versions but not zero, and allocation pressure still shows up at p99.', check: 'Measure GC pause distribution in your service under peak load.' },
          { text: 'Teams need several months to become productive in Rust', tier: 'unverifiable',
            note: 'Widely repeated as folklore; the specific timeframe is not backed by a source here.', check: 'Ask teams who have actually migrated, and treat any single number as anecdotal.' },
          { text: 'For most startups the bottleneck is the database and network', tier: 'opinion',
            note: 'A common and defensible heuristic, but stated as though it were measured.', check: 'Profile your own stack — the claim is only true until it is not.' },
          { text: 'Hiring pool should dominate the language decision', tier: 'opinion',
            note: 'A prioritisation judgement that depends entirely on your team and market.', check: null },
          { text: 'Pick Go unless you have a specific constraint Go cannot meet', tier: 'opinion',
            note: 'A recommendation, presented in the grammar of a conclusion.', check: null }
        ]
      }
    }
  ];

  const GENERIC = {
    answer:
`[DEMO MODE] No model was called for this question, so there is no real answer to show.

This build is running the interface end to end on scripted data so the cognition graph, the tier grading and the audit choreography can be demonstrated without an API key. Every node you are about to see is illustrative.

To get real answers and a real adversarial audit, point the app at an endpoint that proxies the Anthropic Messages API — see the note in the README.`,
    audit: {
      summary: 'DEMO OUTPUT — these grades are fabricated for the interface demo and verify nothing at all.',
      claims: [
        { text: 'This response was produced by a scripted demo, not a model', tier: 'verified',
          note: 'Stated directly by the build; MODE reads DEMO in the masthead.', check: null },
        { text: 'The audit tiers shown here were written by hand in advance', tier: 'verified',
          note: 'They live in demo-data.js and never touch a web search.', check: null },
        { text: 'A live build would grade this question differently', tier: 'unverifiable',
          note: 'No model has seen the question, so there is nothing to compare against.', check: 'Configure an API endpoint and re-run the same question.' },
        { text: 'Second-pass auditing meaningfully improves trust calibration', tier: 'contestable',
          note: 'Plausible and the premise of this project, but not demonstrated by this page.', check: 'Run the same prompts with and without the audit pass and compare.' },
        { text: 'Showing uncertainty visually is better than hiding it', tier: 'opinion',
          note: 'The design thesis of this interface, held as a value rather than a finding.', check: null }
      ]
    }
  };

  function pick(question){
    const hit = SAMPLES.find((s) => s.match.test(question));
    return hit || GENERIC;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    isDemo: true,
    async answer(question){
      await wait(700 + Math.random() * 500);
      return pick(question).answer;
    },
    async audit(question){
      await wait(1100 + Math.random() * 700);
      return pick(question).audit;
    }
  };
})();
