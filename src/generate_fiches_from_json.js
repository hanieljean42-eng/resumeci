/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Génération de Fiches de Résumé - Première D (à partir du JSON)
 * Utilise les titres officiels du JSON pour créer les fiches HTML
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const JSON_FILE = path.join(__dirname, '..', 'data_premiere', 'courses_by_subject.json');
const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume', 'Premiere_D');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Lecture du JSON ───────────────────────────────────────
const jsonContent = fs.readFileSync(JSON_FILE, 'utf8');
const data = JSON.parse(jsonContent);

const premiereD = data['PREMIERE D'] || [];

// ─── Classification des leçons par matière ───────────────────
const subjects = {
  'MATHS': [],
  'SVT': [],
  '1ère G': [],
  '1ère H': [],
  'Leçon': [],
  'LEÇON': [],
  'EE': [],
  'PL': [],
  'Savoir-faire': []
};

const seen = new Set();

for (const course of premiereD) {
  const text = course.text;
  
  // Éviter les doublons
  if (seen.has(text)) continue;
  seen.add(text);
  
  if (text.startsWith('MATHS')) {
    subjects['MATHS'].push(text);
  } else if (text.startsWith('SVT')) {
    subjects['SVT'].push(text);
  } else if (text.startsWith('1ère G')) {
    subjects['1ère G'].push(text);
  } else if (text.startsWith('1ère H')) {
    subjects['1ère H'].push(text);
  } else if (text.startsWith('Leçon')) {
    subjects['Leçon'].push(text);
  } else if (text.startsWith('LEÇON')) {
    subjects['LEÇON'].push(text);
  } else if (text.startsWith('EE')) {
    subjects['EE'].push(text);
  } else if (text.startsWith('PL')) {
    subjects['PL'].push(text);
  } else if (text.startsWith('Savoir-faire')) {
    subjects['Savoir-faire'].push(text);
  }
}

// ─── Template HTML ──────────────────────────────────────────
function generateHTML(title, subject, className) {
  const cleanTitle = title.replace(/^[^_]+_/, '').replace(/_/g, ' ');
  
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle} - ${className}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body {
      font-family: 'Inter', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.7;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 1.8rem;
      color: #16a34a;
      margin-bottom: 15px;
    }
    .meta-chips {
      display: flex;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .chip {
      background: #dcfce7;
      color: #166534;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    h2 {
      color: #16a34a;
      font-size: 1.4rem;
      margin-top: 35px;
      margin-bottom: 20px;
      border-bottom: 2px solid #dcfce7;
      padding-bottom: 10px;
    }
    h3 {
      color: #1e293b;
      font-size: 1.15rem;
      margin-top: 25px;
      margin-bottom: 15px;
    }
    .definition {
      background: #dcfce7;
      border-left: 4px solid #16a34a;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .definition strong {
      color: #166534;
    }
    .important {
      background: #dbeafe;
      border-left: 4px solid #3b82f6;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .important strong {
      color: #1e40af;
    }
    .schema {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .schema strong {
      color: #92400e;
    }
    ul, ol {
      margin: 15px 0;
      padding-left: 25px;
    }
    li {
      margin: 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📝 FICHE DE RÉSUMÉ</h1>
    <div class="meta-chips">
      <span class="chip">${className}</span>
      <span class="chip">${subject}</span>
      <span class="chip">${cleanTitle}</span>
    </div>
  </div>

  <h2>I. Introduction</h2>

  <div class="important">
    Cette fiche de résumé couvre les concepts essentiels de la leçon "${cleanTitle}". 
    Le contenu sera complété à partir du cours officiel.
  </div>

  <h2>II. Points Essentiels</h2>

  <div class="schema">
    <strong>À compléter :</strong>
    <ul>
      <li>Concepts clés de la leçon</li>
      <li>Définitions importantes</li>
      <li>Exemples et applications</li>
    </ul>
  </div>

  <h2>III. Conclusion</h2>

  <div class="important">
    Cette fiche sera mise à jour avec le contenu complet du cours officiel.
  </div>
</body>
</html>`;
}

// ─── Génération des fiches ───────────────────────────────────
function generateFiche(title, subject, className, folderName) {
  const cleanTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '_').replace(/\s+/g, '_');
  const fileName = `Fiche_${cleanTitle}.html`;
  const filePath = path.join(FICHES_DIR, folderName, fileName);
  
  ensureDir(path.join(FICHES_DIR, folderName));
  
  const html = generateHTML(title, subject, className);
  fs.writeFileSync(filePath, html, 'utf8');
  
  return fileName;
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('📝 Génération des fiches de résumé à partir du JSON...\n');
  
  let totalFiches = 0;

  // SVT
  console.log('📚 SVT');
  for (const title of subjects['SVT']) {
    const fileName = generateFiche(title, 'SVT', 'Première D', 'SVT');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }

  // Histoire-Geographie
  console.log('\n📚 Histoire-Geographie');
  const geoFolder = path.join(FICHES_DIR, 'Histoire-Geographie');
  ensureDir(geoFolder);
  
  for (const title of subjects['1ère G']) {
    const fileName = generateFiche(title, 'Géographie', 'Première D', 'Histoire-Geographie');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }
  
  for (const title of subjects['1ère H']) {
    const fileName = generateFiche(title, 'Histoire', 'Première D', 'Histoire-Geographie');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }

  // Philosophie
  console.log('\n📚 Philosophie');
  for (const title of subjects['Leçon']) {
    const fileName = generateFiche(title, 'Philosophie', 'Première D', 'Philosophie');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }

  // Français
  console.log('\n📚 Français');
  for (const title of subjects['EE']) {
    const fileName = generateFiche(title, 'Français', 'Première D', 'Francais');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }
  
  for (const title of subjects['PL']) {
    const fileName = generateFiche(title, 'Français', 'Première D', 'Francais');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }
  
  for (const title of subjects['Savoir-faire']) {
    const fileName = generateFiche(title, 'Français', 'Première D', 'Francais');
    console.log(`  ✓ ${fileName}`);
    totalFiches++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Fiches générées: ${totalFiches}`);
  console.log(`📁 Dossier: ${FICHES_DIR}`);
}

main().catch(e => console.error('Fatal:', e));
