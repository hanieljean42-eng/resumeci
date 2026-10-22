// Rendu image par image des scènes d'un projet vidéo (1080x1920, 30 i/s).
//   node tools/motion-video/render.js <dossierProjet> preview   -> <projet>/preview/<id>.jpg
//   node tools/motion-video/render.js <dossierProjet> [id...]   -> <projet>/frames/<id>/%05d.jpg
// Le projet contient scenes.js (voir SKILL video-motion-design).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const puppeteer = require(path.join(__dirname, '..', '..', 'node_modules', 'puppeteer-core'));
const { sceneDur, projectTheme, workDir } = require('./lib');

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
  const theme = projectTheme(P);
  console.log('décor :', theme);
  // Un navigateur par tâche (les onglets d'un même Chrome sont mis en pause en arrière-plan
  // et bloquent les captures). Chaque tâche rend une image sur WORKERS.
  const WORKERS = preview ? 1 : Math.max(2, Math.min(6, Number(process.env.MOTION_WORKERS) || os.cpus().length - 1));
  const browsers = [];
  const newPage = async (_, w) => {
    let browser;
    for (let k = 0; !browser; k++) {
      try {
        browser = await puppeteer.launch({
          executablePath: CHROME, headless: 'new', protocolTimeout: 120000,
          userDataDir: path.join(os.tmpdir(), `rci-motion-${Date.now()}-${w}`),
          args: ['--allow-file-access-from-files', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
        });
      } catch (e) { // EPERM transitoire (antivirus) au lancement de Chrome
        if (k >= 5) throw e;
        await new Promise(r => setTimeout(r, 1500 * (k + 1)));
      }
    }
    browsers.push(browser);
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(__dirname, 'stage.html')).href, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.evaluate(async () => {
      const loads = ['900 40px "Font Awesome 6 Free"', '400 40px "Font Awesome 6 Brands"'].concat([400, 600, 700, 800, 900].map(w => `${w} 40px Inter`));
      for (const f of loads) await document.fonts.load(f, 'AaéÉ0123\uf02d\uf232');
      await document.fonts.ready;
    });
    return page;
  };
  const pages = [];
  for (let w = 0; w < WORKERS; w++) pages.push(await newPage(null, w)); // lancement séquentiel
  const shot = (page, file, quality) => page.screenshot({ path: file, type: 'jpeg', quality, optimizeForSpeed: true });
  const t0 = Date.now();
  for (const sc of list) {
    const dur = sceneDur(sc);
    await Promise.all(pages.map(async page => {
      await page.evaluate(s => window.build(s), { ...sc, dur, theme });
      await page.evaluate(async () => { window.seek(30); await new Promise(r => setTimeout(r, 300)); await document.fonts.ready; });
    }));
    if (preview) {
      fs.mkdirSync(path.join(P, 'preview'), { recursive: true });
      await pages[0].evaluate(t => window.seek(t), Math.min(dur - 0.05, 3.5));
      await shot(pages[0], path.join(P, 'preview', sc.id + '.jpg'), 70);
      console.log('preview', sc.id, dur.toFixed(2) + 's');
      continue;
    }
    const dir = path.join(workDir(P), 'frames', sc.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(dur * FPS);
    // Démo : le mouvement est porté par l'écran incrusté (30 i/s) ; le décor derrière est rendu
    // 1 image sur 2 puis dupliqué -> 2x moins de captures sans perte visible.
    const step = sc.type === 'demo' ? 2 : 1;
    const name = f => path.join(dir, String(f).padStart(5, '0') + '.jpg');
    const keys = Array.from({ length: Math.ceil(n / step) }, (_, k) => k * step);
    await Promise.all(pages.map(async (page, w) => {
      for (let k = w; k < keys.length; k += WORKERS) {
        const f = keys[k];
        await page.evaluate(t => window.seek(t), f / FPS);
        await shot(page, name(f), 93);
        for (let d = 1; d < step && f + d < n; d++) fs.copyFileSync(name(f), name(f + d));
      }
    }));
    console.log('frames', sc.id, n);
  }
  if (!preview) console.log(`rendu en ${((Date.now() - t0) / 1000).toFixed(0)} s avec ${WORKERS} onglets`);
  await Promise.all(browsers.map(b => b.close()));
})().catch(e => { console.error(e); process.exit(1); });
