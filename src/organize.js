/**
 * ═══════════════════════════════════════════════════════════
 * 📂 Organiser les PDFs par Classe > Matière > Leçon
 * Terminale A, Terminale D et Terminale C (Math & Physique-Chimie)
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PDF_DIR = path.join(__dirname, '..', 'pdfs');
const OUTPUT_DIR = path.join(__dirname, '..', 'Cours_Terminale');

const coursIndex = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cours_index.json'), 'utf8'));

// List actual PDF files we have
const pdfFiles = fs.readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));
console.log(`📁 ${pdfFiles.length} PDFs dans le dossier pdfs/`);
console.log(`📋 ${coursIndex.length} entrées dans cours_index.json`);

// Classify courses by class level based on course name patterns
function classifyLevel(course) {
  const c = course.toLowerCase();
  // Terminale D patterns
  if (c.includes('td_') || c.includes('tle d') || c.includes('terminale d') || 
      c.includes('_td ') || c.includes(' td ') || c.includes('tle_d')) return 'Tle_D';
  // Terminale A patterns  
  if (c.includes('ta_') || c.includes('tle a') || c.includes('terminale a') || 
      c.includes('_ta ') || c.includes(' ta ') || c.includes('tlea') || c.includes('tle_a')) return 'Tle_A';
  // Terminale C patterns
  if (c.includes('tc_') || c.includes('tle c') || c.includes('terminale c') || 
      c.includes('_tc ') || c.includes('tle_c') || c.includes('1c ') || c.includes('_1c_')) return 'Tle_C';
  // Terminale shared (Tle without A/C/D = shared between all Tle)
  if (c.includes('tle_') || c.includes('tle ')) return 'Tle_SHARED';
  // Première patterns
  if (c.includes('1ère') || c.includes('1ere') || c.includes('_1a ') || c.includes('_1d ') || 
      c.includes('1a_') || c.includes('1d_') || c.includes('1c_') || c.includes('maths_1')) return null;
  // Seconde patterns
  if (c.includes('2nde') || c.includes('2nd') || c.includes('2de') || c.includes('_2a') || 
      c.includes('_2c') || c.includes('2a ') || c.includes('2c ') || c.includes('math_2') || c.includes('maths_2')) return null;
  
  // Check for specific Terminale subjects
  if (c.includes('philosophie') || c.includes('philo')) return 'Tle_SHARED';
  
  return 'UNKNOWN';
}

// Identify subject/matière from course name
function classifySubject(course) {
  const c = course.toLowerCase();
  if (c.includes('svt') || c.includes('biologie')) return 'SVT';
  if (c.includes('math') || c.includes('maths') || c.includes('mathématique') || c.includes('mathematique')) return 'Mathematiques';
  if (c.includes('physi') || c.includes('chimie') || c.includes('alcool') || c.includes('alcane') || 
      c.includes('alcène') || c.includes('acide') || c.includes('oscillat') || c.includes('cinémat') || 
      c.includes('induction') || c.includes('laplace') || c.includes('champ magn') ||
      c.includes('dipôle') || c.includes('courant') || c.includes('résonance') || c.includes('nucléaire') ||
      c.includes('ondulatoire') || c.includes('corpusculaire') || c.includes('dérivateur') || c.includes('intégrateur')) return 'Physique_Chimie';
  if (c.includes('histoire') || c.includes('h1:') || c.includes('h2:') || c.includes('h3:')) return 'Histoire';
  if (c.includes('geographie') || c.includes('géographie') || c.includes('g1:') || c.includes('g2:') || c.includes('g3:')) return 'Geographie';
  if (c.includes('anglais') || c.includes('unit ') || c.includes('english')) return 'Anglais';
  if (c.includes('espagnol') || c.includes('español')) return 'Espagnol';
  if (c.includes('allemand') || c.includes('deutsch') || c.includes('kontakte') || c.includes('mitmachen') || c.includes('illusion')) return 'Allemand';
  if (c.includes('philosophie') || c.includes('philo') || c.includes('dissertation philosophique') || c.includes('commentaire de texte philosophique')) return 'Philosophie';
  if (c.includes('français') || c.includes('francais') || c.includes('eoi ') || c.includes('ee ') || 
      c.includes('pl ') || c.includes('gt ') || c.includes('sf ') || c.includes('savoir-faire') || 
      c.includes('savoir faire') || c.includes('roman') || c.includes('dissert') || c.includes('résumé') ||
      c.includes('commentaire composé') || c.includes('com_compos') || c.includes('production') ||
      c.includes('oral_bac') || c.includes('oral du bac') || c.includes('focalisation') ||
      c.includes('figure') || c.includes('tonalité_litt') || c.includes('tonalité litt') ||
      c.includes('versification') || c.includes('argumentation') || c.includes('énonciation') ||
      c.includes('implicite') || c.includes('sémantique') || c.includes('connecteurs') ||
      c.includes('oeuvre') || c.includes('œuvre')) return 'Francais';
  if (c.includes('eps') || c.includes('sport') || c.includes('sauts') || c.includes('lancers') || c.includes('course') || c.includes('handball')) return 'EPS';
  if (c.includes('art') || c.includes('plastique') || c.includes('photographie') || c.includes('cubisme') || 
      c.includes('statuaire') || c.includes('architecture')) return 'Arts_Plastiques';
  if (c.includes('musique') || c.includes('tonalité') || c.includes('beethoven') || c.includes('mozart') || 
      c.includes('jazz') || c.includes('schubert') || c.includes('électronique') || c.includes('bach')) return 'Education_Musicale';
  if (c.includes('tice') || c.includes('informatique')) return 'TICE';
  if (c.includes('leçon') || c.includes('lecon')) return 'Autre';
  return 'Autre';
}

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/_{2,}/g, '_').replace(/\s+/g, ' ').trim().substring(0, 120);
}

// Now let's look at all course names and classify them
const stats = { Tle_A: 0, Tle_D: 0, Tle_C: 0, Tle_SHARED: 0, skipped: 0, unknown: 0 };
const tleACourses = [];
const tleDCourses = [];
const tleCCourses = [];

for (const entry of coursIndex) {
  const level = classifyLevel(entry.course);
  if (level === 'Tle_A') { stats.Tle_A++; tleACourses.push(entry); }
  else if (level === 'Tle_D') { stats.Tle_D++; tleDCourses.push(entry); }
  else if (level === 'Tle_C') { stats.Tle_C++; tleCCourses.push(entry); }
  else if (level === 'Tle_SHARED') { 
    stats.Tle_SHARED++; 
    tleACourses.push(entry);
    tleDCourses.push(entry);
    tleCCourses.push(entry);
  }
  else if (level === null) { stats.skipped++; }
  else { stats.unknown++; }
}

console.log('\n📊 Classification:');
console.log(`  Tle A: ${stats.Tle_A}`);
console.log(`  Tle D: ${stats.Tle_D}`);
console.log(`  Tle C: ${stats.Tle_C}`);
console.log(`  Tle partagé (A+D): ${stats.Tle_SHARED}`);
console.log(`  Seconde/Première (ignoré): ${stats.skipped}`);
console.log(`  Inconnu: ${stats.unknown}`);

// Show unknown ones to debug
if (stats.unknown > 0) {
  const unknowns = [...new Set(coursIndex.filter(e => classifyLevel(e.course) === 'UNKNOWN').map(e => e.course))];
  console.log('\n⚠️ Cours non classifiés:');
  unknowns.slice(0, 40).forEach(c => console.log(`  - ${c}`));
}

// Build folder structure
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function organizeClass(className, entries) {
  const classDir = path.join(OUTPUT_DIR, className);
  ensureDir(classDir);
  
  let organized = 0;
  const bySubject = {};
  
  for (const entry of entries) {
    const subject = classifySubject(entry.course);

    // Pour Terminale C, on ne garde que Mathématiques et Physique-Chimie
    if (className === 'Terminale_C' && !(subject === 'Mathematiques' || subject === 'Physique_Chimie')) {
      continue;
    }

    if (!bySubject[subject]) bySubject[subject] = [];
    bySubject[subject].push(entry);
  }
  
  for (const [subject, lessons] of Object.entries(bySubject)) {
    const subjectDir = path.join(classDir, subject);
    ensureDir(subjectDir);
    
    for (const lesson of lessons) {
      const fileName = sanitize(lesson.course) + '.pdf';
      const srcPath = path.join(PDF_DIR, fileName);
      const destPath = path.join(subjectDir, fileName);
      
      if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        organized++;
      }
    }
  }
  
  console.log(`\n📂 ${className}:`);
  for (const [subject, lessons] of Object.entries(bySubject).sort()) {
    const subjectDir = path.join(classDir, subject);
    const files = fs.existsSync(subjectDir) ? fs.readdirSync(subjectDir).filter(f => f.endsWith('.pdf')) : [];
    console.log(`  📚 ${subject}: ${files.length} PDF(s)`);
  }
  
  return organized;
}

// Clean output dir
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true });
}

console.log('\n📂 Organisation des PDFs...');
const orgA = organizeClass('Terminale_A', tleACourses);
const orgD = organizeClass('Terminale_D', tleDCourses);
const orgC = organizeClass('Terminale_C', tleCCourses);

console.log(`\n✅ Total: ${orgA + orgD + orgC} PDFs organisés`);
console.log(`📁 Dossier: ${OUTPUT_DIR}`);
