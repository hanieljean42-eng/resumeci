/**
 * ═══════════════════════════════════════════════════════════
 * 📝 Génération de Fiches de Résumé
 * Pour chaque leçon PDF → extrait le texte → crée une fiche
 * Structure: Fiches_Resume/Terminale_X/Matière/Fiche_leçon.md
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const COURS_DIR = path.join(__dirname, '..', 'Cours_Terminale');
const FICHES_DIR = path.join(__dirname, '..', 'Fiches_Resume');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
    // Try fallback: just get pages text
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
    // Remove common Moodle/website artifacts
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

  // Find title (usually first substantial line)
  for (const line of lines) {
    if (line.length > 10 && line.length < 200 && !line.match(/^(page|cours|accueil|tableau)/i)) {
      result.title = line;
      break;
    }
  }

  // Extract definitions (lines with "est", "signifie", "désigne", "se définit")
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

  // Extract key terms (capitalized phrases, bold markers)
  const terms = new Set();
  for (const line of lines) {
    // Look for terms in ALL CAPS or between markers
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

  // Get introduction (first paragraph after title)
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

  // Get conclusion (last substantial paragraph)
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
function generateFiche(pdfName, subject, className, content, fullText) {
  const lessonName = pdfName.replace('.pdf', '');
  const classDisplay = className.replace('_', ' ');
  
  let fiche = '';
  
  // Header
  fiche += `# 📝 Fiche de Résumé\n\n`;
  fiche += `| | |\n|---|---|\n`;
  fiche += `| **Classe** | ${classDisplay} |\n`;
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

  // Full content summary (condensed)
  const sentences = fullText
    .replace(/\n+/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 300);
  
  if (sentences.length > 5) {
    fiche += `### Résumé du contenu\n\n`;
    // Take evenly spaced sentences to create a balanced summary
    const step = Math.max(1, Math.floor(sentences.length / 15));
    const selected = [];
    for (let i = 0; i < sentences.length && selected.length < 15; i += step) {
      selected.push(sentences[i]);
    }
    fiche += selected.map(s => `> ${s}.`).join('\n>\n') + '\n\n';
  }

  fiche += `---\n*Fiche générée automatiquement à partir du cours PDF*\n`;
  
  return fiche;
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log('📝 Génération des fiches de résumé...\n');
  
  if (fs.existsSync(FICHES_DIR)) {
    fs.rmSync(FICHES_DIR, { recursive: true });
  }
  ensureDir(FICHES_DIR);

  let totalFiches = 0;
  let errors = 0;

  // Walk through Cours_Terminale structure
  const classes = fs.readdirSync(COURS_DIR).filter(d => 
    fs.statSync(path.join(COURS_DIR, d)).isDirectory()
  );

  for (const className of classes) {
    const classDir = path.join(COURS_DIR, className);
    const subjects = fs.readdirSync(classDir).filter(d => 
      fs.statSync(path.join(classDir, d)).isDirectory()
    );

    console.log(`\n📂 ${className} (${subjects.length} matières)`);

    for (const subject of subjects) {
      const subjectDir = path.join(classDir, subject);
      const pdfs = fs.readdirSync(subjectDir).filter(f => f.endsWith('.pdf'));
      
      const ficheSubjectDir = path.join(FICHES_DIR, className, subject);
      ensureDir(ficheSubjectDir);

      console.log(`  📚 ${subject} (${pdfs.length} leçons)`);

      for (const pdfFile of pdfs) {
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
          const fiche = generateFiche(pdfFile, subject, className, content, cleanedText);

          fs.writeFileSync(fichePath, fiche, 'utf8');
          totalFiches++;

          if (totalFiches % 20 === 0) {
            console.log(`    📊 ${totalFiches} fiches générées...`);
          }
        } catch (e) {
          console.log(`    ❌ ${pdfFile}: ${e.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RÉSULTAT FINAL');
  console.log('═'.repeat(60));
  console.log(`✅ Fiches générées: ${totalFiches}`);
  console.log(`❌ Erreurs: ${errors}`);
  console.log(`📁 Dossier: ${FICHES_DIR}`);

  // Show tree
  console.log('\n📁 Structure des fiches:');
  const cls = fs.readdirSync(FICHES_DIR);
  for (const c of cls.sort()) {
    const cDir = path.join(FICHES_DIR, c);
    if (!fs.statSync(cDir).isDirectory()) continue;
    console.log(`  📂 ${c}/`);
    const subs = fs.readdirSync(cDir).sort();
    for (const s of subs) {
      const sDir = path.join(cDir, s);
      if (!fs.statSync(sDir).isDirectory()) continue;
      const count = fs.readdirSync(sDir).filter(f => f.endsWith('.md')).length;
      console.log(`    📚 ${s}/ (${count} fiches)`);
    }
  }
}

main().catch(e => console.error('Fatal:', e));
