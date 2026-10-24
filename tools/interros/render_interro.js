// Générateur de sujets d'interro / devoir / examen type BAC — marque ResumeCI.
// Entrée : tools/interros/specs/<code>.json
// Sortie : _interros/<code>_enonce.pdf et _interros/<code>_corrige.pdf
// Usage : node tools/interros/render_interro.js specs/<fichier>.json [specs/...]
const fs = require('fs');
const path = require('path');
const katex = require('katex');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, '_interros');
const KATEX_CSS = path.join(ROOT, 'node_modules', 'katex', 'dist', 'katex.min.css');
const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const TYPES = {
  interro: { label: 'INTERROGATION', accent: '#2563eb', badge: '📝' },
  devoir: { label: 'DEVOIR SURVEILLÉ', accent: '#7c3aed', badge: '📋' },
  bac: { label: 'EXAMEN TYPE BAC', accent: '#dc2626', badge: '🎓' },
  bepc: { label: 'BEPC BLANC', accent: '#b45309', badge: '🎓' },
  td: { label: 'TRAVAUX DIRIGÉS (TD)', accent: '#0f766e', badge: '📚' },
  partiel: { label: "SUJET D'EXAMEN", accent: '#4f46e5', badge: '🏛️' },
};

// Rendu LaTeX : $$..$$ = bloc, $..$ = inline
function md(html) {
  return html
    .replace(/\$\$([^$]+)\$\$/g, (_, t) => katex.renderToString(t.trim(), { displayMode: true, throwOnError: false }))
    .replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t.trim(), { displayMode: false, throwOnError: false }));
}

const LOGO = `<svg viewBox="0 0 512 512" style="width:44px;height:44px"><rect width="512" height="512" rx="96" fill="#2563eb"/><path d="M128 128h188c38 0 68 30 68 68v188H196c-38 0-68-30-68-68V128z" fill="#ffffff" opacity="0.95"/><path d="M164 168h160M164 220h160M164 272h120" stroke="#2563eb" stroke-width="24" stroke-linecap="round"/><circle cx="356" cy="356" r="58" fill="#10b981"/><path d="M330 356l18 18 38-44" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// CSS KaTeX inline avec chemins de polices absolus (évite un blocage réseau)
let KATEX_INLINE = null;
function katexCss() {
  if (!KATEX_INLINE) {
    const dir = path.dirname(KATEX_CSS).replace(/\\/g, '/');
    KATEX_INLINE = fs.readFileSync(KATEX_CSS, 'utf8')
      .replace(/url\((['"]?)(?!data:|file:|https?:)/g, `url($1file:///${dir}/`);
  }
  return KATEX_INLINE;
}

function pageHtml(spec, corrige) {
  const T = TYPES[spec.type] || TYPES.interro;
  const accent = corrige ? '#059669' : T.accent;
  const exos = spec.exercices.map((ex, i) => {
    const enonceHtml = `${md(ex.enonce)}${ex.svg ? `<div class="exo-schema">${ex.svg}</div>` : ''}`;
    const body = corrige && ex.correction
      ? `<div class="exo-body">${enonceHtml}</div>
         <div class="correction"><div class="correction-tag">✔ Corrigé</div>${md(ex.correction)}</div>`
      : `<div class="exo-body">${enonceHtml}</div>`;
    return `<section class="exo">
      <div class="exo-head">
        <div class="exo-title">${md(ex.titre || 'Exercice ' + (i + 1))}${ex.points ? ` <span class="exo-pts">(${ex.points})</span>` : ''}</div>
        ${corrige && ex.bareme_detail ? `<div class="exo-bareme">${ex.bareme_detail}</div>` : ''}
      </div>
      ${ex.consigne ? `<div class="consigne">${md(ex.consigne)}</div>` : ''}
      ${body}
    </section>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>${katexCss()}</style>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 11.5pt; color: #1e293b; margin: 0; line-height: 1.45; }
  .page { padding: 0 2mm; }

  /* ---------- Bandeau marque ResumeCI ---------- */
  .ci-strip { height: 4px; display: flex; }
  .ci-strip > div { flex: 1; }
  .ci-o { background: #f77f00; } .ci-w { background: #ffffff; } .ci-g { background: #009e60; }
  .brand { display: flex; align-items: center; justify-content: space-between; padding: 4mm 0 3mm; border-bottom: 2.5px solid ${accent}; }
  .brand-left { display: flex; align-items: center; gap: 10px; }
  .brand-name { font-family: 'Segoe UI', Arial, sans-serif; font-size: 20pt; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; line-height: 1; }
  .brand-tag { font-family: 'Segoe UI', Arial, sans-serif; font-size: 7.5pt; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 2px; }
  .type-badge { font-family: 'Segoe UI', Arial, sans-serif; text-align: right; }
  .type-label { display: inline-block; background: ${accent}; color: #fff; font-weight: 800; font-size: 11pt; padding: 5px 14px; border-radius: 6px; letter-spacing: 0.5px; }
  .type-code { font-size: 8pt; color: #94a3b8; font-weight: 600; margin-top: 3px; }

  /* ---------- Tableau d'infos ---------- */
  .info-grid { display: flex; gap: 4mm; margin: 3.5mm 0; }
  .info-cell { flex: 1; border: 1.5px solid #e2e8f0; border-top: 2.5px solid ${accent}; border-radius: 6px; padding: 5px 8px 6px; text-align: center; }
  .info-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 6.5pt; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; }
  .info-value { font-size: 11pt; font-weight: 700; color: #0f172a; margin-top: 1px; }
  .eleve-line { display: flex; gap: 6mm; margin: 3mm 0 1mm; font-size: 10.5pt; }
  .eleve-line .f { flex: 1; border-bottom: 1px dotted #94a3b8; padding-bottom: 2px; color: #64748b; }
  .consignes { background: #f1f5f9; border-left: 4px solid ${accent}; border-radius: 4px; padding: 6px 10px; font-size: 10.5pt; margin: 3mm 0 1mm; }

  /* ---------- Exercices ---------- */
  .exo { margin-top: 5mm; }
  .exo-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; page-break-after: avoid; }
  .consignes, .eleve-line, .exo-schema, .consigne { page-break-inside: avoid; }
  .exo-body li, .exo-body p { page-break-inside: avoid; orphans: 3; widows: 3; }
  .exo-title { font-size: 12.5pt; font-weight: 800; color: #0f172a; }
  .exo-pts { font-weight: 700; color: ${accent}; font-size: 11pt; }
  .exo-bareme { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #059669; font-weight: 700; }
  .consigne { font-style: italic; color: #475569; font-size: 10.5pt; margin: 2mm 0; }
  .exo-body { margin-top: 1.5mm; }
  .exo-body ol, .exo-body ul { margin: 1mm 0; padding-left: 7mm; }
  .exo-body li { margin-bottom: 1.2mm; }
  .exo-schema { margin: 2mm 0; text-align: center; page-break-inside: avoid; }
  .exo-schema svg { max-width: 100%; max-height: 70mm; }
  .katex-display { margin: 1.5mm 0; }

  /* ---------- Corrigé ---------- */
  .correction { margin-top: 2.5mm; background: #f0fdf4; border: 1.5px solid #bbf7d0; border-left: 4px solid #059669; border-radius: 6px; padding: 7px 10px; font-size: 10.5pt; }
  .correction-tag { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; font-weight: 800; color: #059669; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2mm; }
  .reponse { color: #047857; font-weight: 700; }
  pre.code { background: #0f172a; color: #e2e8f0; border-radius: 6px; padding: 8px 10px; font-family: 'Consolas', 'Courier New', monospace; font-size: 8.5pt; line-height: 1.45; white-space: pre-wrap; margin: 2mm 0; page-break-inside: avoid; }
  code { font-family: 'Consolas', 'Courier New', monospace; font-size: 90%; background: #f1f5f9; padding: 0 3px; border-radius: 3px; }
  .correction code { background: #d1fae5; }

  /* ---------- Filigrane ---------- */
  .watermark { position: fixed; top: 48%; left: 50%; transform: translate(-50%,-50%) rotate(-28deg); font-family: 'Segoe UI', Arial, sans-serif; font-size: 54pt; font-weight: 800; color: rgba(37,99,235,0.045); white-space: nowrap; pointer-events: none; z-index: 0; }
  .content { position: relative; z-index: 1; }
</style></head><body>
${corrige ? '' : '<div class="watermark">ResumeCI</div>'}
<div class="page">
  <div class="ci-strip"><div class="ci-o"></div><div class="ci-w"></div><div class="ci-g"></div></div>
  <div class="brand">
    <div class="brand-left">${LOGO}
      <div><div class="brand-name">ResumeCI</div><div class="brand-tag">Réviser autrement · resumeci.me</div></div>
    </div>
    <div class="type-badge">
      <div class="type-label">${T.badge} ${corrige ? 'CORRIGÉ — ' : ''}${T.label}</div>
      <div class="type-code">${spec.code}${corrige ? ' · Réservé Pass Élite' : ''}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Matière</div><div class="info-value">${spec.matiere}</div></div>
    <div class="info-cell"><div class="info-label">Classe</div><div class="info-value">${spec.classe}</div></div>
    <div class="info-cell"><div class="info-label">Durée</div><div class="info-value">${spec.duree}</div></div>
    <div class="info-cell"><div class="info-label">Barème</div><div class="info-value">${spec.bareme}</div></div>
    ${spec.chapitre ? `<div class="info-cell" style="flex:1.6"><div class="info-label">Chapitre(s)</div><div class="info-value" style="font-size:9.5pt">${md(spec.chapitre)}</div></div>` : ''}
  </div>
  ${corrige ? '' : `<div class="eleve-line"><div class="f"><strong>Nom &amp; Prénom :</strong></div><div class="f"><strong>Classe :</strong></div><div class="f"><strong>Établissement :</strong></div><div class="f" style="flex:0.7"><strong>Date :</strong></div></div>`}
  ${spec.consignes ? `<div class="consignes"><strong>Consignes :</strong> ${md(spec.consignes)}</div>` : ''}
  <div class="content">${exos}</div>
</div></body></html>`;
}

async function main() {
  const specs = process.argv.slice(2);
  if (!specs.length) { console.error('Usage: node render_interro.js <spec.json> [autres...]'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let browser = null, lastErr = null;
  for (const exe of BROWSERS.filter(fs.existsSync)) {
    try {
      browser = await puppeteer.launch({
        executablePath: exe,
        headless: true,
        userDataDir: path.join(require('os').tmpdir(), 'rc_interro_' + Date.now()),
        args: ['--headless=new', '--no-sandbox', '--allow-file-access-from-files']
      });
      break;
    } catch (e) { lastErr = e; console.error(`Launch ${exe} : ${e.message.slice(0, 120)}`); }
  }
  if (!browser) throw lastErr || new Error('Aucun navigateur Chromium trouvé');
  try {
    for (const specPath of specs) {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const page = await browser.newPage();
      const pdfOpts = (footerLeft) => ({
        format: 'A4', printBackground: true,
        margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;font-size:7.5pt;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0">
          <span><b style="color:#2563eb">ResumeCI</b> · resumeci.me</span>
          <span>${footerLeft}</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      });
      const waitFonts = async () => {
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 8000))]))
          .catch(() => {});
      };
      await page.setContent(pageHtml(spec, false), { waitUntil: 'domcontentloaded' });
      await waitFonts();
      await page.pdf({ ...pdfOpts('Document original ResumeCI'), path: path.join(OUT_DIR, `${spec.code}_enonce.pdf`) });
      const hasCorr = spec.exercices.some(e => e.correction);
      if (hasCorr) {
        await page.setContent(pageHtml(spec, true), { waitUntil: 'domcontentloaded' });
        await waitFonts();
        await page.pdf({ ...pdfOpts('Corrigé · Réservé Pass Élite'), path: path.join(OUT_DIR, `${spec.code}_corrige.pdf`) });
      }
      await page.close();
      console.log(`OK ${spec.code} → _interros/${spec.code}_enonce.pdf${hasCorr ? ' + _corrige.pdf' : ''}`);
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
