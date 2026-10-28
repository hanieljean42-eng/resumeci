// Génère les TD Licence 1 ADA :
//   1) payment-api/exams/RC-L1A-TD-<MAT>-01.json  → spécification exam-v2 jouable
//      (Mode Examen 1 h chrono, correction 100 % automatique : vrai/faux, QCM,
//      réponses numériques — aucune question « papier »).
//   2) tools/interros/specs/RC-L1A-TD-<MAT>-01.json → spec TD pour le PDF
//      (render_interro.js) — les questions paramétrées sont figées avec une
//      graine fixe pour obtenir un énoncé imprimable cohérent avec son corrigé.
//
// Les questions viennent des quiz publiés (issus des fiches) + tools/exams/ada_bank.js
// (questions numériques et affirmations rédigées à partir des fiches de la classe).
// Usage : node tools/exams/build_ada_exams.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const QUIZ_DIR = path.join(ROOT, 'public', 'data', 'quizzes', 'Licence_1_ADA');
const EXAMS_DIR = path.join(ROOT, 'payment-api', 'exams');
const SPECS_DIR = path.join(ROOT, 'tools', 'interros', 'specs');
const { list: MATIERES } = require('./ada_bank');

const DUREE_MIN = 60;
const NOTE_SUR = 20;

// ---------------------------------------------------------------------------
// Utilitaires — replique des fonctions du serveur (server.js) pour figer les
// paramètres dans la version PDF : même RNG, même substitution, même formatage.
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawParams(defs, rng) {
  const out = {};
  for (const [k, d] of Object.entries(defs || {})) {
    if (Array.isArray(d.choices)) out[k] = d.choices[Math.floor(rng() * d.choices.length)];
    else if (typeof d.min === 'number') {
      const step = Number(d.step) || 1;
      const n = Math.floor((Number(d.max) - Number(d.min)) / step);
      out[k] = Number(d.min) + step * Math.floor(rng() * (n + 1));
    }
  }
  return out;
}
function evalExpr(expr, scope) {
  try { return Function(...Object.keys(scope), `"use strict";return (${expr});`)(...Object.values(scope)); }
  catch (e) { return NaN; }
}
function fmtNum(x, decimals) {
  if (typeof x !== 'number' || !isFinite(x)) return String(x);
  let s = decimals != null ? x.toFixed(decimals) : (Math.round(x * 10000) / 10000).toString();
  if (decimals == null && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}
function subst(str, scope) {
  return String(str || '').replace(/\{\{(num|d2|d3|pct)?(?::)?(\w+)\}\}/g, (m, f, k) => {
    const v = scope[k];
    if (v === undefined) return m;
    if (f === 'pct') return fmtNum(Math.round(v * 10000) / 100, null);
    if (f === 'd2') return fmtNum(v, 2);
    if (f === 'd3') return fmtNum(v, 3);
    return fmtNum(v, null);
  });
}
// Échappe le HTML dans les textes venant des quiz (jamais de balise attendue).
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const stripVF = s => cap(String(s || '').replace(/^\s*vrai\s+ou\s+faux\s*[::]\s*/i, ''));

// Méta-questions interdites : on ne demande jamais de compter des éléments DU
// COURS (« combien de masses comporte le bilan présenté dans le cours », dates
// de publication, etc.). Une vraie épreuve évalue des notions, pas la fiche.
const META_RE = /(combien de .{0,80}(dans le cours|la fiche|le cours|le polycopi|présentée?|énuméré?e?s?|retient|distingue|comporte|compte)|présentée?s? dans le cours|selon la fiche|la fiche (énumère|présente|retient)|en quelle année .{0,40}(citée?|présentée?|du cours|la fiche))/i;
let metaDropped = 0;
const isMeta = q => { const bad = META_RE.test(String(q.enonce || q.text || '')); if (bad) metaDropped++; return bad; };

// ---------------------------------------------------------------------------
// 1. Lecture des quiz → questions examen (fidèles aux fiches, déjà publiées)
// ---------------------------------------------------------------------------
function quizQuestions(quizFile) {
  const data = JSON.parse(fs.readFileSync(path.join(QUIZ_DIR, quizFile + '.json'), 'utf8'));
  const vf = [], qcm = [];
  for (const key of Object.keys(data)) {
    const chapitre = data[key].title || key;
    for (const q of data[key].questions || []) {
      if (q.type === 'vrai_faux') {
        const ok = q.answer === 0;
        vf.push({
          type: 'vrai_faux', chapitre,
          enonce: esc(stripVF(q.text)),
          correct: ok,
          corrige: `<strong>${ok ? 'Vrai' : 'Faux'}.</strong> ${esc(q.explanation)}`
        });
      } else if (q.type === 'qcm') {
        qcm.push({
          type: 'qcm', chapitre,
          enonce: esc(q.text),
          choix: (q.options || []).map(esc),
          correct: q.answer,
          corrige: `<strong>Réponse ${'abcd'[q.answer] || 'a'}.</strong> ${esc(q.explanation)}`
        });
      }
    }
  }
  return { vf, qcm };
}

// ---------------------------------------------------------------------------
// 2. Assemblage des deux artefacts par matière
// ---------------------------------------------------------------------------
let report = [];
for (const m of MATIERES) {
  const code = `RC-L1A-TD-${m.code}-01`;
  const pool = quizQuestions(m.quiz);
  const bank = m.bank;

  const vfQs = pool.vf.filter(q => !isMeta(q)).concat(bank.extraVf.map(q => ({
    type: 'vrai_faux', chapitre: q.chapitre, enonce: q.enonce,
    correct: q.correct, corrige: q.corrige
  })));
  const qcmQs = pool.qcm.filter(q => !isMeta(q)).concat(bank.extraQcm.map(q => ({
    type: 'qcm', chapitre: q.chapitre, enonce: q.enonce,
    choix: q.choix, correct: q.correct, corrige: q.corrige
  })));
  const numQs = bank.numeric.filter(q => !isMeta(q)).map(q => ({
    type: 'numeric', chapitre: q.chapitre, enonce: q.enonce,
    answer: q.answer, tol: q.tol, precision: q.precision, corrige: q.corrige
  }));

  const total = vfQs.length + qcmQs.length + numQs.length;
  // Répartition stricte : somme des points = NOTE_SUR (validate_exams contrôle).
  const p = Math.round((NOTE_SUR / total) * 100) / 100;
  const pLast = Math.round((NOTE_SUR - p * (total - 1)) * 100) / 100;
  let idx = 0;
  const withIds = arr => arr.map((q, i) => {
    idx++;
    return { id: `q${idx}`, ...q, points: idx === total ? pLast : p };
  });
  const blocs = [
    { titre: `Partie 1 — Vrai ou Faux (${vfQs.length} affirmations)`, consigne: 'Pour chaque affirmation, appuie sur « Vrai » ou « Faux ».', questions: withIds(vfQs) },
    { titre: `Partie 2 — Questions à choix multiples (${qcmQs.length} questions)`, consigne: 'Une seule bonne réponse par question.', questions: withIds(qcmQs) },
    { titre: `Partie 3 — Réponses numériques (${numQs.length} calculs)`, consigne: 'Entre la valeur numérique exacte (la virgule est acceptée : 0,25 ou 0.25).', questions: withIds(numQs) }
  ];

  // ---- Artefact 1 : spec exam-v2 jouable ----
  const exam = {
    code,
    format: 'exam-v2',
    titre: `TD chronométré — ${m.matiere}`,
    classe: 'Licence_1_ADA',
    classeLabel: 'Licence 1 ADA',
    matiere: m.matiere,
    dureeMin: DUREE_MIN,
    noteSur: NOTE_SUR,
    consignes: "Mode Examen : réponds directement dans l'application avant la fin du chrono. Correction 100 % automatique — vrai/faux, choix multiples et réponses numériques.",
    params: bank.params || {},
    derived: bank.derived || {},
    blocs
  };
  fs.mkdirSync(EXAMS_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXAMS_DIR, `${code}.json`), JSON.stringify(exam, null, 2));

  // ---- Artefact 2 : spec TD pour le PDF (paramètres figés, graine fixe) ----
  const rng = mulberry32(424242);
  const scope = drawParams(bank.params || {}, rng);
  for (const [k, e] of Object.entries(bank.derived || {})) scope[k] = evalExpr(e, scope);
  const S = s => subst(s, scope);

  const ptsOf = arr => Math.round(arr.reduce((t, q) => t + q.points, 0) * 100) / 100;
  const exos = [];
  const ex1 = blocs[0].questions;
  exos.push({
    titre: 'Exercice 1 — Vrai ou Faux',
    points: `${ptsOf(ex1)} pts`.replace('.', ','),
    consigne: 'Pour chaque affirmation, écris V (vrai) ou F (faux).',
    enonce: `<ol>${ex1.map(q => `<li>${S(q.enonce)}</li>`).join('')}</ol>`,
    correction: `<ol>${ex1.map(q => `<li>${S(q.corrige)}</li>`).join('')}</ol>`,
    bareme_detail: `${ex1.length} affirmations — ${fmtNum(ptsOf(ex1))} pts au total`
  });
  const ex2 = blocs[1].questions;
  exos.push({
    titre: 'Exercice 2 — Questions à choix multiples',
    points: `${ptsOf(ex2)} pts`.replace('.', ','),
    consigne: 'Entoure la lettre de la seule réponse exacte.',
    enonce: `<ol>${ex2.map(q => `<li>${S(q.enonce)}<br><span style="color:#475569">${(q.choix || []).map((c, i) => `<strong>${'abcd'[i]})</strong> ${S(c)}`).join(' &nbsp;·&nbsp; ')}</span></li>`).join('')}</ol>`,
    correction: `<ol>${ex2.map(q => `<li>${S(q.corrige)}</li>`).join('')}</ol>`,
    bareme_detail: `${ex2.length} questions — ${fmtNum(ptsOf(ex2))} pts au total`
  });
  const ex3 = blocs[2].questions;
  exos.push({
    titre: 'Exercice 3 — Applications numériques',
    points: `${ptsOf(ex3)} pts`.replace('.', ','),
    consigne: 'Donne la valeur numérique exacte demandée (unité précisée dans la question).',
    enonce: `<ol>${ex3.map(q => `<li>${S(q.enonce)}</li>`).join('')}</ol>`,
    correction: `<ol>${ex3.map(q => `<li>${S(q.corrige)}</li>`).join('')}</ol>`,
    bareme_detail: `${ex3.length} calculs — ${fmtNum(ptsOf(ex3))} pts au total`
  });

  const chapitres = [...new Set(blocs.flatMap(b => b.questions.map(q => q.chapitre).filter(Boolean)))];
  const spec = {
    code,
    type: 'td',
    matiere: m.matiere,
    classe: 'Licence 1 ADA',
    classe_key: 'Licence_1_ADA',
    duree: '1 h',
    bareme: `/20 — ${total} questions auto-corrigées`,
    chapitre: chapitres.join(' · '),
    consignes: `Travaux dirigés — ${total} questions tirées des fiches du cours (vrai/faux, QCM, calculs). Ce sujet se joue aussi en Mode Examen sur resumeci.me : 1 h chrono, correction automatique immédiate.`,
    exercices: exos
  };
  fs.mkdirSync(SPECS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SPECS_DIR, `${code}.json`), JSON.stringify(spec, null, 2));

  report.push({ code, total, vf: ex1.length, qcm: ex2.length, num: ex3.length, pts: ptsOf(ex1) + ptsOf(ex2) + ptsOf(ex3) });
}

console.log('Code'.padEnd(24), 'Total', 'V/F', 'QCM', 'Num', 'Σpts');
for (const r of report) console.log(r.code.padEnd(24), String(r.total).padEnd(5), String(r.vf).padEnd(4), String(r.qcm).padEnd(4), String(r.num).padEnd(4), r.pts);
console.log(`\n✅ ${report.length} matières générées (exam-v2 + spec TD)`);
if (metaDropped) console.log(`⚠️  ${metaDropped} méta-question(s) écartée(s) par le filtre`);
