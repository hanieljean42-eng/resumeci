// Scrape le catalogue LibraryUI + le code source des composants choisis
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join('C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci', 'node_modules', 'puppeteer-core'));
const OUT = 'C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/_lui_components';
const listOnly = process.argv.includes('--list');
const wanted = process.argv.filter(a => !a.startsWith('--') && a.endsWith('.js') === false).slice(2);

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const page = await browser.newPage();
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions('https://libraryui.com', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await page.setViewport({ width: 1400, height: 900 });

  // Catalogue complet
  await page.goto('https://libraryui.com/components/bootstrap', { waitUntil: 'networkidle0', timeout: 90000 });
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(async () => { for (let i = 0; i < 30; i++) { window.scrollBy(0, 2000); await new Promise(r => setTimeout(r, 250)); } });
  await new Promise(r => setTimeout(r, 2500));
  let comps = await page.evaluate(() => [...document.querySelectorAll('a[href*="/components/"]')].map(a => a.pathname.split('/components/')[1]).filter(Boolean));
  console.log(`=== ${new Set(comps).size} composants bootstrap ===`);
  [...new Set(comps)].sort().forEach(c => console.log(' -', c));
  if (listOnly) { await browser.close(); return; }

  // Code source des composants voulus : on clique "Copier" -> clipboard
  fs.mkdirSync(OUT, { recursive: true });
  for (const slug of wanted) {
    try {
      await page.goto(`https://libraryui.com/components/bootstrap/${slug}`, { waitUntil: 'networkidle0', timeout: 90000 });
      await new Promise(r => setTimeout(r, 5000));
      // liste des variantes
      const variants = await page.evaluate(() => [...document.querySelectorAll('a,button,li,div[class*=style],div[class*=tab]')].map(e => e.textContent.trim()).filter(t => /v-?\d|basique|style/i.test(t)).slice(0, 12));
      console.log(`\n### ${slug} | variantes: ${variants.join(' | ')}`);
      // cliquer chaque bouton "Copier" et lire le presse-papier
      const copyBtns = await page.$$('button');
      let idx = 0;
      for (const btn of await page.$$('button')) {
        const label = await btn.evaluate(b => b.textContent.trim());
        if (!/copier/i.test(label)) continue;
        await btn.click();
        await new Promise(r => setTimeout(r, 600));
        const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
        if (clip && clip.length > 30) {
          fs.writeFileSync(path.join(OUT, `${slug}_${idx}.txt`), clip);
          console.log(`   [${idx}] ${clip.length} chars -> ${slug}_${idx}.txt | ${clip.slice(0, 60).replace(/\n/g, ' ')}`);
          idx++;
        }
      }
      if (!idx) console.log('   (aucun bouton Copier trouvé)');
    } catch (e) { console.log(`   ERREUR ${slug}: ${e.message}`); }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
