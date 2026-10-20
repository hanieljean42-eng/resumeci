// Vérifie qu'aucun délimiteur $ / $$ brut ne survit après md() dans les specs.
const fs = require('fs');
const path = require('path');
const katex = require('katex');

function md(html) {
  return html
    .replace(/\$\$([^$]+)\$\$/g, (_, t) => katex.renderToString(t.trim(), { displayMode: true, throwOnError: false }))
    .replace(/\$([^$]+)\$/g, (_, t) => katex.renderToString(t.trim(), { displayMode: false, throwOnError: false }));
}

// Champs rendus côté élève (doit refléter render_interro.js)
const FIELDS_EXO = ['titre', 'consigne', 'enonce', 'correction'];
const FIELDS_SPEC = ['consignes', 'chapitre', 'matiere', 'classe', 'duree', 'bareme'];

const dir = path.join(__dirname, 'specs');
let bad = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('exam'))) {
  const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const test = (label, txt) => {
    if (!txt) return;
    const out = md(txt);
    const residual = out.match(/\$+/g);
    // $ résiduel hors annotations KaTeX (les annotations ne contiennent jamais $)
    if (residual) { bad++; console.log(`✗ ${f} :: ${label} → ${residual.length} '$' résiduel(s)`); }
    // Vérifie aussi les commandes TeX qui auraient survécu hors span katex
    const noKatex = out.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, '');
    const rawCmd = noKatex.match(/\\(frac|sqrt|mathrm|dfrac|rightleftharpoons|mathbb|vec|lim|int|sum|theta|alpha|beta|times|pm|cdot|geq|leq|neq|infty|ln|cos|sin|exp|overline|bar|widehat|textstyle|displaystyle|left|right|bigl|quad|;|,)\b/g);
    if (rawCmd) { bad++; console.log(`✗ ${f} :: ${label} → commandes TeX visibles: ${[...new Set(rawCmd)].join(',')}`); }
  };
  FIELDS_SPEC.forEach(k => test(`spec.${k}`, s[k]));
  (s.exercices || []).forEach((ex, i) => FIELDS_EXO.forEach(k => test(`ex${i}.${k}`, ex[k])));
}
console.log(bad === 0 ? '\n✅ AUCUN symbole brut dans toutes les specs rendues' : `\n${bad} problème(s)`);
