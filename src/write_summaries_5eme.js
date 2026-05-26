/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Système de Rédaction Manuelle des Résumés 5ème
 * 
 * Ce script prépare les fichiers pour que je rédige chaque résumé
 * manuellement après avoir lu le contenu extrait des leçons.
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const EXTRACTS_DIR = path.join(__dirname, '..', '_extracts_5eme');
const RESUMES_DIR = path.join(__dirname, '..', 'Resumes_5eme');
const PROGRESS_FILE = path.join(__dirname, '..', '_resume_progress_5eme.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Lire une leçon extraite ───────────────────────────────
function readExtractedLesson(subject, lessonName) {
  const extractPath = path.join(EXTRACTS_DIR, subject, `${lessonName}.txt`);
  if (!fs.existsSync(extractPath)) return null;
  return fs.readFileSync(extractPath, 'utf8');
}

// ─── Créer un template pour rédaction manuelle ────────────────────────────
function createManualTemplate(subject, lessonName, extractedText) {
  // Extraire juste le contenu principal (après les en-têtes)
  const contentMatch = extractedText.match(/═+\n\n([\s\S]+?)\n\n═+\nFIN DE LA LEÇON/);
  const lessonContent = contentMatch ? contentMatch[1] : extractedText;
  
  // Extraire le titre si présent
  const firstLines = lessonContent.split('\n').slice(0, 30);
  let title = lessonName;
  for (const line of firstLines) {
    const trimmed = line.trim();
    if (trimmed.length > 5 && trimmed.length < 100 && !trimmed.includes('http') && !trimmed.includes('©')) {
      title = trimmed;
      break;
    }
  }

  return `# 📝 Résumé - ${title}

**Matière:** ${subject}  
**Classe:** 5ème  
**Leçon:** ${lessonName}

---

## 🎯 Points clés de la leçon

*(À remplir après lecture du contenu)*

### 1. Notions fondamentales
- 
- 
- 

### 2. Définitions importantes
- **Terme 1**: 
- **Terme 2**: 
- **Terme 3**: 

### 3. Méthodes / Formules
- 
- 

### 4. Exemples pratiques
- 
- 

---

## 📝 Résumé détaillé

*(Rédiger ici un résumé clair et structuré de la leçon)*



---

## ⚠️ Points à retenir pour l'examen

1. 
2. 
3. 

---

## 📚 Contenu source (extrait du PDF)

<details>
<summary>Cliquez pour voir le texte original de la leçon</summary>

\`\`\`
${lessonContent.substring(0, 3000)}${lessonContent.length > 3000 ? '\n\n[... contenu tronqué ...]' : ''}
\`\`\`

</details>

---

*Statut: En attente de rédaction*  
*Créé le: ${new Date().toLocaleDateString('fr-FR')}*
`;
}

// ─── Sauvegarder un résumé rédigé ────────────────────────────
function saveManualResume(subject, lessonName, content) {
  const subjectDir = path.join(RESUMES_DIR, subject);
  ensureDir(subjectDir);
  
  const resumePath = path.join(subjectDir, `${lessonName}.md`);
  fs.writeFileSync(resumePath, content, 'utf8');
  return resumePath;
}

// ─── Mettre à jour la progression ────────────────────────────
function updateProgress(subject, lessonName, status, note = '') {
  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  
  if (!progress[subject]) progress[subject] = {};
  progress[subject][lessonName] = {
    status,
    updatedAt: new Date().toISOString(),
    note
  };
  
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

// ─── Lister les leçons en attente ────────────────────────────
function listPendingLessons() {
  if (!fs.existsSync(EXTRACTS_DIR)) {
    console.log('❌ Aucune leçon extraite. Exécutez d\'abord: npm run extract:5eme');
    return [];
  }
  
  const pending = [];
  const subjects = fs.readdirSync(EXTRACTS_DIR).filter(d => 
    fs.statSync(path.join(EXTRACTS_DIR, d)).isDirectory()
  );
  
  for (const subject of subjects) {
    const subjectDir = path.join(EXTRACTS_DIR, subject);
    const files = fs.readdirSync(subjectDir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      const lessonName = file.replace('.txt', '');
      const resumePath = path.join(RESUMES_DIR, subject, `${lessonName}.md`);
      
      if (!fs.existsSync(resumePath)) {
        pending.push({ subject, lessonName, extractPath: path.join(subjectDir, file) });
      }
    }
  }
  
  return pending;
}

// ─── Préparer les templates pour rédaction ────────────────────────────
async function prepareTemplates() {
  console.log('📝 Préparation des templates pour rédaction manuelle...\n');
  
  const pending = listPendingLessons();
  
  if (pending.length === 0) {
    console.log('✅ Toutes les leçons ont déjà un résumé !');
    return;
  }
  
  console.log(`📚 ${pending.length} leçons en attente de résumé:\n`);
  
  let created = 0;
  
  for (const { subject, lessonName, extractPath } of pending) {
    const extractedText = fs.readFileSync(extractPath, 'utf8');
    const template = createManualTemplate(subject, lessonName, extractedText);
    
    const resumePath = saveManualResume(subject, lessonName, template);
    updateProgress(subject, lessonName, 'template_created', 'En attente de rédaction manuelle');
    
    created++;
    console.log(`  ✅ Template créé: ${subject}/${lessonName}.md`);
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 TEMPLATES CRÉÉS');
  console.log('═'.repeat(60));
  console.log(`✅ ${created} templates prêts dans: ${RESUMES_DIR}`);
  console.log(`\n💡 Pour rédiger les résumés:`);
  console.log(`   1. Ouvrez chaque fichier .md dans Resumes_5eme/`);
  console.log(`   2. Lisez le contenu de la leçon (section "Contenu source")`);
  console.log(`   3. Rédigez votre résumé dans la section "Résumé détaillé"`);
  console.log(`   4. Complétez les points clés et définitions`);
}

// ─── Afficher la progression ────────────────────────────
function showProgress() {
  const pending = listPendingLessons();
  
  if (!fs.existsSync(RESUMES_DIR)) {
    console.log('📊 Progression: 0% (aucun résumé créé)');
    console.log(`📚 ${pending.length} leçons en attente`);
    return;
  }
  
  let completed = 0;
  const subjects = fs.readdirSync(RESUMES_DIR).filter(d =>
    fs.statSync(path.join(RESUMES_DIR, d)).isDirectory()
  );
  
  for (const subject of subjects) {
    const files = fs.readdirSync(path.join(RESUMES_DIR, subject)).filter(f => f.endsWith('.md'));
    completed += files.length;
  }
  
  const total = pending.length + completed;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  console.log(`${'═'.repeat(60)}`);
  console.log('📊 PROGRESSION DES RÉSUMÉS 5ÈME');
  console.log('═'.repeat(60));
  console.log(`✅ Complétés: ${completed}/${total} (${percent}%)`);
  console.log(`⏳ En attente: ${pending.length}`);
  console.log(`\n📁 Résumés: ${RESUMES_DIR}`);
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'prepare';
  
  switch (command) {
    case 'prepare':
      await prepareTemplates();
      break;
    case 'progress':
      showProgress();
      break;
    case 'list':
      const pending = listPendingLessons();
      console.log(`\n📚 ${pending.length} leçons en attente:\n`);
      for (const { subject, lessonName } of pending) {
        console.log(`  • ${subject}: ${lessonName}`);
      }
      break;
    default:
      console.log(`
Usage: node write_summaries_5eme.js [commande]

Commandes:
  prepare   Créer les templates pour rédaction manuelle (défaut)
  progress  Afficher la progression
  list      Lister les leçons en attente
      `);
  }
}

main().catch(e => console.error('Fatal:', e));
