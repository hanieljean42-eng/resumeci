/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Génération de Fiches de Résumé pour 5ème
 * Pour chaque leçon PDF → extrait le texte → crée une fiche
 * Structure: Fiches_Resume_5eme/Matière/Fiche_leçon.md
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const COURS_DIR = path.join(__dirname, '..', 'Cours_5eme');
const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume_5eme');

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
    if (!e.message.includes('standardFontDataUrl')) {
      console.error(`  ❌ Erreur extraction: ${e.message}`);
    }
    try {
      const buffer = fs.readFileSync(filePath);
      const arr = new Uint8Array(buffer);
      const parser = new PDFParse(arr);
      await parser.load();
      const result = await parser.getText();
      if (result && result.pages) {
        return result.pages.map(p => p.text || '').join('\n');
      }
    } catch (e2) { /* ignore */ }
    return '';
  }
}

// ─── Nettoyage du texte extrait ────────────────────────────
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

// ─── Extraction intelligente du contenu ────────────────────
function extractKeyContent(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const result = {
    title: '',
    introduction: '',
    definitions: [],
    mainPoints: [],
    examples: [],
    conclusion: '',
    keyTerms: [],
  };

  // Find title
  for (const line of lines) {
    if (line.length > 10 && line.length < 200 && !line.match(/^(page|cours|accueil|tableau)/i)) {
      result.title = line;
      break;
    }
  }

  // Extract definitions
  const defPatterns = /(?:est |signifie |désigne |se définit |c'est |on appelle |on entend par )/i;
  for (const line of lines) {
    if (defPatterns.test(line) && line.length > 30 && line.length < 500) {
      result.definitions.push(line);
    }
  }

  // Extract numbered/bulleted points
  const pointPattern = /^(?:\d+[\.\)\-]|[a-z][\.\)]|[•●▪►\-–]\s*|[IVX]+[\.\)])/;
  for (const line of lines) {
    if (pointPattern.test(line) && line.length > 15) {
      result.mainPoints.push(line);
    }
  }

  // Extract examples
  for (const line of lines) {
    if (/(?:exemple|ex\s*:|par exemple|e\.g\.)/i.test(line) && line.length > 20) {
      result.examples.push(line);
    }
  }

  // Extract key terms
  const terms = new Set();
  for (const line of lines) {
    const capsMatch = line.match(/\b[A-ZÀ-Ü]{3,}(?:\s+[A-ZÀ-Ü]{3,}){0,5}\b/g);
    if (capsMatch) {
      for (const m of capsMatch) {
        if (m.length > 4 && m.length < 60 && !m.match(/^(LEÇON|COURS|PAGE|THEME|CHAPITRE|RESUME|PDF|FICHE)/)) {
          terms.add(m);
        }
      }
    }
  }
  result.keyTerms = [...terms].slice(0, 20);

  // Get introduction
  const titleIdx = lines.indexOf(result.title);
  if (titleIdx >= 0) {
    const afterTitle = lines.slice(titleIdx + 1);
    const introParagraph = [];
    for (const line of afterTitle) {
      if (line.length > 20) {
        introParagraph.push(line);
        if (introParagraph.join(' ').length > 300) break;
      }
      if (introParagraph.length > 0 && line.length < 5) break;
    }
    result.introduction = introParagraph.join(' ').substring(0, 500);
  }

  // Get conclusion
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

// ─── Génération de la fiche Markdown ───────────────────────
function generateFiche(pdfName, subject, content, fullText) {
  const lessonName = pdfName.replace('.pdf', '');
  
  let fiche = '';
  
  // Header
  fiche += `# 📝 Fiche de Résumé - 5ème\n\n`;
  fiche += `| | |\n|---|---|\n`;
  fiche += `| **Classe** | 5ème |\n`;
  fiche += `| **Matière** | ${subject} |\n`;
  fiche += `| **Leçon** | ${lessonName} |\n\n`;
  fiche += `---\n\n`;

  // Title
  if (content.title) {
    fiche += `## ${content.title}\n\n`;
  }

  // Introduction
  if (content.introduction) {
    fiche += `### Introduction\n\n${content.introduction}\n\n`;
  }

  // Definitions
  if (content.definitions.length > 0) {
    fiche += `### Définitions clés\n\n`;
    const uniqueDefs = [...new Set(content.definitions)].slice(0, 10);
    for (const def of uniqueDefs) {
      fiche += `- ${def}\n`;
    }
    fiche += '\n';
  }

  // Main points
  if (content.mainPoints.length > 0) {
    fiche += `### Points essentiels\n\n`;
    const uniquePoints = [...new Set(content.mainPoints)].slice(0, 25);
    for (const point of uniquePoints) {
      fiche += `- ${point}\n`;
    }
    fiche += '\n';
  }

  // Key terms
  if (content.keyTerms.length > 0) {
    fiche += `### Termes clés\n\n`;
    fiche += content.keyTerms.map(t => `\`${t}\``).join(' • ') + '\n\n';
  }

  // Examples
  if (content.examples.length > 0) {
    fiche += `### Exemples\n\n`;
    const uniqueExamples = [...new Set(content.examples)].slice(0, 8);
    for (const ex of uniqueExamples) {
      fiche += `- ${ex}\n`;
    }
    fiche += '\n';
  }

  // Conclusion
  if (content.conclusion) {
    fiche += `### Conclusion\n\n${content.conclusion}\n\n`;
  }

  // Full content summary
  const sentences = fullText
    .replace(/\n+/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 300);
  
  if (sentences.length > 5) {
    fiche += `### Résumé du contenu\n\n`;
    const step = Math.max(1, Math.floor(sentences.length / 15));
    const selected = [];
    for (let i = 0; i < sentences.length && selected.length < 15; i += step) {
      selected.push(sentences[i]);
    }
    fiche += selected.map(s => `> ${s}.`).join('\n>\n') + '\n\n';
  }

  fiche += `---\n*Fiche générée automatiquement à partir du cours PDF - 5ème*\n`;
  
  return fiche;
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log('📝 Génération des fiches de résumé pour 5ème...\n');
  
  // Vérifier si le dossier Cours_5eme existe
  if (!fs.existsSync(COURS_DIR)) {
    console.log('❌ Dossier Cours_5eme introuvable. Exécutez d\'abord le scraper 5ème.');
    return;
  }
  
  // Réinitialiser le dossier de sortie
  if (fs.existsSync(FICHES_DIR)) {
    fs.rmSync(FICHES_DIR, { recursive: true });
  }
  ensureDir(FICHES_DIR);

  let totalFiches = 0;
  let errors = 0;
  let excludedSubjects = 0;

  // Parcourir les matières dans Cours_5eme
  const subjects = fs.readdirSync(COURS_DIR).filter(d => {
    const fullPath = path.join(COURS_DIR, d);
    if (!fs.statSync(fullPath).isDirectory()) return false;
    
    // Vérifier exclusion
    if (isExcludedSubject(d)) {
      console.log(`🚫 Matière exclue: ${d}`);
      excludedSubjects++;
      return false;
    }
    return true;
  });

  console.log(`📂 ${subjects.length} matières trouvées dans Cours_5eme\n`);

  for (const subject of subjects) {
    const subjectDir = path.join(COURS_DIR, subject);
    const pdfs = fs.readdirSync(subjectDir).filter(f => f.endsWith('.pdf'));
    
    const ficheSubjectDir = path.join(FICHES_DIR, subject);
    ensureDir(ficheSubjectDir);

    console.log(`\n📚 ${subject} (${pdfs.length} leçons)`);

    for (const pdfFile of pdfs) {
      // Vérifier si le PDF est exclu
      if (isExcludedSubject(pdfFile)) {
        console.log(`  🚫 Exclu: ${pdfFile}`);
        excludedSubjects++;
        continue;
      }
      
      const pdfPath = path.join(subjectDir, pdfFile);
      const ficheName = 'Fiche_' + pdfFile.replace('.pdf', '.md');
      const fichePath = path.join(ficheSubjectDir, ficheName);

      try {
        // Extract text
        const rawText = await extractPdfText(pdfPath);
        if (rawText.length < 50) {
          console.log(`    ⚠️ ${pdfFile}: texte trop court (${rawText.length} car.)`);
          errors++;
          continue;
        }

        const cleanedText = cleanText(rawText);
        const content = extractKeyContent(cleanedText);
        const fiche = generateFiche(pdfFile, subject, content, cleanedText);

        fs.writeFileSync(fichePath, fiche, 'utf8');
        totalFiches++;

        console.log(`    ✅ Fiche générée: ${ficheName}`);
      } catch (e) {
        console.log(`    ❌ ${pdfFile}: ${e.message}`);
        errors++;
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RÉSULTAT FINAL - 5ÈME');
  console.log('═'.repeat(60));
  console.log(`✅ Fiches générées: ${totalFiches}`);
  console.log(`🚫 Matières/PDFs exclus: ${excludedSubjects}`);
  console.log(`❌ Erreurs: ${errors}`);
  console.log(`📁 Dossier: ${FICHES_DIR}`);

  // Show tree
  console.log('\n📁 Structure des fiches 5ème:');
  const subs = fs.readdirSync(FICHES_DIR).sort();
  for (const s of subs) {
    const sDir = path.join(FICHES_DIR, s);
    if (!fs.statSync(sDir).isDirectory()) continue;
    const count = fs.readdirSync(sDir).filter(f => f.endsWith('.md')).length;
    console.log(`  📚 ${s}/ (${count} fiches)`);
  }
}

main().catch(e => console.error('Fatal:', e));
