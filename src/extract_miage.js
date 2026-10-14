// Extraction des textes des supports de cours Licence 1 MIAGE (hors TD)
// Source : Cours_Licence_1_Miage/Cours/Semestre_{1,2}/<Matière>/*.pdf
// Sortie : _extracts_Licence_1_Miage/<Matière>/<fichier>.txt
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'Cours_Licence_1_Miage', 'Cours');
const OUT = path.join(__dirname, '..', '_extracts_Licence_1_Miage');

function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .replace(/\t+/g, ' ').replace(/ {2,}/g, ' ')
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
    console.error(`  ❌ ${path.basename(filePath)}: ${e.message}`);
    return '';
  }
}

(async () => {
  let ok = 0, ko = 0, skipped = 0;
  for (const sem of fs.readdirSync(SRC)) {
    const semDir = path.join(SRC, sem);
    if (!fs.statSync(semDir).isDirectory()) continue;
    for (const subject of fs.readdirSync(semDir)) {
      const subDir = path.join(semDir, subject);
      if (!fs.statSync(subDir).isDirectory()) continue;
      const outDir = path.join(OUT, subject);
      fs.mkdirSync(outDir, { recursive: true });
      for (const f of fs.readdirSync(subDir)) {
        if (!/\.(pdf|docx?)$/i.test(f)) continue;
        const lessonName = f.replace(/\.[^.]+$/, '');
        const outPath = path.join(outDir, `${lessonName}.txt`);
        if (fs.existsSync(outPath)) { skipped++; continue; }
        let text = '';
        if (/\.pdf$/i.test(f)) {
          text = cleanText(await extractPdfText(path.join(subDir, f)));
        } else {
          // .doc/.docx : pas d'extracteur dédié — signalé pour traitement manuel
          console.log(`  ⚠️ Format non-PDF (à traiter manuellement): ${f}`);
          ko++; continue;
        }
        if (text.length < 50) { console.log(`  ⚠️ Texte trop court (PDF scanné ?): ${f}`); ko++; continue; }
        fs.writeFileSync(outPath,
          `═══════════════════════════════════════════════════════════\nLEÇON: ${lessonName}\nMATIÈRE: ${subject}\nCLASSE: Licence_1_Miage\nSEMESTRE: ${sem}\nSOURCE: ${f}\n═══════════════════════════════════════════════════════════\n\n${text}\n`, 'utf8');
        ok++;
        console.log(`  ✅ ${sem}/${subject}/${lessonName} (${text.length} car.)`);
      }
    }
  }
  console.log(`\nTERMINE: ${ok} extraits, ${skipped} déjà présents, ${ko} échecs/non-PDF`);
})();
