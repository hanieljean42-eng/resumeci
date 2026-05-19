const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const COURS_DIR = path.join(__dirname, '..', 'Cours_Terminale');
const OUT_DIR = path.join(__dirname, '..', '_extracts');

async function extractPdfText(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse(new Uint8Array(buffer));
    await parser.load();
    const result = await parser.getText();
    return result.text || '';
  } catch (e) { return ''; }
}

async function main() {
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const classes = fs.readdirSync(COURS_DIR).filter(d => fs.statSync(path.join(COURS_DIR, d)).isDirectory());
  let total = 0;

  for (const cls of classes) {
    const clsDir = path.join(COURS_DIR, cls);
    const subjects = fs.readdirSync(clsDir).filter(d => fs.statSync(path.join(clsDir, d)).isDirectory());

    for (const subject of subjects) {
      const subDir = path.join(clsDir, subject);
      const outSubDir = path.join(OUT_DIR, cls, subject);
      fs.mkdirSync(outSubDir, { recursive: true });

      const pdfs = fs.readdirSync(subDir).filter(f => f.endsWith('.pdf'));
      for (const pdf of pdfs) {
        const text = await extractPdfText(path.join(subDir, pdf));
        const outFile = path.join(outSubDir, pdf.replace('.pdf', '.txt'));
        fs.writeFileSync(outFile, text, 'utf8');
        total++;
      }
      console.log(`${cls}/${subject}: ${pdfs.length} extraits`);
    }
  }
  console.log(`\nTotal: ${total} fichiers extraits dans _extracts/`);
}

main().catch(console.error);
