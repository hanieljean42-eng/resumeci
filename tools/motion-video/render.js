// Rendu image par image des scènes d'un projet vidéo (1080x1920, 30 i/s).
//   node tools/motion-video/render.js <dossierProjet> preview   -> <projet>/preview/<id>.jpg
//   node tools/motion-video/render.js <dossierProjet> [id...]   -> <projet>/frames/<id>/%05d.jpg
// Le projet contient scenes.js (voir SKILL video-motion-design).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const puppeteer = require(path.join(__dirname, '..', '..', 'node_modules', 'puppeteer-core'));
const { sceneDur } = require('./lib');

const FPS = 30;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

(async () => {
  const [proj, ...rest] = process.argv.slice(2);
  if (!proj) throw new Error('Usage : render.js <dossierProjet> [preview] [id...]');
  const P = path.resolve(proj);
  const SCENES = require(path.join(P, 'scenes.js'));
  const preview = rest[0] === 'preview';
  const only = preview ? rest.slice(1) : rest;
  const list = SCENES.filter(s => !only.length || only.includes(s.id));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'rci-motion-' + Date.now()),
    args: ['--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, 'stage.html')).href, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.evaluate(async () => {
    const loads = ['900 40px "Font Awesome 6 Free"', '400 40px "Font Awesome 6 Brands"'].concat([400, 600, 700, 800, 900].map(w => `${w} 40px Inter`));
    for (const f of loads) await document.fonts.load(f, 'AaéÉ0123\uf02d\uf232');
    await document.fonts.ready;
  });
  for (const sc of list) {
    const dur = sceneDur(sc);
    await page.evaluate(s => window.build(s), { ...sc, dur });
    await page.evaluate(async () => { window.seek(30); await new Promise(r => setTimeout(r, 300)); await document.fonts.ready; });
    if (preview) {
      fs.mkdirSync(path.join(P, 'preview'), { recursive: true });
      await page.evaluate(t => window.seek(t), Math.min(dur - 0.05, 3.5));
      await page.screenshot({ path: path.join(P, 'preview', sc.id + '.jpg'), type: 'jpeg', quality: 70 });
      console.log('preview', sc.id, dur.toFixed(2) + 's');
      continue;
    }
    const dir = path.join(P, 'frames', sc.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(dur * FPS);
    for (let f = 0; f < n; f++) {
      await page.evaluate(t => window.seek(t), f / FPS);
      await page.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 });
    }
    console.log('frames', sc.id, n);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
