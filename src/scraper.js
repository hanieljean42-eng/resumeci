const EcoleCIScraper = require('./scraper_core');

const args = process.argv.slice(2);
let targetClass = null;

// Parse simple arguments like --classe=3eme or 3eme
args.forEach(arg => {
  if (arg.startsWith('--classe=')) {
    targetClass = arg.split('=')[1];
  } else if (!arg.startsWith('--')) {
    targetClass = arg;
  }
});

(async () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  📚 RésuméCI — Scraper Unifié         ║');
  if (targetClass) {
    console.log(`║  Cible: ${targetClass.padEnd(29, ' ')} ║`);
  } else {
    console.log('║  Cible: Par défaut (Terminale)        ║');
  }
  console.log('╚═══════════════════════════════════════╝\n');

  const scraper = new EcoleCIScraper({ targetClass });
  await scraper.run();
})();
