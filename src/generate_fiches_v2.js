/**
 * Génération de Fiches de Résumé V6
 * Approche: reproduire le COURS fidèlement, en excluant:
 *   - Exercices de fixation / application / renforcement / approfondissement
 *   - Solutions d'exercices / Réponses
 *   - Situations d'évaluation
 *   - Situations d'apprentissage (contextuelles)
 *   - En-têtes/pieds de page PDF
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const COURS_DIR = path.join(__dirname, '..', 'Cours_Terminale');
const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function extractPdfText(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse(new Uint8Array(buffer));
    await parser.load();
    const result = await parser.getText();
    return result.text || result.pages?.map(p => p.text).join('\n') || '';
  } catch (e) { return ''; }
}

// ─── NETTOYAGE ─────────────────────────────────────────────
function cleanText(text) {
  return text
    .replace(/-- \d+ of \d+ --/g, '')
    .replace(/Page \d+ sur \d+/gi, '')
    .replace(/ecole-ci\.(online|org)[^\n]*/gi, '')
    .replace(/Ce document ne peut être vendu[^\n]*/gi, '')
    .replace(/Tout contrevenant s.expose[^\n]*/gi, '')
    .replace(/Résumé de conservation de données/gi, '')
    .replace(/Obtenir l.application mobile/gi, '')
    .replace(/Accueil.*?Tableau de bord/gi, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\t+/g, ' ')
    .replace(/ {3,}/g, '  ');
}

// ─── JOINTURE LIGNES COUPÉES ───────────────────────────────
function joinLines(text) {
  const raw = text.split('\n');
  const joined = [];
  let buf = '';
  for (const r of raw) {
    const line = r.trim();
    if (!line) { if (buf) { joined.push(buf); buf = ''; } continue; }
    const endsPunct = /[.!?:;»"\d)\]}]$/.test(buf);
    const startsLow = /^[a-zà-ü]/.test(line);
    if (buf && !endsPunct && startsLow) {
      buf += ' ' + line;
    } else {
      if (buf) joined.push(buf);
      buf = line;
    }
  }
  if (buf) joined.push(buf);
  return joined;
}

// ─── DÉTECTION: est-ce un début d'exercice? ────────────────
function isExerciseStart(line) {
  const l = line.toLowerCase();
  if (l.match(/^exercice[s]?\s*(de fixation|d.application|de renforcement|d.approfondissement|\d)/)) return true;
  if (l.match(/^situation d.(évaluation|apprentissage)/)) return true;
  if (l.match(/^(corrigé|correction)\b/)) return true;
  if (l.match(/^[ab][\.\-\s]*situation d/)) return true;
  return false;
}

// ─── DÉTECTION: est-ce une ligne d'exercice (instruction)? ─
function isExerciseInstruction(line) {
  const l = line.toLowerCase();
  // Numbered exercise instructions starting with action verbs
  if (l.match(/^\d+[\.\)]\s*(calcul|détermin|vérifie|justifie|déduis|démontr|résou|trouve|montre|cite|entoure|indique|identifie|nomme|écri[st]|donne|soient?|compare|linéaris)/)) return true;
  // Unnumbered instructions
  if (l.match(/^(calcul|détermin|vérifie|justifie|déduis|démontr|résou|trouve|montre que|entoure|parmi les)/i) && l.endsWith('.')) return true;
  return false;
}

// ─── DÉTECTION: est-ce un titre de section majeure? ────────
function isMajorSection(line) {
  if (line.match(/^[IVX]+[\.\)\s\-]+\s*[A-ZÀ-Ü]/) && line.length > 5 && line.length < 200) return true;
  if (line.match(/^[AB][\.\-\s]+(CONTENU|RÉSUMÉ|COURS)/i)) return true;
  return false;
}

function isMinorSection(line) {
  if (line.match(/^\d+[\.\)]\s+[A-ZÀ-Ü]/) && line.length > 8 && line.length < 200 && !line.match(/^\d+\.\d/)) return true;
  return false;
}

// ─── DÉTECTION: est-ce du junk? ────────────────────────────
function isJunk(line) {
  if (line.length <= 2) return true;
  const l = line.toLowerCase();
  if (l.match(/^(niveau|discipline|côte d.ivoire|mon école|durée|code$|numérique$)/)) return true;
  if (l.match(/^(mathématiques|français|anglais|espagnol|allemand|philosophie|histoire|physique|svt|sciences|arts|education)\s+(côte d|école)/i)) return true;
  if (l.match(/(côte d.ivoire|école numérique)/i) && line.length < 80) return true;
  if (l.match(/duree\s*:\s*\d+\s*heure/i)) return true;
  if (l.match(/^\w+\s+côte d/i)) return true;
  if (line.match(/^\d{1,2}$/)) return true;
  return false;
}

// ─── TRAITEMENT PRINCIPAL ──────────────────────────────────
function processLines(lines) {
  const output = [];
  let skipping = false; // true when inside exercise/solution block
  let lessonTitle = '';
  let theme = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Junk → skip
    if (isJunk(line)) continue;

    // Detect theme
    if (line.match(/^(THÈME|THEME|COMPÉTENCE)\s*:?\s*/i) && !theme) {
      theme = line;
      continue;
    }

    // Detect lesson title
    if (line.match(/^(Leçon|LEÇON|LECON)\s*\d/i) && !lessonTitle) {
      lessonTitle = line;
      continue;
    }

    // EXERCISE START → start skipping
    if (isExerciseStart(line)) {
      skipping = true;
      continue;
    }

    // SOLUTION/RÉPONSE → start skipping
    if (lower.match(/^(solution|réponse|correction)\b/)) {
      skipping = true;
      continue;
    }

    // Exercise instruction → skip this line
    if (isExerciseInstruction(line)) {
      skipping = true;
      continue;
    }

    // ONLY major sections (I. II. III.) end a skip block — NOT numbered sub-items
    if (isMajorSection(line)) {
      if (lower.match(/exercice|évaluation|situation d.apprentissage/)) {
        skipping = true;
        continue;
      }
      skipping = false;
    }

    // Concept headers also end skip blocks
    if (lower.match(/^(définition|propriété|théorème|remarque|conséquence|règle|loi|principe|notation|convention|corollaire)/i)) {
      skipping = false;
    }

    // If skipping, skip
    if (skipping) continue;

    // Format the line
    if (isMajorSection(line)) {
      output.push({ type: 'h2', text: line });
    } else if (isMinorSection(line)) {
      output.push({ type: 'h3', text: line });
    } else if (lower.match(/^(définition|propriété\s*\d|théorème|remarque|conséquence|règle|loi|principe|notation|convention|corollaire)/i)) {
      output.push({ type: 'bold', text: line });
    } else if (lower.match(/^(exemple|application)\b/i) && line.length < 100) {
      output.push({ type: 'bold', text: line });
    } else {
      output.push({ type: 'text', text: line });
    }
  }

  return { theme, lessonTitle, content: output };
}

// ─── GÉNÉRATION MARKDOWN ──────────────────────────────────
function generateMarkdown(pdfName, subject, className, data) {
  const lessonName = pdfName.replace('.pdf', '').replace(/_/g, ' ').replace(/\s+/g, ' ');
  const classDisplay = className.replace('_', ' ');

  let md = `# 📝 FICHE DE RÉSUMÉ\n\n---\n\n`;
  md += `| | |\n|:---|:---|\n`;
  md += `| 🏫 **Classe** | **${classDisplay}** |\n`;
  md += `| 📖 **Matière** | **${subject}** |\n`;
  md += `| 📝 **Leçon** | **${lessonName}** |\n\n---\n\n`;

  if (data.theme) md += `### 🎯 ${data.theme}\n\n`;
  if (data.lessonTitle) md += `## 📘 ${data.lessonTitle}\n\n`;

  for (const item of data.content) {
    switch (item.type) {
      case 'h2':
        md += `## ${item.text}\n\n`;
        break;
      case 'h3':
        md += `### ${item.text}\n\n`;
        break;
      case 'bold':
        md += `**${item.text}**\n\n`;
        break;
      case 'text':
        md += `${item.text}\n\n`;
        break;
    }
  }

  md += `---\n\n**powered by Haniel_dev**\n`;
  return md;
}

// ─── MAIN ─────────────────────────────────────────────────
async function main() {
  console.log('📝 Génération des fiches V6...\n');

  if (fs.existsSync(FICHES_DIR)) fs.rmSync(FICHES_DIR, { recursive: true });
  ensureDir(FICHES_DIR);

  let total = 0, errors = 0;
  const classes = fs.readdirSync(COURS_DIR).filter(d => fs.statSync(path.join(COURS_DIR, d)).isDirectory());

  for (const className of classes) {
    const classDir = path.join(COURS_DIR, className);
    const subjects = fs.readdirSync(classDir).filter(d => fs.statSync(path.join(classDir, d)).isDirectory());
    console.log(`📂 ${className} (${subjects.length} matières)`);

    for (const subject of subjects) {
      const subjectDir = path.join(classDir, subject);
      const pdfs = fs.readdirSync(subjectDir).filter(f => f.endsWith('.pdf'));
      const ficheDir = path.join(FICHES_DIR, className, subject);
      ensureDir(ficheDir);
      console.log(`  📚 ${subject} (${pdfs.length})`);

      for (const pdfFile of pdfs) {
        try {
          const rawText = await extractPdfText(path.join(subjectDir, pdfFile));
          if (rawText.length < 50) { errors++; continue; }

          const cleaned = cleanText(rawText);
          const lines = joinLines(cleaned);
          const data = processLines(lines);
          const md = generateMarkdown(pdfFile, subject, className, data);

          const ficheName = 'Fiche_' + pdfFile.replace('.pdf', '.md');
          fs.writeFileSync(path.join(ficheDir, ficheName), md, 'utf8');
          total++;
          if (total % 50 === 0) console.log(`    📊 ${total} fiches...`);
        } catch (e) { errors++; }
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ ${total} fiches | ❌ ${errors} erreurs`);
}

main().catch(e => console.error('Fatal:', e));
