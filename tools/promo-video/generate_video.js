// Génère la vidéo promo ResumeCI (MP4 vertical 1080x1920) à partir de promo.html.
// Rendu image par image avec Chrome (puppeteer-core) puis encodage ffmpeg.
//
// Usage :
//   node tools/promo-video/generate_video.js [--fps 30] [--music chemin/musique.mp3] [--out out/resumeci-promo.mp4]
// Prérequis : Google Chrome ou Microsoft Edge installé, ffmpeg dans le PATH (ou FFMPEG_PATH).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const FPS = Number(opt('fps', 30));
const MUSIC = opt('music', null);
const OUT = path.resolve(opt('out', path.join(__dirname, 'out', 'resumeci-promo.mp4')));
const WIDTH = 1080, HEIGHT = 1920;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Edge introuvable. Définis CHROME_PATH.');
  return found;
}

function findFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  const first = (probe.stdout || '').split(/\r?\n/).find(l => l.trim());
  if (!first) throw new Error('ffmpeg introuvable. Installe-le (winget install Gyan.FFmpeg) ou définis FFMPEG_PATH.');
  return first.trim();
}

(async () => {
  const chrome = findChrome();
  const ffmpeg = findFfmpeg();
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resumeci-promo-'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  console.log(`Chrome : ${chrome}\nffmpeg : ${ffmpeg}\nFrames : ${framesDir}`);
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${WIDTH},${HEIGHT}`] });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'promo.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  const durationMs = await page.evaluate(() => window.__duration);
  const total = Math.ceil(durationMs / 1000 * FPS);
  console.log(`Rendu de ${total} images à ${FPS} fps (${(durationMs / 1000).toFixed(1)} s)...`);

  for (let i = 0; i < total; i++) {
    const t = i / FPS * 1000;
    await page.evaluate(ms => window.__seek(ms), t);
    await page.screenshot({ path: path.join(framesDir, `f${String(i).padStart(5, '0')}.png`), type: 'png' });
    if (i % FPS === 0) process.stdout.write(`  ${Math.round(i / total * 100)}%\r`);
  }
  await browser.close();
  console.log('  100%  Encodage MP4...');

  const ffArgs = ['-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png')];
  if (MUSIC && fs.existsSync(MUSIC)) ffArgs.push('-i', MUSIC, '-shortest', '-c:a', 'aac', '-b:a', '160k', '-af', 'afade=t=out:st=' + (durationMs / 1000 - 1.5) + ':d=1.5');
  ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', OUT);
  const enc = spawnSync(ffmpeg, ffArgs, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (enc.status !== 0) { console.error(enc.stderr.slice(-1500)); throw new Error('Échec ffmpeg'); }

  fs.rmSync(framesDir, { recursive: true, force: true });
  const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`✅ Vidéo générée : ${OUT} (${size} Mo)`);
})().catch(err => { console.error('❌', err.message); process.exit(1); });
