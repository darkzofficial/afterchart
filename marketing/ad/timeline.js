// Afterchart TikTok ad — single source of truth for timing.
// Used by ad.html (visuals) and sfx.py (sound, via `node timeline.js > build/cues.json`).
(function (root) {
  const DURATION = 25.0;
  const FPS = 60;

  // Calendar: days lit in sequence during the calendar scene (from the demo month).
  const CAL_START = 9.45, CAL_STEP = 0.13;
  const CAL_DAYS = ['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-16', '2026-10-19', '2026-10-20',
    '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-29', '2026-10-30'];

  // Neon flicker: step function of [time, intensity 0..1]. Holds each value until the next step.
  const NEON = [
    [0, 0], [20.95, 0.85], [21.0, 0], [21.12, 0.35], [21.15, 0], [21.32, 1], [21.37, 0.15], [21.42, 0.9],
    [21.46, 0], [21.62, 1], [21.67, 0.55], [21.71, 1], [21.95, 0.7], [21.98, 1],
  ];
  // One letter (the "c") keeps misbehaving, like a real tube.
  const NEON_LETTER = { index: 5, steps: [[22.9, 0.25], [22.95, 1], [23.05, 0.2], [23.1, 0.9], [23.13, 0.3], [23.2, 1], [24.1, 0.4], [24.14, 1]] };

  const cues = [
    // hook
    { type: 'impact', t: 0.15, gain: 0.55 },
    { type: 'whoosh', t: 1.12, dur: 0.45, gain: 0.6 },
    { type: 'impact', t: 1.25, gain: 0.65 },
    { type: 'riser', t: 1.55, dur: 0.8, gain: 0.5 },
    // phone reveal
    { type: 'whoosh', t: 2.28, dur: 0.9, gain: 1.0, big: true },
    { type: 'impact', t: 3.12, gain: 1.0, big: true },
    { type: 'shimmer', t: 3.35, dur: 0.7, gain: 0.35 },
    { type: 'whoosh', t: 4.95, dur: 0.4, gain: 0.55 },
    // dashboard
    { type: 'pop', t: 6.02, gain: 0.7 },
    { type: 'pop', t: 6.32, gain: 0.6 },
    { type: 'ticks', t: 6.05, dur: 1.15, gain: 0.35 },
    { type: 'whoosh', t: 7.45, dur: 0.5, gain: 0.55 },
    { type: 'swish', t: 7.7, dur: 0.85, gain: 0.45 },
    { type: 'whoosh', t: 8.45, dur: 0.55, gain: 0.6 },
    // calendar
    { type: 'pop', t: 9.0, gain: 0.8 },
    { type: 'tap', t: 11.3, gain: 0.8 },
    { type: 'whoosh', t: 11.45, dur: 0.4, gain: 0.45 },
    // day + add trade
    { type: 'swish', t: 11.72, dur: 0.35, gain: 0.4 },
    { type: 'tap', t: 13.0, gain: 0.8 },
    { type: 'swish', t: 13.08, dur: 0.35, gain: 0.4 },
    { type: 'pop', t: 13.6, gain: 0.8 },
    { type: 'chime', t: 13.72, gain: 0.5 },
    // search
    { type: 'whoosh', t: 15.0, dur: 0.5, gain: 0.6 },
    { type: 'key', t: 15.55, gain: 0.6 }, { type: 'key', t: 15.66, gain: 0.55 },
    { type: 'key', t: 15.86, gain: 0.6 }, { type: 'key', t: 16.03, gain: 0.55 },
    { type: 'tap', t: 16.6, gain: 0.8 },
    { type: 'whoosh', t: 16.72, dur: 0.45, gain: 0.5 },
    // free
    { type: 'riser', t: 17.5, dur: 0.95, gain: 0.6 },
    { type: 'whoosh', t: 18.2, dur: 0.6, gain: 1.0, big: true },
    { type: 'impact', t: 18.55, gain: 1.0, big: true },
    { type: 'tick', t: 19.2, gain: 0.4 }, { type: 'tick', t: 19.42, gain: 0.4 }, { type: 'tick', t: 19.64, gain: 0.45 },
    { type: 'reverse', t: 20.05, dur: 0.6, gain: 0.6 },
    // neon
    { type: 'thump', t: 21.32, gain: 0.7 },
  ];
  CAL_DAYS.forEach((d, i) => cues.push({ type: 'blip', t: CAL_START + i * CAL_STEP, gain: 0.5, day: d, i }));

  const MUSIC = { start: 2.6, end: 20.1, bpm: 128 };

  const TL = { DURATION, FPS, CAL_START, CAL_STEP, CAL_DAYS, NEON, NEON_LETTER, cues, MUSIC };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TL;
    if (require.main === module) process.stdout.write(JSON.stringify(TL, null, 1));
  } else root.TL = TL;
})(this);
