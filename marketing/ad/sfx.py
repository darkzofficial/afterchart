"""Afterchart ad — procedural sound design + music bed, synced to timeline.js.

    node timeline.js > build/cues.json && python3 sfx.py   ->  build/audio.wav

Everything is synthesized here (no samples), so there are no licensing questions.
"""
import json, math
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
rng = np.random.default_rng(42)
TL = json.load(open('build/cues.json'))
N = int(TL['DURATION'] * SR)
L = np.zeros(N); R = np.zeros(N)          # dry bus
RL = np.zeros(N); RR = np.zeros(N)        # reverb send
MUS_L = np.zeros(N); MUS_R = np.zeros(N)  # music bus (ducked later)


# ---------------- helpers ----------------
def tt(dur): return np.arange(int(dur * SR)) / SR
def white(n): return rng.standard_normal(n)
def pink(n):
    b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, white(n)) * 8
def sos(kind, f, order=2): return signal.butter(order, f, btype=kind, fs=SR, output='sos')
def filt(x, kind, f, order=2): return signal.sosfilt(sos(kind, f, order), x)
def env_adsr(n, a, d, s, r):
    t = np.arange(n) / SR; dur = n / SR; e = np.zeros(n)
    e = np.where(t < a, t / max(a, 1e-6), e)
    m = (t >= a) & (t < a + d); e[m] = 1 - (1 - s) * (t[m] - a) / max(d, 1e-6)
    m = (t >= a + d) & (t < dur - r); e[m] = s
    m = t >= dur - r; e[m] = s * (1 - (t[m] - (dur - r)) / max(r, 1e-6))
    return np.clip(e, 0, 1)
def svf_bp(x, fc, q):
    """time-varying state-variable band-pass (fc array in Hz)"""
    y = np.zeros_like(x); low = band = 0.0
    f = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR); damp = 1 / q
    for i in range(len(x)):
        high = x[i] - low - damp * band
        band += f[i] * high; low += f[i] * band
        y[i] = band
    return y
def place(x, t, gain=1.0, pan=0.0, rev=0.0, bus='fx'):
    """mix mono or (2,n) stereo signal at time t"""
    i = int(t * SR)
    if x.ndim == 1: xl, xr = x * math.cos((pan + 1) * math.pi / 4), x * math.sin((pan + 1) * math.pi / 4)
    else: xl, xr = x[0], x[1]
    if i < 0: xl, xr, i = xl[-i:], xr[-i:], 0
    n = min(len(xl), N - i)
    if n <= 0: return
    tl, tr = (L, R) if bus == 'fx' else (MUS_L, MUS_R)
    tl[i:i + n] += xl[:n] * gain; tr[i:i + n] += xr[:n] * gain
    if rev:
        RL[i:i + n] += xl[:n] * gain * rev; RR[i:i + n] += xr[:n] * gain * rev
def pan_sweep(x, a, b):
    p = np.linspace(a, b, len(x)); return np.vstack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)])
def norm(x, peak=1.0): m = np.max(np.abs(x)); return x / m * peak if m > 0 else x


# ---------------- sound designs ----------------
def whoosh(dur, big=False):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    fc = 250 + 3200 * np.sin(np.pi * np.clip(t * 1.15, 0, 1)) ** 2 * (1.2 if big else 1)
    x = svf_bp(pink(n), fc, 1.6)
    e = np.where(t < .62, (t / .62) ** 2.2, np.exp(-(t - .62) * 9))
    x = norm(x * e) * .8
    if big:  # body + doppler rumble
        rum = filt(pink(n), 'lowpass', 140, 4) * e
        tone = np.sin(2 * np.pi * np.cumsum(90 + 60 * np.sin(np.pi * t)) / SR) * e * .25
        x = x + norm(rum) * .6 + tone
    return pan_sweep(x, -.7, .7)
def swish(dur):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    x = svf_bp(white(n), 1200 + 5500 * np.sin(np.pi * t) ** 1.5, 2.2)
    e = np.sin(np.pi * t) ** 1.6
    return pan_sweep(norm(x * e) * .7, .4, -.4)
def reverse_swell(dur):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    x = filt(white(n), 'highpass', 2500) * t ** 3.5
    low = np.sin(2 * np.pi * np.cumsum(60 + 140 * t) / SR) * t ** 3 * .5
    return norm(x * .6 + low)
def impact(big=False):
    d = 2.6 if big else 1.3; t = tt(d)
    sub = np.sin(2 * np.pi * np.cumsum(32 + 70 * np.exp(-t * 14)) / SR) * np.exp(-t * (1.6 if big else 3.2))
    body = filt(white(len(t)), 'lowpass', 1800) * np.exp(-t * 38)
    mid = np.sin(2 * np.pi * 130 * t) * np.exp(-t * 12) * .5
    x = sub * .7 + body * .9 + mid * 1.2
    if big:
        tail = filt(pink(len(t)), 'lowpass', 300, 4) * np.exp(-t * 2.2) * .35
        crack = filt(white(len(t)), 'highpass', 3000) * np.exp(-t * 60) * .5
        x = x + tail + crack
    return np.tanh(norm(x) * 1.6) * .9
def riser(dur):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    noise = svf_bp(white(n), 400 + 7000 * t ** 2, 1.2) * t ** 2
    gl = sum(np.sin(2 * np.pi * np.cumsum(f * (1 + 2.2 * t ** 2)) / SR) for f in (220, 331, 441)) / 3
    x = norm(noise) * .6 + gl * t ** 2.5 * .35
    return pan_sweep(norm(x), -.3, .3)
def shimmer(dur):
    t = tt(dur); x = np.zeros_like(t)
    for k in range(14):
        f = rng.uniform(2400, 6800); st = rng.uniform(0, dur * .5)
        e = np.where(t > st, np.exp(-(t - st) * rng.uniform(5, 10)), 0)
        x += np.sin(2 * np.pi * f * t) * e * rng.uniform(.3, 1)
    return norm(x) * .7
def pop():
    t = tt(.18)
    x = np.sin(2 * np.pi * np.cumsum(900 * np.exp(-t * 18) + 260) / SR) * np.exp(-t * 26)
    x += filt(white(len(t)), 'bandpass', [1500, 5000]) * np.exp(-t * 200) * .4
    return norm(x)
def tick(f=4200):
    t = tt(.03); x = filt(white(len(t)), 'bandpass', [f * .7, f * 1.3]) * np.exp(-t * 320)
    x += np.sin(2 * np.pi * f * .5 * t) * np.exp(-t * 400) * .4
    return norm(x)
def blip(freq, soft=False):
    t = tt(.5)
    x = (np.sin(2 * np.pi * freq * t) + .35 * np.sin(2 * np.pi * freq * 2 * t) + .12 * np.sin(2 * np.pi * freq * 3.01 * t))
    x *= np.exp(-t * (9 if soft else 6)) * np.minimum(1, t / .003)
    if soft: x = filt(x, 'lowpass', 1400)
    return norm(x)
def tap():
    t = tt(.09)
    x = filt(white(len(t)), 'bandpass', [900, 3200]) * np.exp(-t * 260) * .8
    x += np.sin(2 * np.pi * 190 * t) * np.exp(-t * 70)
    return norm(x)
def key():
    t = tt(.12); x = np.zeros_like(t)
    for st, g in ((0, 1), (rng.uniform(.045, .07), .55)):
        e = np.where(t > st, np.exp(-(t - st) * 420), 0)
        x += filt(white(len(t)), 'bandpass', [rng.uniform(1800, 2600), rng.uniform(5200, 7000)]) * e * g
    x += np.sin(2 * np.pi * 320 * t) * np.exp(-t * 120) * .25
    return norm(x)
def chime():
    t = tt(1.4); x = np.zeros_like(t)
    for f0, st in ((1318.5, 0), (1975.5, .09)):
        e = np.where(t > st, np.exp(-(t - st) * 4.2), 0) * np.minimum(1, np.maximum(t - st, 0) / .002)
        for h, g in ((1, 1), (2.76, .35), (5.4, .12)):
            x += np.sin(2 * np.pi * f0 * h * (t - st)) * e * g
    return norm(x)
def thump():
    t = tt(1.0)
    x = np.sin(2 * np.pi * np.cumsum(45 + 60 * np.exp(-t * 20)) / SR) * np.exp(-t * 5)
    x += filt(white(len(t)), 'highpass', 2000) * np.exp(-t * 45) * .6
    return np.tanh(norm(x) * 1.4)
def zap(dur=.06, g=1.0):
    t = tt(dur)
    imp = (rng.random(len(t)) < .02) * rng.standard_normal(len(t)) * 6
    x = filt(imp + white(len(t)) * .25, 'highpass', 1800) * np.exp(-t * 35)
    x += np.sign(np.sin(2 * np.pi * 120 * t)) * np.exp(-t * 40) * .3
    return norm(x) * g


# ---------------- place cues ----------------
WIN_SCALE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5]
win_i = 0
for c in TL['cues']:
    ty, t0, g = c['type'], c['t'], c.get('gain', 1)
    if ty == 'whoosh': place(whoosh(c['dur'] * 1.3, c.get('big')), t0 - c['dur'] * .55, g * .55, rev=.2)
    elif ty == 'swish': place(swish(c['dur']), t0, g * .5, rev=.15)
    elif ty == 'reverse': place(reverse_swell(c['dur']), t0, g * .5, rev=.3)
    elif ty == 'impact': place(impact(c.get('big')), t0, g * .9, rev=.35)
    elif ty == 'riser': place(riser(c['dur']), t0, g * .45, rev=.25)
    elif ty == 'shimmer': place(shimmer(c['dur']), t0, g * .3, pan=.3, rev=.5)
    elif ty == 'pop': place(pop(), t0, g * .5, pan=rng.uniform(-.3, .3), rev=.2)
    elif ty == 'tick': place(tick(3200), t0, g * .35, rev=.1)
    elif ty == 'tap': place(tap(), t0, g * .55, rev=.1)
    elif ty == 'key': place(key(), t0, g * .45, pan=rng.uniform(-.15, .15), rev=.05)
    elif ty == 'chime': place(chime(), t0, g * .35, pan=.25, rev=.45)
    elif ty == 'thump': place(thump(), t0, g * .7, rev=.3)
    elif ty == 'blip':
        day = c['day']; loss = day in ('2026-10-06', '2026-10-16', '2026-10-19', '2026-10-20')
        if loss: place(blip(220.0, soft=True), t0, g * .35, pan=-.2, rev=.3)
        else: place(blip(WIN_SCALE[min(win_i, len(WIN_SCALE) - 1)]), t0, g * .32, pan=-.5 + win_i * .12, rev=.35); win_i += 1
    elif ty == 'ticks':  # counter ticks: one tick each time the eased count crosses a step
        steps = 28
        for k in range(1, steps):
            p = 1 - (1 - k / steps) ** (1 / 3)  # inverse of ease-out-cubic
            place(tick(4600 + 400 * (k % 3)), t0 + p * c['dur'], g * .3 * (1 - k / steps * .5), pan=.25)

# ---------------- wind bed (follows the visual streak envelope) ----------------
def wind_env(t):
    w = 0.0
    for c in TL['cues']:
        if c['type'] not in ('whoosh', 'reverse'): continue
        p = (t - c['t']) / c.get('dur', .5)
        if -0.2 < p < 1: w = max(w, (1 if c.get('big') else .55) * math.sin(math.pi * min(max((p + .2) / 1.2, 0), 1)))
    return w
tw = np.arange(0, N, 480) / SR
we = np.interp(np.arange(N) / SR, tw, [wind_env(x) for x in tw])
base = filt(filt(pink(N), 'lowpass', 650, 2), 'highpass', 110, 2)
gust = svf_bp(pink(N), 300 + 1600 * we + 120 * np.sin(np.arange(N) / SR * 1.3), 1.4)
slow = .55 + .45 * np.sin(np.arange(N) / SR * .7) * np.sin(np.arange(N) / SR * .23 + 1)
active = np.interp(np.arange(N) / SR, [0, .3, 20.0, 20.6, 25], [0, 1, 1, 0, 0])
wind = (norm(base) * .09 * slow + norm(filt(gust, 'highpass', 150)) * .24 * we) * active
L += wind * .9; R += np.roll(wind, 240) * .9   # slight decorrelation for width

# ---------------- music bed (128 bpm) ----------------
M = TL['MUSIC']; beat = 60 / M['bpm']; grid0 = 3.12  # first downbeat lands on the reveal impact
def note(m): return 440 * 2 ** ((m - 69) / 12)
CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 60], [55, 59, 62, 67]]  # Am7 Fmaj7 C G
ROOTS = [45, 41, 48, 43]  # A2 F2 C3 G2: audible on phone speakers
def saw_pad(freqs, dur):
    t = tt(dur); x = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ph = rng.uniform(0, 1)
            x += 2 * ((t * f * 2 ** (det / 12) + ph) % 1) - 1
    x = filt(filt(x, 'lowpass', 2200, 2), 'highpass', 200, 2)
    return x / (len(freqs) * 3)
def kick():
    t = tt(.45)
    x = np.sin(2 * np.pi * np.cumsum(55 + 120 * np.exp(-t * 30)) / SR) * np.exp(-t * 8.5)
    x += filt(white(len(t)), 'highpass', 4000) * np.exp(-t * 300) * .15
    return np.tanh(x * 1.8)
def hat(open_=False):
    t = tt(.25 if open_ else .05); return filt(white(len(t)), 'highpass', 8000) * np.exp(-t * (18 if open_ else 110))
def clap():
    t = tt(.3); x = np.zeros_like(t)
    for st in (0, .011, .022):
        x += filt(white(len(t)), 'bandpass', [900, 3500]) * np.where(t > st, np.exp(-(t - st) * 45), 0)
    return x * .6

bar = beat * 4
pad_start, music_end = M['start'], M['end']
# pad intro swell before the drop
place(saw_pad([note(m) for m in CHORDS[0]], grid0 - pad_start + .2) * np.linspace(0, 1, int((grid0 - pad_start + .2) * SR)) ** 2, pad_start, .5, bus='mus')
nbars = int((music_end - grid0) / bar) + 1
for b in range(nbars):
    tb = grid0 + b * bar; ci = b % 4
    if tb > music_end: break
    pd = saw_pad([note(m) for m in CHORDS[ci]], bar + .05) * env_adsr(int((bar + .05) * SR), .02, .3, .8, .2)
    place(np.vstack([pd, np.roll(pd, 300)]), tb, .42, bus='mus')
    for k in range(4):
        tk = tb + k * beat
        if tk > music_end: break
        breakdown = 17.45 < tk < 18.5
        if not breakdown:
            place(kick(), tk, .5, bus='mus')
            sub = np.sin(2 * np.pi * note(ROOTS[ci]) * tt(beat)) * env_adsr(int(beat * SR), .01, .1, .7, .08)
            place(sub, tk + .02, .16, bus='mus')
            place(hat(), tk + beat / 2, .3, pan=.3, bus='mus')
            if k in (1, 3): place(clap(), tk, .35, pan=-.1, bus='mus')
            if k == 3 and b % 2 == 1: place(hat(True), tk + beat * .75, .12, pan=-.3, bus='mus')
# sidechain the music bus to the kick grid and duck it under the voice-less SFX moments
tA = np.arange(N) / SR
ph = ((tA - grid0) % beat) / beat
side = np.where(tA >= grid0, 0.45 + 0.55 * np.clip(ph / .35, 0, 1) ** .7, 1)
duck = np.interp(tA, [0, 17.4, 17.6, 18.5, 18.6, 19.9, 20.4, 25], [1, 1, .35, .35, 1, 1, 0, 0])
MUS_L *= side * duck; MUS_R *= side * duck
# soft pad tail under the neon logo
tail_t = 21.32; tail = saw_pad([note(m) for m in (45, 57, 60, 64)], TL['DURATION'] - tail_t)
tail = filt(tail, 'lowpass', 700) * np.minimum(1, tt(TL['DURATION'] - tail_t) / 1.2) * np.linspace(1, .6, len(tail))
place(np.vstack([tail, np.roll(tail, 400)]), tail_t, .22, bus='mus')

# ---------------- neon buzz (follows the flicker steps) ----------------
def step_at(t, steps):
    v = steps[0][1]
    for st, sv in steps:
        if t >= st: v = sv
    return v
neon_t0 = 20.9
tn = np.arange(int(neon_t0 * SR), N) / SR
inten = np.array([step_at(x, TL['NEON']) for x in tn[::48]]); inten = np.repeat(inten, 48)[:len(tn)]
let = TL['NEON_LETTER']
lv = np.array([step_at(x, let['steps']) if x >= let['steps'][0][0] else 1 for x in tn[::48]]); lv = np.repeat(lv, 48)[:len(tn)]
inten = inten * (0.8 + 0.2 * lv)
inten = signal.lfilter([0.02], [1, -0.98], inten)  # ~1ms smoothing so steps don't click
hum = np.zeros_like(tn)
for h, g in ((1, .15), (2, 1), (3, .6), (4, .45), (5, .25), (6, .3), (8, .15), (10, .1), (14, .05)):
    hum += np.sin(2 * np.pi * 60 * h * tn + h) * g
hum = filt(np.tanh(hum * 2.2), 'highpass', 100)  # saturated = buzzy
hum += filt(white(len(tn)), 'bandpass', [2500, 7000]) * .35 * (1 + np.sin(2 * np.pi * 120 * tn))  # gas sizzle
hum = norm(hum) * inten * (0.92 + .08 * np.sin(2 * np.pi * 7.3 * tn))
place(np.vstack([hum, np.roll(hum, 120)]), neon_t0, .2)
# zaps on every flick and random crackles once lit
prev = 0
for st, v in TL['NEON'] + let['steps']:
    if st < neon_t0: continue
    if abs(v - prev) > .25: place(zap(rng.uniform(.04, .09), .5 + .5 * v), st, .32, pan=rng.uniform(-.4, .4), rev=.25)
    prev = v
for _ in range(9):
    place(zap(rng.uniform(.02, .04), .35), rng.uniform(22.1, 24.7), .14, pan=rng.uniform(-.5, .5), rev=.2)

# ---------------- reverb, master ----------------
ir_t = tt(1.6)
ir = white(len(ir_t)) * np.exp(-ir_t * 3.6); ir = filt(ir, 'lowpass', 6000); ir /= np.sqrt(np.sum(ir ** 2))
ir2 = np.roll(white(len(ir_t)) * np.exp(-ir_t * 3.6), 37); ir2 = filt(ir2, 'lowpass', 6000); ir2 /= np.sqrt(np.sum(ir2 ** 2))
wetL = signal.fftconvolve(RL, ir)[:N] * .35; wetR = signal.fftconvolve(RR, ir2)[:N] * .35
mixL = L * 1.25 + wetL + MUS_L * .5; mixR = R * 1.25 + wetR + MUS_R * .5
# final fade-out of the last 0.35s
fade = np.ones(N); fn = int(.35 * SR); fade[-fn:] = np.linspace(1, 0, fn)
mix = np.vstack([mixL, mixR]) * fade
mix = filt(mix, 'highpass', 42, 4)
# tame sub build-up: low shelf ~ -5 dB under 90 Hz
low = filt(mix, 'lowpass', 120, 2); mix = mix - low * 0.55
mix = mix + filt(mix, 'highpass', 2500, 2) * 0.6  # presence / air for phone speakers
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.25) * .89   # gentle saturation / limiting
wavfile.write('build/audio.wav', SR, (mix.T * 32767).astype(np.int16))
print('wrote build/audio.wav', mix.shape[1] / SR, 's')
