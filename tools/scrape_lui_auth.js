// Scrape LibraryUI avec la session connectée (_lui_profile)
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join('C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci', 'node_modules', 'puppeteer-core'));
const OUT = 'C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/_lui_components';
const PROFILE = 'C:/Users/DJEBLE/OneDrive/Desktop/CIRESUME/resumeci/_lui_profile';
const wanted = process.argv.slice(2);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: PROFILE
  });
  const page = await browser.newPage();
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions('https://libraryui.com', ['clipboard-read', 'clipboard-sanitized-write']);
  await page.setViewport({ width: 1400, height: 900 });

  // vérifier la connexion
  await page.goto('https://libraryui.com/accueil', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise(r => setTimeout(r, 10000));
  const loggedIn = await page.evaluate(() => !/Connexion/.test(document.body.innerText.split('\n').slice(0, 12).join(' ')) || /Déconnexion|Mon compte|Profil/i.test(document.body.innerText));
  console.log(loggedIn ? '✅ Session connectée' : '⚠️ Session peut-être non connectée, on tente quand même');

  fs.mkdirSync(OUT, { recursive: true });
  for (const slug of wanted) {
    try {
      await page.goto(`https://libraryui.com/components/bootstrap/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await new Promise(r => setTimeout(r, 12000));
      const blocked = await page.evaluate(() => /Limite de copies/.test(document.body.innerText));
      if (blocked) { console.log(`### ${slug} : 🔒 limite/session non reconnue`); continue; }
      let idx = 0;
      for (const btn of await page.$$('button')) {
        const label = await btn.evaluate(b => b.textContent.trim());
        if (!/copier/i.test(label)) continue;
        await btn.click();
        await new Promise(r => setTimeout(r, 700));
        const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
        if (clip && clip.length > 30) {
          fs.writeFileSync(path.join(OUT, `${slug}_${idx}.txt`), clip);
          console.log(`### ${slug} [${idx}] ${clip.length}c -> ${slug}_${idx}.txt | ${clip.slice(0, 55).replace(/\n/g, ' ')}`);
          idx++;
        }
      }
      console.log(idx ? '' : `### ${slug} : aucun bouton Copier`);
    } catch (e) { console.log(`### ${slug} ERREUR: ${e.message}`); }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
