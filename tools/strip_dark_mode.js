// Supprime le mode sombre : règles .dark-mode, [data-theme="dark"], variantes.
// Préserve : paper-mode, thèmes d'accent [data-theme=blue|green|...].
const fs = require('fs');
const path = require('path');

const DARK_SEL = /\.dark-mode|\[data-theme\s*=\s*["']?dark["']?\s*\]/;

function stripDarkCss(css) {
  // Supprime les blocs @media (prefers-color-scheme: dark) complets (accolades équilibrées)
  let out = '';
  let i = 0;
  const mediaRe = /@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{/g;
  let m;
  let last = 0;
  while ((m = mediaRe.exec(css)) !== null) {
    out += css.slice(last, m.index);
    let depth = 1, j = mediaRe.lastIndex;
    while (j < css.length && depth > 0) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    last = j; mediaRe.lastIndex = j;
  }
  out += css.slice(last);
  // Chirurgie par règle : retire les sélecteurs sombres des listes mixtes,
  // supprime la règle entière si tous ses sélecteurs sont sombres.
  return out.replace(/([^{}@]+)\{([^{}]*)\}/g, (rule, sel, body) => {
    const parts = sel.split(',').map(s => s.trim()).filter(Boolean);
    const kept = parts.filter(s => !DARK_SEL.test(s));
    if (kept.length === parts.length) return rule;
    if (kept.length === 0) return '';
    return kept.join(', ') + ' {' + body + '}';
  });
}

function stripHtml(html) {
  return html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (m, a, inner, b) => a + stripDarkCss(inner) + b);
}

const ROOT = path.join(__dirname, '..');
const files = process.argv.slice(2);
let total = 0;
for (const rel of files) {
  const p = path.join(ROOT, rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = rel.endsWith('.html') ? stripHtml(before) : stripDarkCss(before);
  fs.writeFileSync(p, after);
  const n = (before.match(/dark-mode|data-theme\s*=\s*["']?dark/g) || []).length;
  const n2 = (after.match(/dark-mode|data-theme\s*=\s*["']?dark/g) || []).length;
  console.log(`${rel}: ${n} motifs sombres -> ${n2} restants`);
  total += n - n2;
}
console.log(`TOTAL retirés: ${total}`);
