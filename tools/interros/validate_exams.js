const fs = require('fs');
const path = require('path');
const DIR = 'payment-api/exams';
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function drawParams(defs, rng) { const o = {}; for (const [k, d] of Object.entries(defs || {})) { if (Array.isArray(d.choices)) o[k] = d.choices[Math.floor(rng() * d.choices.length)]; else if (typeof d.min === 'number') { const st = d.step || 1; const n = Math.floor((d.max - d.min) / st); o[k] = d.min + st * Math.floor(rng() * (n + 1)); } } return o; }
function evalE(expr, scope) { try { return Function(...Object.keys(scope), `"use strict";return (${expr});`)(...Object.values(scope)); } catch (e) { return 'ERR:' + e.message; } }
function subst(str, scope) { return String(str || '').replace(/\{\{(num|d2|d3|pct)?(?::)?(\w+)\}\}/g, (m, f, k) => scope[k] === undefined ? '⟪MISSING:' + k + '⟫' : String(scope[k])); }
let fail = 0;
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const spec = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  console.log('\n=== ' + f + ' ===');
  // tester 3 graines
  for (let seed = 1; seed <= 3; seed++) {
    const rng = mulberry32(seed * 99991);
    const scope = drawParams(spec.params, rng);
    for (const [k, e] of Object.entries(spec.derived || {})) { scope[k] = evalE(e, scope); if (typeof scope[k] === 'string' && scope[k].startsWith('ERR')) { fail++; console.log('  derived ' + k + ' → ' + scope[k]); } if (typeof scope[k] === 'number' && !isFinite(scope[k])) { fail++; console.log('  derived ' + k + ' non fini'); } }
    let pts = 0;
    for (const b of spec.blocs || []) for (const q of b.questions || []) {
      pts += q.points || 0;
      for (const field of ['enonce', 'corrige', 'corrigeVrai', 'corrigeFaux', 'consigne']) {
        const s = subst(q[field] || '', scope); if (s.includes('MISSING')) { fail++; console.log(`  ${q.id}.${field}: ${s.match(/⟪MISSING:\w+⟫/g).join(',')}`); }
      }
      (q.choix || []).forEach((c, i) => { const s = subst(c, scope); if (s.includes('MISSING')) { fail++; console.log(`  ${q.id}.choix[${i}] MISSING`); } });
      (q.steps || []).forEach((st, i) => { ['titre', 'texte'].forEach(fld => { const s = subst(st[fld], scope); if (s.includes('MISSING')) { fail++; console.log(`  ${q.id}.steps[${i}].${fld} MISSING`); } }); });
      if (q.type === 'numeric') { const v = evalE(q.answer, scope); if (typeof v !== 'number' || !isFinite(v)) { fail++; console.log(`  ${q.id}.answer → ${v}`); } }
      if (q.type === 'vrai_faux' && q.correctExpr !== undefined) { const v = evalE(q.correctExpr, scope); if (typeof v !== 'boolean') { fail++; console.log(`  ${q.id}.correctExpr → ${v}`); } }
      if (q.type === 'qcm' && (q.correct < 0 || q.correct >= (q.choix || []).length)) { fail++; console.log(`  ${q.id}.correct hors bornes`); }
    }
    if (seed === 1) { console.log('  total points: ' + pts + ' / ' + spec.noteSur + (Math.abs(pts - spec.noteSur) > 0.01 ? '  ⚠ DIFFÉRENT' : '  ✓')); }
  }
}
console.log(fail === 0 ? '\n✅ Toutes les specs exam valides (3 graines chacune)' : `\n${fail} problème(s)`);
