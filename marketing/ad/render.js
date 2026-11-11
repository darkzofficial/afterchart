// Renders ad.html deterministically, frame by frame.
//   node render.js stills 0.5,3.4,6.8      -> build/still_<t>.png
//   node render.js video [fps] [from] [to] -> build/video_silent.mp4 (frames piped to ffmpeg)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const TL = require('./timeline.js');

(async () => {
  const [mode = 'stills', arg1, arg2, arg3] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await page.goto('file://' + path.join(__dirname, 'ad.html'));
  await page.evaluate(() => window.ready);
  await page.waitForTimeout(300);

  if (mode === 'stills') {
    for (const t of (arg1 || '1').split(',').map(Number)) {
      await page.evaluate((x) => window.render(x), t);
      await page.screenshot({ path: path.join(__dirname, 'build', `still_${t.toFixed(2)}.png`) });
    }
  } else {
    const fps = Number(arg1 || TL.FPS), from = Number(arg2 || 0), to = Number(arg3 || TL.DURATION);
    const out = path.join(__dirname, 'build', process.env.OUT || 'video_silent.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const n = Math.round((to - from) * fps);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const t = from + i / fps;
      await page.evaluate((x) => window.render(x), t);
      const buf = await page.screenshot({ type: 'jpeg', quality: 97 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 120 === 0) console.log(`frame ${i}/${n}  t=${t.toFixed(2)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log('wrote', out, 'in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  await browser.close();
})();
