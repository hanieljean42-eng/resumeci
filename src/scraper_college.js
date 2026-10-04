/**
 * Scraper des cours du collège (coll.ecole-ci.org, Moodle) : télécharge les PDF d'une classe rangés par matière.
 * Usage : node src/scraper_college.js 4eme        (classes : 6eme, 5eme, 4eme, 3eme)
 * Option : VISITOR_PHONE=07xxxxxxxx pour utiliser ton propre compte visiteur ecole-ci.org.
 * Sortie : Cours_<classe>/<Matière>/<Leçon>.pdf  +  data_<classe>/cours_index.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const EcoleCIScraper = require('./scraper_core');

const CLASSES = {
  '6eme': { label: 'Sixième' },
  '5eme': { label: 'Cinquième' },
  '4eme': { label: 'Quatrième' },
  '3eme': { label: 'Troisième' },
};
const COLL_BASE = 'https://lyc.ecole-ci.org';
const ROOT = path.join(__dirname, '..');

const cls = process.argv[2];
if (!CLASSES[cls]) {
  console.log(`Usage : node src/scraper_college.js <${Object.keys(CLASSES).join('|')}>`);
  process.exit(1);
}
const OUT_DIR = path.join(ROOT, `Cours_${cls}`);
const DATA_DIR = path.join(ROOT, `data_${cls}`);
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = s => String(s || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150);
const log = (e, m) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${e} ${m}`);

async function fetchPdf(url, cookies) {
  const headers = {
    Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    Referer: COLL_BASE,
  };
  let res = await axios({ url, responseType: 'arraybuffer', headers, httpsAgent, maxRedirects: 5, timeout: 60000 });
  const type = String(res.headers['content-type'] || '');
  if (type.includes('pdf')) return res.data;
  // Page Moodle "resource" qui intègre le PDF : récupérer le lien pluginfile
  const html = Buffer.from(res.data).toString('utf8');
  const m = html.match(/https?:\/\/[^"'\s]+\/pluginfile\.php\/[^"'\s]+/);
  if (!m) return null;
  res = await axios({ url: m[0].replace(/&amp;/g, '&'), responseType: 'arraybuffer', headers, httpsAgent, maxRedirects: 5, timeout: 60000 });
  return String(res.headers['content-type'] || '').includes('pdf') ? res.data : null;
}

(async () => {
  const { label } = CLASSES[cls];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const scraper = new EcoleCIScraper({ targetClass: label, niveau: 'Collège', dataDir: DATA_DIR, outputDir: OUT_DIR, phone: process.env.VISITOR_PHONE });
  await scraper.init();
  const page = scraper.page;
  const index = [];
  const stats = { courses: 0, found: 0, downloaded: 0, skipped: 0, errors: 0 };

  try {
    await scraper.registerVisitor().catch(e => log('⚠️', `Inscription : ${e.message}`));
    await sleep(2000);
    // La connexion redirige pendant les captures d'écran du scraper de base : on ignore ces erreurs puis on vérifie sur le Moodle
    await scraper.loginVisitor().catch(e => log('⚠️', `Connexion : ${e.message}`));
    await sleep(4000);
    log('🌐', `Après connexion : ${page.url()}`);

    // S'assurer que la session Moodle est valide côté collège
    await page.goto(`${COLL_BASE}/course/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);
    log('🌐', `Page collège : ${page.url()} — ${(await page.title()).trim()}`);

    // Trouver le lien de la classe cible dans la liste des catégories
    const classHref = await page.evaluate((label) => {
      const links = [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')];
      const exact = links.find(a => a.textContent.trim().toLowerCase() === label.toLowerCase());
      if (exact) return exact.href;
      const partial = links.find(a => a.textContent.toLowerCase().includes(label.toLowerCase()));
      return partial ? partial.href : null;
    }, label);
    if (!classHref) {
      const cats = await page.evaluate(() => [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => a.textContent.trim()));
      throw new Error(`Catégorie "${label}" non trouvée sur ${COLL_BASE}/course/. Catégories visibles : ${cats.slice(0, 20).join(', ')}`);
    }
    log('📋', `Catégorie classe trouvée : ${classHref}`);

    // Catégorie de la classe -> sous-catégories (matières) -> cours (leçons) -> ressources
    const queue = [{ href: classHref, subject: null }];
    const seen = new Set();
    const courses = [];
    while (queue.length) {
      const cat = queue.shift();
      if (seen.has(cat.href)) continue;
      seen.add(cat.href);
      await page.goto(cat.href, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(1200);
      const info = await page.evaluate(() => ({
        url: location.href,
        title: (document.querySelector('h1')?.textContent || document.title).trim(),
        // Plusieurs sélecteurs possibles selon le thème Moodle
        subCats: [
          ...document.querySelectorAll('#region-main .subcategories a[href*="course/index.php?categoryid="]'),
          ...document.querySelectorAll('#region-main .category .categoryname a'),
          ...document.querySelectorAll('#region-main a[href*="course/index.php?categoryid="]'),
          ...document.querySelectorAll('.category a[href*="course/index.php?categoryid="]'),
        ].map(a => ({ text: a.textContent.trim(), href: a.href })),
        courses: [
          ...document.querySelectorAll('#region-main a[href*="/course/view.php?id="]'),
          ...document.querySelectorAll('a[href*="/course/view.php?id="]'),
        ].map(a => ({ text: a.textContent.trim(), href: a.href })),
      }));
      // Dédupliquer
      info.subCats = info.subCats.filter((v, i, a) => a.findIndex(t => t.href === v.href) === i);
      info.courses = info.courses.filter((v, i, a) => a.findIndex(t => t.href === v.href) === i);
      if (seen.size === 1 && /login/.test(info.url)) throw new Error('Non connecté à coll.ecole-ci.org (redirigé vers la connexion).');
      for (const sc of info.subCats) {
        if (!seen.has(sc.href) && sc.text) queue.push({ href: sc.href, subject: cat.subject || sc.text });
      }
      for (const c of info.courses) {
        if (!courses.find(x => x.href === c.href)) courses.push({ ...c, subject: cat.subject || info.title });
      }
      log('📂', `${info.title} : ${info.subCats.length} sous-catégories, ${info.courses.length} cours`);
      if (seen.size === 1 && info.subCats.length === 0 && info.courses.length === 0) {
        // Diagnostics : sauver un extrait HTML pour comprendre la structure
        const snippet = await page.evaluate(() => document.querySelector('#region-main')?.outerHTML?.slice(0, 3000) || document.body.innerHTML.slice(0, 3000));
        fs.writeFileSync(path.join(DATA_DIR, 'diagnostic_category.html'), snippet);
        log('🔍', 'Aucun cours trouvé sur la catégorie racine. Extrait HTML sauvé dans data_4eme/diagnostic_category.html');
      }
    }

    log('📚', `${courses.length} leçons à parcourir`);
    for (const course of courses) {
      stats.courses++;
      try {
        await page.goto(course.href, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(700);
        const data = await page.evaluate(() => ({
          title: (document.querySelector('.page-header-headings h1, h1')?.textContent || document.title).trim(),
          resources: [...document.querySelectorAll('a[href*="/mod/resource/view.php"], a[href*="/pluginfile.php"]')]
            .map(a => ({ text: a.textContent.trim(), href: a.href })),
        }));
        // Privilégier la ressource "résumé / cours" de la leçon
        const res = data.resources.find(r => /résumé|resume|cours|leçon|lecon/i.test(r.text)) || data.resources[0];
        if (!res) { log('⚠️', `Aucune ressource : ${data.title}`); continue; }
        stats.found++;
        const subjectDir = path.join(OUT_DIR, sanitize(course.subject));
        fs.mkdirSync(subjectDir, { recursive: true });
        const file = path.join(subjectDir, sanitize(data.title).replace(/:/g, '_') + '.pdf');
        const entry = { subject: course.subject, course: data.title, source: course.href, url: res.href, className: cls, localPath: file };
        index.push(entry);
        if (fs.existsSync(file)) { stats.skipped++; continue; }
        const pdf = await fetchPdf(res.href, await page.cookies());
        if (pdf) {
          fs.writeFileSync(file, pdf);
          entry.size = pdf.length;
          stats.downloaded++;
          log('📥', `${course.subject} / ${data.title}`);
        } else {
          stats.errors++;
          log('❌', `Pas de PDF : ${data.title}`);
        }
        await sleep(1000);
      } catch (e) {
        stats.errors++;
        log('❌', `${course.text} : ${e.message}`);
      }
    }
  } catch (e) {
    log('❌', e.message);
  } finally {
    fs.writeFileSync(path.join(DATA_DIR, 'cours_index.json'), JSON.stringify(index, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'final_stats.json'), JSON.stringify(stats, null, 2));
    await scraper.close();
    console.log(`\nLeçons : ${stats.courses} | ressources : ${stats.found} | téléchargés : ${stats.downloaded} | déjà présents : ${stats.skipped} | erreurs : ${stats.errors}`);
    console.log(`PDF dans : ${OUT_DIR}`);
  }
})();
