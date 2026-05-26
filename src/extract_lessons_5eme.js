/**
 * ═══════════════════════════════════════════════════════════
 * 📚 Extraction des leçons 5ème pour résumés manuels
 * Extrait le texte de chaque PDF et le stocke pour rédaction manuelle
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const COURS_DIR = path.join(__dirname, '..', 'Cours_5eme');
const EXTRACTS_DIR = path.join(__dirname, '..', '_extracts_5eme');
const PENDING_FILE = path.join(__dirname, '..', '_pending_summaries_5eme.json');

// Matières à exclure
const EXCLUDED_SUBJECTS = ['arts plastiques', 'art plastique', 'plastique', 'musique', 'anglais', 'english'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isExcludedSubject(subjectName) {
  const lowerName = subjectName.toLowerCase();
  return EXCLUDED_SUBJECTS.some(excluded => lowerName.includes(excluded));
}

// ─── Extraction de texte PDF ───────────────────────────────
async function extractPdfText(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const arr = new Uint8Array(buffer);
    const parser = new PDFParse(arr);
    await parser.load();
    const result = await parser.getText();
    return result.text || result.pages?.map(p => p.text).join('\n') || '';
  } catch (e) {
    console.error(`  ❌ Erreur extraction: ${e.message}`);
    return '';
  }
}

// ─── Nettoyage du texte ────────────────────────────
function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\t+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/Accueil.*?Tableau de bord/gi, '')
    .replace(/Résumé de conservation de données/gi, '')
    .replace(/Obtenir l.application mobile/gi, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .trim();
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log('📚 Extraction des leçons 5ème pour résumés manuels...\n');
  
  if (!fs.existsSync(COURS_DIR)) {
    console.log('❌ Dossier Cours_5eme introuvable. Exécutez d\'abord: npm run scrape:5eme');
    return;
  }
  
  ensureDir(EXTRACTS_DIR);
  
  const pendingSummaries = [];
  let totalLessons = 0;
  let extractedCount = 0;

  // Parcourir les matières
  const subjects = fs.readdirSync(COURS_DIR).filter(d => {
    const fullPath = path.join(COURS_DIR, d);
    if (!fs.statSync(fullPath).isDirectory()) return false;
    if (isExcludedSubject(d)) {
      console.log(`🚫 Matière exclue: ${d}`);
      return false;
    }
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
      if (isExcludedSubject(pdfFile)) {
        console.log(`  🚫 Exclu: ${pdfFile}`);
        continue;
      }
      
      const pdfPath = path.join(subjectDir, pdfFile);
      const lessonName = pdfFile.replace('.pdf', '');
      const extractPath = path.join(extractSubjectDir, `${lessonName}.txt`);
      
      totalLessons++;

      try {
        // Extraire le texte
        const rawText = await extractPdfText(pdfPath);
        if (rawText.length < 50) {
          console.log(`    ⚠️ ${pdfFile}: texte trop court`);
          continue;
        }

        const cleanedText = cleanText(rawText);
        
        // Sauvegarder le texte extrait
        const extractContent = `═══════════════════════════════════════════════════════════
LEÇON: ${lessonName}
MATIÈRE: ${subject}
CLASSE: 5ème
SOURCE: ${pdfFile}
═══════════════════════════════════════════════════════════

${cleanedText}

═══════════════════════════════════════════════════════════
FIN DE LA LEÇON
═══════════════════════════════════════════════════════════`;

        fs.writeFileSync(extractPath, extractContent, 'utf8');
        extractedCount++;
        
        // Ajouter à la liste des résumés en attente
        pendingSummaries.push({
          subject,
          lessonName,
          pdfFile,
          extractPath,
          status: 'pending',
          extractedAt: new Date().toISOString()
        });

        console.log(`    ✅ Extrait: ${lessonName}`);
      } catch (e) {
        console.log(`    ❌ ${pdfFile}: ${e.message}`);
      }
    }
  }

  // Sauvegarder la liste des résumés en attente
  fs.writeFileSync(PENDING_FILE, JSON.stringify({
    totalLessons,
    extractedCount,
    pending: pendingSummaries,
    createdAt: new Date().toISOString()
  }, null, 2), 'utf8');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 EXTRACTION TERMINÉE');
  console.log('═'.repeat(60));
  console.log(`📚 Total leçons: ${totalLessons}`);
  console.log(`✅ Extraites: ${extractedCount}`);
  console.log(`📁 Textes extraits dans: ${EXTRACTS_DIR}`);
  console.log(`📋 Liste en attente: ${PENDING_FILE}`);
  console.log(`\n💡 Prochaine étape: Lisez chaque fichier .txt dans _extracts_5eme/`);
  console.log(`   et rédigez les résumés manuellement.`);
}

main().catch(e => console.error('Fatal:', e));
