// Génère les slides PNG 1280x720 de la vidéo via Chrome/Edge (puppeteer-core).
// Usage : node tools/video/gen_slides.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const SCENES = require('./scenes');

const OUT = path.join(__dirname, 'out');
const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const LOGO = `<svg viewBox="0 0 512 512" style="width:56px;height:56px"><rect width="512" height="512" rx="96" fill="#2563eb"/><path d="M128 128h188c38 0 68 30 68 68v188H196c-38 0-68-30-68-68V128z" fill="#ffffff" opacity="0.95"/><path d="M164 168h160M164 220h160M164 272h120" stroke="#2563eb" stroke-width="24" stroke-linecap="round"/><circle cx="356" cy="356" r="58" fill="#10b981"/><path d="M330 356l18 18 38-44" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function slideHtml(s, i) {
  const n = SCENES.length;
  const bars = Array.from({ length: n }, (_, k) =>
    `<span style="display:inline-block;width:26px;height:5px;border-radius:3px;background:${k <= i ? '#2563eb' : '#e2e8f0'}"></span>`).join('');
  return `<div class="scene" id="scene-${i}">
    <div class="top">${LOGO}<div class="brand">Resume<em>CI</em></div><div class="pill">NOUVEAUTÉS</div></div>
    <div class="body">
      ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}
      <h1>${esc(s.title)}</h1>
      <div class="lines">${s.lines.map(l => `<div class="line">${esc(l)}</div>`).join('')}</div>
    </div>
    <div class="foot"><div class="bars">${bars}</div><div class="url">resumeci.me</div></div>
  </div>`;
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Poppins','Segoe UI',Arial,sans-serif; }
  .scene { display:none; width:1280px; height:720px; position:relative; overflow:hidden;
    background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 55%,#e0e7ff 100%); }
  .scene.on { display:block; }
  .scene::before { content:''; position:absolute; right:-160px; top:-160px; width:520px; height:520px;
    border-radius:50%; background:radial-gradient(circle,rgba(37,99,235,.14),transparent 70%); }
  .scene::after { content:''; position:absolute; left:-120px; bottom:-180px; width:460px; height:460px;
    border-radius:50%; background:radial-gradient(circle,rgba(124,58,237,.12),transparent 70%); }
  .top { display:flex; align-items:center; gap:14px; padding:36px 48px 0; position:relative; z-index:2; }
  .brand { font-size:30px; font-weight:900; color:#0f172a; letter-spacing:-.5px; }
  .brand em { font-style:normal; color:#2563eb; }
  .pill { margin-left:auto; font-size:12px; font-weight:800; letter-spacing:2px; color:#fff;
    background:linear-gradient(135deg,#2563eb,#7c3aed); padding:8px 16px; border-radius:99px; }
  .body { padding:56px 72px 0; position:relative; z-index:2; }
  .kicker { display:inline-block; font-size:14px; font-weight:800; letter-spacing:2.5px; color:#2563eb;
    background:#fff; border:1.5px solid #bfdbfe; padding:7px 16px; border-radius:99px; margin-bottom:22px; }
  h1 { font-size:58px; font-weight:900; color:#0f172a; letter-spacing:-1.5px; line-height:1.08; margin-bottom:30px; }
  .lines { display:flex; flex-direction:column; gap:14px; }
  .line { font-size:23px; font-weight:600; color:#334155; background:#fff; border:1.5px solid #e2e8f0;
    border-radius:14px; padding:15px 22px; box-shadow:0 4px 14px rgba(15,23,42,.05); width:fit-content; }
  .foot { position:absolute; bottom:0; left:0; right:0; display:flex; align-items:center;
    justify-content:space-between; padding:26px 48px; z-index:2; }
  .bars { display:flex; gap:6px; }
  .url { font-size:17px; font-weight:800; color:#2563eb; letter-spacing:.5px; }
</style></head><body>
${SCENES.map((s, i) => slideHtml(s, i)).join('\n')}
</body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'slides.html'), html);
  const exe = BROWSERS.find(b => fs.existsSync(b));
  if (!exe) throw new Error('Aucun navigateur Chrome/Edge trouvé');
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    userDataDir: path.join(require('os').tmpdir(), 'resumeci-video-' + Date.now()),
    args: ['--allow-file-access-from-files', '--force-device-scale-factor=1']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(OUT, 'slides.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 30000 });
  for (let i = 0; i < SCENES.length; i++) {
    await page.evaluate(idx => {
      document.querySelectorAll('.scene').forEach((el, k) => el.classList.toggle('on', k === idx));
    }, i);
    await new Promise(r => setTimeout(r, 150));
    await page.screenshot({ path: path.join(OUT, `scene_${String(i).padStart(2, '0')}.png`) });
    console.log(`📸 scene_${String(i).padStart(2, '0')}.png — ${SCENES[i].title}`);
  }
  await browser.close();
  console.log('Slides OK →', OUT);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
