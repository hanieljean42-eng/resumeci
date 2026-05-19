/**
 * ═══════════════════════════════════════════════════════════
 * 📂 Organiser les PDFs - Terminale A et D uniquement
 * Structure: Cours_Terminale/Terminale_A/Matière/leçon.pdf
 *            Cours_Terminale/Terminale_D/Matière/leçon.pdf
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PDF_DIR = path.join(__dirname, '..', 'pdfs');
const OUTPUT_DIR = path.join(__dirname, '..', 'Cours_Terminale');

// Load data
const coursIndex = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cours_index.json'), 'utf8'));
const categoryMap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'course_category_map.json'), 'utf8'));

function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120);
}

// Try to find PDF with fuzzy matching (handles double spaces, etc)
function findPdf(fileName) {
  const srcPath = path.join(PDF_DIR, fileName);
  if (fs.existsSync(srcPath)) return srcPath;
  
  // Try normalized comparison
  const normalized = fileName.replace(/\s+/g, ' ').trim();
  const allPdfs = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
  for (const pdf of allPdfs) {
    if (pdf.replace(/\s+/g, ' ').trim() === normalized) {
      return path.join(PDF_DIR, pdf);
    }
    // Also try without special chars
    if (pdf.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === fileName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()) {
      return path.join(PDF_DIR, pdf);
    }
  }
  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Extract course ID from source URL
function getCourseId(sourceUrl) {
  const match = sourceUrl.match(/[?&]id=(\d+)/);
  return match ? match[1] : null;
}

// Clean output dir
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true });
}
ensureDir(OUTPUT_DIR);

console.log('📋 Données chargées:');
console.log(`  - ${coursIndex.length} ressources dans cours_index.json`);
console.log(`  - ${Object.keys(categoryMap).length} cours dans category_map`);
console.log(`  - ${fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf')).length} PDFs téléchargés`);

// Match each cours_index entry with its category
let organized = 0;
let notFound = 0;
let noPdf = 0;
const summary = {};

for (const entry of coursIndex) {
  // Get course ID from source URL
  const courseId = getCourseId(entry.source);
  if (!courseId) continue;

  // Look up category
  const catInfo = categoryMap[courseId];
  if (!catInfo) continue; // Not Terminale A or D

  const className = catInfo.class === 'Tle_A' ? 'Terminale_A' : 'Terminale_D';
  const subject = catInfo.subject;
  const courseName = entry.course || catInfo.course;

  // Build destination path
  const subjectDir = path.join(OUTPUT_DIR, className, sanitize(subject));
  ensureDir(subjectDir);

  // Find the PDF file
  const fileName = sanitize(courseName) + '.pdf';
  const srcPath = findPdf(fileName);
  const destPath = path.join(subjectDir, fileName);

  if (srcPath) {
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      organized++;
    }
    // Track for summary
    const key = `${className} > ${subject}`;
    if (!summary[key]) summary[key] = [];
    if (!summary[key].includes(fileName)) summary[key].push(fileName);
  } else {
    noPdf++;
  }
}

// Print summary
console.log(`\n${'═'.repeat(60)}`);
console.log('📊 RÉSULTAT');
console.log('═'.repeat(60));
console.log(`✅ PDFs organisés: ${organized}`);
console.log(`❌ PDFs non trouvés: ${noPdf}`);

console.log(`\n📂 Structure:`);
for (const [key, files] of Object.entries(summary).sort()) {
  console.log(`  ${key}: ${files.length} leçon(s)`);
}

// Show what's in the output directory
console.log(`\n📁 Dossier: ${OUTPUT_DIR}`);
function showTree(dir, indent = '') {
  const items = fs.readdirSync(dir).sort();
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const count = fs.readdirSync(fullPath).filter(f => f.endsWith('.pdf')).length;
      const subDirs = fs.readdirSync(fullPath).filter(f => fs.statSync(path.join(fullPath, f)).isDirectory());
      if (subDirs.length > 0) {
        console.log(`${indent}📂 ${item}/`);
        showTree(fullPath, indent + '  ');
      } else {
        console.log(`${indent}📚 ${item}/ (${count} PDFs)`);
      }
    }
  }
}
showTree(OUTPUT_DIR);

// List missing PDFs that we should have
console.log(`\n⚠️ PDFs manquants (dans la catégorie mais pas téléchargés):`);
let missingCount = 0;
for (const entry of coursIndex) {
  const courseId = getCourseId(entry.source);
  if (!courseId) continue;
  const catInfo = categoryMap[courseId];
  if (!catInfo) continue;
  const fileName = sanitize(entry.course || catInfo.course) + '.pdf';
  const srcPath = findPdf(fileName);
  if (!srcPath && missingCount < 20) {
    console.log(`  - [${catInfo.class}/${catInfo.subject}] ${entry.course}`);
    missingCount++;
  }
}
if (missingCount >= 20) console.log('  ... et plus');
