/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Génération de Fiches de Résumé — Multi-niveaux
 * Pour chaque leçon PDF → extrait le texte → crée une fiche HTML
 * Usage: node src/generate_fiches_multi.js <classe>
 * Exemples: node src/generate_fiches_multi.js 6eme
 *           node src/generate_fiches_multi.js 3eme
 *           node src/generate_fiches_multi.js Seconde_A
 *           node src/generate_fiches_multi.js Seconde_C
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const CLASSE = process.argv[2];
if (!CLASSE) {
  console.log('❌ Usage: node src/generate_fiches_multi.js <classe>');
  console.log('   Classes: 6eme, 3eme, Seconde_A, Seconde_C, Premiere_D');
  process.exit(1);
}

const COURS_DIR_MAP = {
  '6eme': path.join(__dirname, '..', 'Cours_6eme'),
  '3eme': path.join(__dirname, '..', 'Cours_3eme'),
  'Seconde_A': path.join(__dirname, '..', 'Cours_Seconde_A'),
  'Seconde_C': path.join(__dirname, '..', 'Cours_Seconde_C'),
  'Premiere_D': path.join(__dirname, '..', 'Cours_Premiere_D'),
};

const COURS_DIR = COURS_DIR_MAP[CLASSE];
if (!COURS_DIR) { console.log(`❌ Classe inconnue: ${CLASSE}`); process.exit(1); }

const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', CLASSE);

const EXCLUDED_SUBJECTS = ['arts plastiques', 'art plastique', 'plastique', 'musique'];

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function isExcludedSubject(name) {
  return EXCLUDED_SUBJECTS.some(ex => name.toLowerCase().includes(ex));
}

async function extractPdfText(filePath) {
  try {
    const { PDFParse } = require('pdf-parse');
    const buffer = new Uint8Array(fs.readFileSync(filePath));
    const parser = new PDFParse(buffer, { verbosity: 0 });
    const result = await parser.getText();
    return result.pages.map(p => p.text).join('\n\n');
  } catch (e) {
    return '';
  }
}

function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .replace(/\t+/g, ' ').replace(/ {2,}/g, ' ')
    .replace(/Accueil.*?Tableau de bord/gi, '')
    .replace(/Résumé de conservation de données/gi, '')
    .replace(/Obtenir l.application mobile/gi, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .trim();
}

function extractKeyContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result = { title: '', introduction: '', definitions: [], mainPoints: [], examples: [], conclusion: '', keyTerms: [] };

  for (const line of lines) {
    if (line.length > 10 && line.length < 200 && !line.match(/^(page|cours|accueil|tableau)/i)) {
      result.title = line; break;
    }
  }

  const defPatterns = /(?:est |signifie |désigne |se définit |c'est |on appelle |on entend par )/i;
  for (const line of lines) {
    if (defPatterns.test(line) && line.length > 30 && line.length < 500) result.definitions.push(line);
  }

  const pointPattern = /^(?:\d+[\.\)\-]|[a-z][\.\)]|[•●▪►\-–]\s*|[IVX]+[\.\)])/;
  for (const line of lines) {
    if (pointPattern.test(line) && line.length > 15) result.mainPoints.push(line);
  }

  for (const line of lines) {
    if (/(?:exemple|ex\s*:|par exemple)/i.test(line) && line.length > 20) result.examples.push(line);
  }

  const terms = new Set();
  for (const line of lines) {
    const capsMatch = line.match(/\b[A-ZÀ-Ü]{3,}(?:\s+[A-ZÀ-Ü]{3,}){0,5}\b/g);
    if (capsMatch) for (const m of capsMatch) {
      if (m.length > 4 && m.length < 60 && !m.match(/^(LEÇON|COURS|PAGE|THEME|CHAPITRE|RESUME|PDF|FICHE)/)) terms.add(m);
    }
  }
  result.keyTerms = [...terms].slice(0, 20);

  const titleIdx = lines.indexOf(result.title);
  if (titleIdx >= 0) {
    const afterTitle = lines.slice(titleIdx + 1);
    const introParagraph = [];
    for (const line of afterTitle) {
      if (line.length > 20) { introParagraph.push(line); if (introParagraph.join(' ').length > 300) break; }
      if (introParagraph.length > 0 && line.length < 5) break;
    }
    result.introduction = introParagraph.join(' ').substring(0, 500);
  }

  const lastLines = lines.slice(-15).reverse();
  const conclParagraph = [];
  for (const line of lastLines) {
    if (line.length > 20 && !line.match(/^(page|©|copyright|source)/i)) {
      conclParagraph.unshift(line);
      if (conclParagraph.join(' ').length > 300) break;
    }
  }
  result.conclusion = conclParagraph.join(' ').substring(0, 400);

  return result;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSubjectIcon(subject) {
  const s = String(subject).toLowerCase();
  if (s.includes('math')) return '📐';
  if (s.includes('physique') || s.includes('chimie')) return '⚡';
  if (s.includes('svt') || s.includes('science de la vie')) return '🌱';
  if (s.includes('fran')) return '📖';
  if (s.includes('histoire') || s.includes('géographie') || s.includes('geographie')) return '🌍';
  if (s.includes('tic') || s.includes('informatique')) return '💻';
  return '📖';
}

function generateFicheHTML(pdfName, subject, content, fullText) {
  const lessonName = pdfName.replace('.pdf', '');
  const classeDisplay = CLASSE.replace('_', ' ');
  const subjectIcon = getSubjectIcon(subject);

  let sections = '';

  // I. Introduction
  if (content.introduction) {
    sections += `<h2>I. Introduction</h2>\n<p>${escapeHtml(content.introduction)}</p>\n`;
  }

  // II. Définitions clés
  if (content.definitions.length > 0) {
    sections += `<h2>${content.introduction ? 'II' : 'I'}. Définitions clés</h2>\n`;
    const uniqueDefs = [...new Set(content.definitions)].slice(0, 10);
    for (const def of uniqueDefs) {
      sections += `<div class="definition"><p>${escapeHtml(def)}</p></div>\n`;
    }
  }

  // III. Points essentiels
  if (content.mainPoints.length > 0) {
    const num = (content.introduction ? 2 : 1) + (content.definitions.length > 0 ? 1 : 0) + 1;
    const roman = ['I','II','III','IV','V','VI','VII'][num - 1] || num;
    sections += `<h2>${roman}. Points essentiels</h2>\n<div class="important"><ul>\n`;
    const uniquePoints = [...new Set(content.mainPoints)].slice(0, 25);
    for (const point of uniquePoints) {
      sections += `<li>${escapeHtml(point)}</li>\n`;
    }
    sections += `</ul></div>\n`;
  }

  // Exemples
  if (content.examples.length > 0) {
    sections += `<h2>Exemples</h2>\n<div class="schema"><ul>\n`;
    for (const ex of [...new Set(content.examples)].slice(0, 8)) {
      sections += `<li>${escapeHtml(ex)}</li>\n`;
    }
    sections += `</ul></div>\n`;
  }

  // Résumé du contenu
  const sentences = fullText.replace(/\n+/g, ' ').split(/[.!?]+/)
    .map(s => s.trim()).filter(s => s.length > 40 && s.length < 300);
  if (sentences.length > 5) {
    sections += `<h2>Résumé du contenu</h2>\n<div class="important">\n`;
    const step = Math.max(1, Math.floor(sentences.length / 15));
    const selected = [];
    for (let i = 0; i < sentences.length && selected.length < 15; i += step) selected.push(sentences[i]);
    for (const s of selected) { sections += `<p>${escapeHtml(s)}.</p>\n`; }
    sections += `</div>\n`;
  }

  // Conclusion
  if (content.conclusion) {
    sections += `<h2>Conclusion</h2>\n<p>${escapeHtml(content.conclusion)}</p>\n`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fiche ${escapeHtml(lessonName)} — ${escapeHtml(subject)} ${escapeHtml(classeDisplay)} | ResumeCI</title>
<meta name="description" content="Fiche de résumé: ${escapeHtml(lessonName)} en ${escapeHtml(subject)} pour la classe de ${escapeHtml(classeDisplay)}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.7;margin:0;padding:40px;font-size:14px}
.container{max-width:900px;margin:auto;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.08)}
.header{text-align:center;border-bottom:3px solid #16a34a;padding-bottom:20px;margin-bottom:30px}
.header h1{color:#16a34a;font-size:22px}
.meta{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:8px;color:#64748b;font-size:13px}
.meta span{background:#f1f5f9;padding:4px 12px;border-radius:20px}
h2{font-size:17px;margin:28px 0 12px;padding:10px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0}
h3{font-size:15px;margin:18px 0 8px}
.definition{background:#ecfdf5;border-left:4px solid #22c55e;padding:14px 18px;border-radius:0 8px 8px 0;margin:12px 0}
.important{background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0}
.schema{background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 18px;border-radius:0 8px 8px 0;margin:10px 0;font-weight:700;color:#92400e}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13px}
th,td{border:1px solid #e2e8f0;padding:10px;text-align:left}
th{background:#f8fafc}
ul,ol{margin:8px 0 12px 22px}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>📝 FICHE DE RÉSUMÉ</h1>
<div class="meta">
<span>🏫 ${escapeHtml(classeDisplay)}</span>
<span>${subjectIcon} ${escapeHtml(subject)}</span>
<span>${escapeHtml(lessonName)}</span>
</div>
</div>
${sections}
</div>
</body>
</html>`;
}

async function main() {
  console.log(`📝 Génération des fiches de résumé pour ${CLASSE}...\n`);

  if (!fs.existsSync(COURS_DIR)) {
    console.log(`❌ Dossier ${COURS_DIR} introuvable. Lancez d'abord le scraper.`);
    return;
  }

  let totalFiches = 0;
  let errors = 0;

  const subjects = fs.readdirSync(COURS_DIR).filter(d => {
    if (!fs.statSync(path.join(COURS_DIR, d)).isDirectory()) return false;
    if (isExcludedSubject(d)) { console.log(`🚫 Exclue: ${d}`); return false; }
    return true;
  });

  console.log(`📂 ${subjects.length} matières trouvées\n`);

  for (const subject of subjects) {
    const subjectDir = path.join(COURS_DIR, subject);
    const pdfs = fs.readdirSync(subjectDir).filter(f => f.endsWith('.pdf'));
    const ficheSubjectDir = path.join(FICHES_DIR, subject);
    ensureDir(ficheSubjectDir);
    console.log(`\n📚 ${subject} (${pdfs.length} leçons)`);

    for (const pdfFile of pdfs) {
      if (isExcludedSubject(pdfFile)) continue;
      const ficheName = 'Fiche_' + pdfFile.replace('.pdf', '.html');
      const fichePath = path.join(ficheSubjectDir, ficheName);

      try {
        const rawText = await extractPdfText(path.join(subjectDir, pdfFile));
        if (rawText.length < 50) { console.log(`    ⚠️ ${pdfFile}: texte trop court`); errors++; continue; }

        const cleanedText = cleanText(rawText);
        const content = extractKeyContent(cleanedText);
        const html = generateFicheHTML(pdfFile, subject, content, cleanedText);

        fs.writeFileSync(fichePath, html, 'utf8');
        totalFiches++;
        console.log(`    ✅ ${ficheName}`);
      } catch (e) {
        console.log(`    ❌ ${pdfFile}: ${e.message}`);
        errors++;
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RÉSULTAT FINAL — ${CLASSE}`);
  console.log('═'.repeat(60));
  console.log(`✅ Fiches: ${totalFiches} | ❌ Erreurs: ${errors}`);
  console.log(`📁 Dossier: ${FICHES_DIR}`);
}

main().catch(e => console.error('Fatal:', e));
