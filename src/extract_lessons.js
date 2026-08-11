/**
 * ═══════════════════════════════════════════════════════════
 * 📚 Extraction des leçons pour résumés — Multi-niveaux
 * Usage: node src/extract_lessons.js <classe>
 * Exemples: node src/extract_lessons.js 6eme
 *           node src/extract_lessons.js 3eme
 *           node src/extract_lessons.js Seconde_A
 *           node src/extract_lessons.js Seconde_C
 *           node src/extract_lessons.js Seconde_A_Math
 *           node src/extract_lessons.js Seconde_C_Math
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const CLASSE = process.argv[2];
if (!CLASSE) {
  console.log('❌ Usage: node src/extract_lessons.js <classe>');
  console.log('   Classes: 6eme, 3eme, Seconde_A, Seconde_C, Premiere_D, Seconde_A_Math, Seconde_C_Math');
  process.exit(1);
}

const COURS_DIR_MAP = {
  '6eme': path.join(__dirname, '..', 'Cours_6eme'),
  '3eme': path.join(__dirname, '..', 'Cours_3eme'),
  'Seconde_A': path.join(__dirname, '..', 'Cours_Seconde_A'),
  'Seconde_C': path.join(__dirname, '..', 'Cours_Seconde_C'),
  'Premiere_D': path.join(__dirname, '..', 'Cours_Premiere_D'),
  // Nouvelles variantes pour le scraper dédié mathématiques Seconde
  'Seconde_A_Math': path.join(__dirname, '..', 'Cours_Seconde_Math', 'Seconde_A'),
  'Seconde_C_Math': path.join(__dirname, '..', 'Cours_Seconde_Math', 'Seconde_C'),
};

const COURS_DIR = COURS_DIR_MAP[CLASSE];
if (!COURS_DIR) {
  console.log(`❌ Classe inconnue: ${CLASSE}`);
  process.exit(1);
}

const EXTRACTS_DIR = path.join(__dirname, '..', `_extracts_${CLASSE}`);
const PENDING_FILE = path.join(__dirname, '..', `_pending_summaries_${CLASSE}.json`);

const EXCLUDED_SUBJECTS = ['arts plastiques', 'art plastique', 'plastique', 'musique'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isExcludedSubject(name) {
  return EXCLUDED_SUBJECTS.some(ex => name.toLowerCase().includes(ex));
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

async function extractPdfText(filePath) {
  try {
    const { PDFParse } = require('pdf-parse');
    const buffer = new Uint8Array(fs.readFileSync(filePath));
    const parser = new PDFParse(buffer, { verbosity: 0 });
    const result = await parser.getText();
    return result.pages.map(p => p.text).join('\n\n');
  } catch (e) {
    console.error(`  ❌ Erreur extraction: ${e.message}`);
    return '';
  }
}

async function main() {
  console.log(`📚 Extraction des leçons ${CLASSE} pour résumés manuels...\n`);

  if (!fs.existsSync(COURS_DIR)) {
    console.log(`❌ Dossier ${COURS_DIR} introuvable.`);
    console.log(`   Exécutez d'abord: node src/scraper_${CLASSE.toLowerCase().replace('_', '')}.js`);
    return;
  }

  ensureDir(EXTRACTS_DIR);
  const pendingSummaries = [];
  let totalLessons = 0;
  let extractedCount = 0;

  const subjects = fs.readdirSync(COURS_DIR).filter(d => {
    const fullPath = path.join(COURS_DIR, d);
    if (!fs.statSync(fullPath).isDirectory()) return false;
    if (isExcludedSubject(d)) { console.log(`🚫 Matière exclue: ${d}`); return false; }
    return true;
  });

  console.log(`📂 ${subjects.length} matières trouvées\n`);

  for (const subject of subjects) {
    const subjectDir = path.join(COURS_DIR, subject);
    const pdfs = fs.readdirSync(subjectDir).filter(f => f.endsWith('.pdf'));
    const extractSubjectDir = path.join(EXTRACTS_DIR, subject);
    ensureDir(extractSubjectDir);
    console.log(`\n📚 ${subject} (${pdfs.length} leçons)`);

    for (const pdfFile of pdfs) {
      if (isExcludedSubject(pdfFile)) continue;
      const lessonName = pdfFile.replace('.pdf', '');
      const extractPath = path.join(extractSubjectDir, `${lessonName}.txt`);
      totalLessons++;

      try {
        const rawText = await extractPdfText(path.join(subjectDir, pdfFile));
        if (rawText.length < 50) { console.log(`    ⚠️ ${pdfFile}: texte trop court`); continue; }

        const cleanedText = cleanText(rawText);
        const extractContent = `═══════════════════════════════════════════════════════════
LEÇON: ${lessonName}
MATIÈRE: ${subject}
CLASSE: ${CLASSE}
SOURCE: ${pdfFile}
═══════════════════════════════════════════════════════════

${cleanedText}

═══════════════════════════════════════════════════════════
FIN DE LA LEÇON
═══════════════════════════════════════════════════════════`;

        fs.writeFileSync(extractPath, extractContent, 'utf8');
        extractedCount++;
        pendingSummaries.push({ subject, lessonName, pdfFile, extractPath, status: 'pending', extractedAt: new Date().toISOString() });
        console.log(`    ✅ Extrait: ${lessonName}`);
      } catch (e) {
        console.log(`    ❌ ${pdfFile}: ${e.message}`);
      }
    }
  }

  fs.writeFileSync(PENDING_FILE, JSON.stringify({ classe: CLASSE, totalLessons, extractedCount, pending: pendingSummaries, createdAt: new Date().toISOString() }, null, 2), 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 EXTRACTION ${CLASSE} TERMINÉE`);
  console.log('═'.repeat(60));
  console.log(`📚 Total: ${totalLessons} | ✅ Extraites: ${extractedCount}`);
  console.log(`📁 Textes: ${EXTRACTS_DIR}`);
  console.log(`📋 Liste: ${PENDING_FILE}`);
}

main().catch(e => console.error('Fatal:', e));
