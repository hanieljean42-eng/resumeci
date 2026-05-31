/**
 * 📚 RésuméCI — Scraper ecole-ci.org pour 3ème (v2 rapide)
 * - Inscription + connexion automatique
 * - Exploration ciblée (TROISIEME uniquement)
 * - Téléchargement direct des PDFs
 * - Logs de progression en temps réel
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const CONFIG = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  baseUrl: 'https://ecole-ci.org',
  loginUrl: 'https://ecole-ci.org/co/loginvisiteur.php',
  registerUrl: 'https://ecole-ci.org/co/inscriptionvisiteur.php',
  collegeUrl: 'https://coll.ecole-ci.org',
  troisiemeCategoryId: '3', // categoryid=3 pour TROISIEME
  outputDir: path.join(__dirname, '..', 'Cours_3eme'),
  dataDir: path.join(__dirname, '..', 'data_3eme'),
  visitor: { phone: '0700000003', lastname: 'Bamba', firstname: 'Fatoumata', genre: 'Féminin', age: '10 à 14 ans', pays: "Côte d'Ivoire", niveau: 'Collège', classe: '3ème' },
  headless: false,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = name => name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 120);
const ensureDir = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
const log = (emoji, msg) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${emoji} ${msg}`);

const SUBJECT_MAP = {
  'français': 'Francais', 'francais': 'Francais',
  'mathématiques': 'Mathematiques', 'mathematiques': 'Mathematiques', 'math': 'Mathematiques',
  'physique-chimie': 'Physique-Chimie', 'physique chimie': 'Physique-Chimie', 'pc': 'Physique-Chimie', 'physique': 'Physique-Chimie', 'chimie': 'Physique-Chimie',
  'svt': 'SVT', 'sciences de la vie': 'SVT', 'biologie': 'SVT',
  'histoire-géographie': 'Histoire-Geographie', 'histoire géographie': 'Histoire-Geographie', 'hg': 'Histoire-Geographie', 'histoire': 'Histoire-Geographie', 'géographie': 'Histoire-Geographie',
  // EDHC : ajouter plusieurs variantes pour être robuste aux accents / apostrophes
  'edhc': 'EDHC', 'civisme': 'EDHC', 'civique': 'EDHC', 'instruction civique': 'EDHC',
  'droits de l\'homme': 'EDHC',
  'education aux droits': 'EDHC', 'éducation aux droits': 'EDHC',
  'citoyenneté': 'EDHC', 'citoyennete': 'EDHC',
  'eps': 'EPS', 'éducation physique': 'EPS', 'sport': 'EPS',
  'technologie': 'TIC', 'informatique': 'TIC', 'tic': 'TIC',
};

const EXCLUDED = ['arts plastiques', 'art plastique', 'musique', 'education musicale', 'éducation musicale', 'anglais', 'english'];

function detectSubject(text) {
  const t = text.toLowerCase();
  // Cas particuliers EDHC : formules longues comme "Education aux droits de l'homme et à la citoyenneté"
  if (t.includes('droits de l') || t.includes('citoyenneté') || t.includes('citoyennete')) {
    return 'EDHC';
  }
  for (const [key, val] of Object.entries(SUBJECT_MAP)) {
    if (t.includes(key)) return val;
  }
  return null;
}

function isExcluded(text) {
  const t = text.toLowerCase();
  return EXCLUDED.some(e => t.includes(e));
}

async function downloadPDF(url, outputPath, cookies) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cookieStr = (cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
      const resp = await axios({ method: 'GET', url, responseType: 'arraybuffer', timeout: 30000,
        headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0', 'Referer': CONFIG.collegeUrl },
        maxRedirects: 5, httpsAgent });
      if (resp.data.length < 500) return 0; // trop petit = pas un vrai PDF
      fs.writeFileSync(outputPath, resp.data);
      return resp.data.length;
    } catch (e) {
      if (attempt === 3) return 0;
      await sleep(2000);
    }
  }
  return 0;
}

async function goWithRetry(page, url, maxRetries = 3) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(800);
      return true;
    } catch (e) {
      log('⚠️', `Tentative ${i}/${maxRetries} échouée: ${url.substring(0, 80)}`);
      if (i === maxRetries) return false;
      await sleep(3000);
    }
  }
  return false;
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

(async () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('  📚 SCRAPER 3ÈME v2 — Rapide & Efficace');
  console.log('══════════════════════════════════════════════\n');

  ensureDir(CONFIG.outputDir);
  ensureDir(CONFIG.dataDir);

  // 1. Lancer Chrome
  log('🚀', 'Lancement Chrome...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper3v2_'));
  const browser = await puppeteer.launch({
    executablePath: CONFIG.chromePath,
    headless: CONFIG.headless,
    userDataDir: tmpDir,
    defaultViewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-web-security'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('dialog', async d => { await d.accept(); });
  log('✅', 'Chrome prêt');

  try {
    // 2. Inscription
    log('📝', 'Inscription visiteur...');
    await goWithRetry(page, CONFIG.registerUrl);
    await sleep(1500);
    try {
      await page.select('#niveauenseignement', CONFIG.visitor.niveau);
      await sleep(2000);
      const classes = await page.evaluate(() => [...document.querySelector('#classe').options].map(o => ({ value: o.value, text: o.text })));
      const cls3 = classes.find(c => c.text.toLowerCase().includes('troisi') || c.text.includes('3'));
      if (cls3) await page.select('#classe', cls3.value);
      await sleep(500);
      await page.type('#lastname', CONFIG.visitor.lastname, { delay: 30 });
      await page.type('#firstname', CONFIG.visitor.firstname, { delay: 30 });
      await page.select('#genre', CONFIG.visitor.genre);
      await page.select('#ages', CONFIG.visitor.age);
      await page.select('#pays', CONFIG.visitor.pays);
      const villeInput = await page.$('#autoComplete');
      if (villeInput) { await villeInput.click(); await villeInput.type('Abidjan', { delay: 50 }); await sleep(1500);
        const r = await page.$('.autoComplete_result, [class*="autoComplete"] li');
        if (r) await r.click(); else await page.evaluate(() => { const i = document.querySelector('#autoComplete'); if(i) i.value = 'Abidjan - Cocody'; });
      }
      const ph = await page.$('#telephone');
      if (ph) { await ph.click({ clickCount: 3 }); await ph.type(CONFIG.visitor.phone, { delay: 30 }); }
      const ur = await page.$('#zoneurbaine'); if (ur) await ur.click();
      const pu = await page.$('#ecolepublic'); if (pu) await pu.click();
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
        page.click('input[name="submit"], button[name="submit"], button.btn-success, input.btn-success').catch(() => page.evaluate(() => document.querySelector('#authentification')?.submit())),
      ]);
      await sleep(2000);
      log('✅', 'Inscription OK');
    } catch (e) { log('⚠️', `Inscription: ${e.message.substring(0, 60)}`); }

    // 3. Connexion (2 étapes : valider le téléphone puis se connecter)
    log('🔑', 'Connexion...');
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2000);

    // Étape 1 : saisir le numéro et cliquer "Je me connecte"
    const phoneInput = await page.$('#telephone, input[name="telephone"]');
    if (phoneInput) {
      await phoneInput.click({ clickCount: 3 });
      await phoneInput.type(CONFIG.visitor.phone, { delay: 50 });
    }
    log('📞', `Numéro saisi: ${CONFIG.visitor.phone}`);

    // Premier clic → valide le numéro
    await page.click('#submit, button[name="submit"], input[type="submit"], .btn-success').catch(() =>
      page.evaluate(() => { const f = document.querySelector('form'); if (f) f.submit(); })
    );
    await sleep(3000);
    log('📷', 'Étape 1 OK (validation du numéro)');

    // Étape 2 : recliquer "Je me connecte" sur la MÊME page (sans recharger)
    await page.click('#submit, button[name="submit"], input[type="submit"], .btn-success').catch(() =>
      page.evaluate(() => { const f = document.querySelector('form'); if (f) f.submit(); })
    );
    await sleep(5000);
    await page.screenshot({ path: path.join(CONFIG.dataDir, 'debug_login_final.png'), fullPage: true });
    log('📷', `URL après login: ${page.url()}`);

    // Vérifier si on a quitté la page de login
    if (page.url().includes('login')) {
      // 3ème essai avec navigation
      log('🔄', 'Re-tentative complète...');
      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
          page.click('#submit, button[name="submit"], input[type="submit"], .btn-success').catch(() => {}),
        ]);
      } catch(e) {}
      await sleep(3000);
      log('📷', `URL finale: ${page.url()}`);
    }

    const loggedIn = !page.url().includes('login');
    log(loggedIn ? '✅' : '⚠️', loggedIn ? 'CONNECTÉ !' : 'Login incertain, on continue quand même...');

    // Naviguer vers le site collège pour établir la session
    log('🌐', 'Navigation vers coll.ecole-ci.org...');
    await page.goto(CONFIG.collegeUrl + '/course/', { waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(2000);
    const cookies = await page.cookies();
    fs.writeFileSync(path.join(CONFIG.dataDir, 'cookies.json'), JSON.stringify(cookies, null, 2));
    await page.screenshot({ path: path.join(CONFIG.dataDir, 'debug_college.png'), fullPage: true });
    log('📷', `URL college: ${page.url()}`);

    // 4. Explorer la catégorie TROISIEME
    log('🏫', 'Exploration TROISIÈME...');
    const catUrl = `${CONFIG.collegeUrl}/course/index.php?categoryid=${CONFIG.troisiemeCategoryId}`;
    if (!await goWithRetry(page, catUrl)) { log('❌', 'Impossible d\'accéder à la catégorie 3ème'); await browser.close(); return; }
    await sleep(1500);

    // Récupérer les sous-catégories (matières) ET les cours directs
    const pageData = await page.evaluate(() => {
      const cats = [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
        text: (a.textContent || '').trim(), href: a.href
      })).filter(l => l.text.length > 1 && l.text.length < 100);
      const courses = [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
        text: (a.textContent || '').trim(), href: a.href
      })).filter(l => l.text.length > 1);
      return { cats, courses };
    });

    // Filtrer les sous-catégories : exclure les autres niveaux
    const otherLevels = ['sixième', 'sixieme', '6ème', '6eme', 'cinquième', 'cinquieme', '5ème', '5eme', 'quatrième', 'quatrieme', '4ème', '4eme', 'bepc'];
    const subCategories = pageData.cats.filter(c => {
      const t = c.text.toLowerCase();
      return !otherLevels.some(lvl => t.includes(lvl));
    });

    log('📋', `${subCategories.length} sous-catégories + ${pageData.courses.length} cours directs`);
    subCategories.forEach(c => log('  📁', c.text));
    pageData.courses.forEach(c => log('  📄', c.text.substring(0, 60)));

    // 5. Collecter tous les cours (EDHC uniquement)
    const allCourses = [];
    const visitedCats = new Set([catUrl]);
    const visitedCourses = new Set();

    // Ajouter les cours directs de la page catégorie (filtrés EDHC)
    for (const c of pageData.courses) {
      if (visitedCourses.has(c.href) || isExcluded(c.text)) continue;
      visitedCourses.add(c.href);
      const subject = detectSubject(c.text) || 'Autres';
      if (subject !== 'EDHC') continue;
      allCourses.push({ ...c, subject });
    }

    // Explorer les sous-catégories (1 niveau + sous-sous-catégories)
    for (const subCat of subCategories) {
      if (visitedCats.has(subCat.href) || isExcluded(subCat.text)) continue;
      visitedCats.add(subCat.href);
      const subject = detectSubject(subCat.text);
      if (!subject) { log('⏭️', `  Skip: ${subCat.text}`); continue; }

      log('📖', `  ${subject} (${subCat.text})...`);
      if (!await goWithRetry(page, subCat.href)) continue;

      const subData = await page.evaluate(() => ({
        courses: [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
          text: (a.textContent || '').trim(), href: a.href
        })).filter(l => l.text.length > 1),
        subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')].map(a => ({
          text: (a.textContent || '').trim(), href: a.href
        })).filter(l => l.text.length > 1 && l.text.length < 100),
      }));

      let count = 0;
      for (const c of subData.courses) {
        if (visitedCourses.has(c.href) || isExcluded(c.text)) continue;
        visitedCourses.add(c.href);
        const cSubject = detectSubject(c.text) || subject;
        if (cSubject !== 'EDHC') continue;
        allCourses.push({ ...c, subject: cSubject });
        count++;
      }
      log('  ', `  → ${count} cours`);

      // Sous-sous-catégories (1 niveau de plus)
      for (const subSub of subData.subCats) {
        if (visitedCats.has(subSub.href) || isExcluded(subSub.text)) continue;
        const t = subSub.text.toLowerCase();
        if (otherLevels.some(lvl => t.includes(lvl))) continue;
        visitedCats.add(subSub.href);
        const subSubject = detectSubject(subSub.text) || subject;

        log('  📂', `  ${subSub.text}...`);
        if (!await goWithRetry(page, subSub.href)) continue;

        const deepCourses = await page.evaluate(() =>
          [...document.querySelectorAll('a[href*="/course/view.php"]')].map(a => ({
            text: (a.textContent || '').trim(), href: a.href
          })).filter(l => l.text.length > 1)
        );
        let deepCount = 0;
        for (const c of deepCourses) {
          if (visitedCourses.has(c.href) || isExcluded(c.text)) continue;
          visitedCourses.add(c.href);
          const cSubject = detectSubject(c.text) || subSubject;
          if (cSubject !== 'EDHC') continue;
          allCourses.push({ ...c, subject: cSubject });
          deepCount++;
        }
        if (deepCount > 0) log('  ', `    → ${deepCount} cours`);
      }
    }

    log('📚', `TOTAL: ${allCourses.length} cours à explorer`);
    fs.writeFileSync(path.join(CONFIG.dataDir, 'courses_list.json'), JSON.stringify(allCourses, null, 2));

    // 6. Explorer chaque cours pour trouver les PDFs
    const pdfLinks = [];
    for (let i = 0; i < allCourses.length; i++) {
      const course = allCourses[i];
      log('🔍', `[${i + 1}/${allCourses.length}] ${course.subject}: ${course.text.substring(0, 60)}`);

      if (!await goWithRetry(page, course.href)) continue;

      const resources = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/pluginfile.php"], a[href*="/mod/resource/view.php"], a[href*=".pdf"]')].map(a => ({
          text: (a.textContent || '').trim(), href: a.href,
        })).filter(l => l.href && l.text.length > 0)
      );

      for (const res of resources) {
        if (isExcluded(res.text)) continue;
        pdfLinks.push({ url: res.href, text: res.text, course: course.text, subject: course.subject });
      }
      if (resources.length > 0) log('  ', `  → ${resources.length} ressource(s)`);
    }

    log('📄', `TOTAL: ${pdfLinks.length} PDF(s) trouvés`);
    fs.writeFileSync(path.join(CONFIG.dataDir, 'cours_index.json'), JSON.stringify(pdfLinks, null, 2));

    // 7. Télécharger les PDFs
    if (pdfLinks.length === 0) { log('📭', 'Aucun PDF trouvé !'); await browser.close(); return; }

    log('📥', `Téléchargement de ${pdfLinks.length} PDF(s)...`);
    let downloaded = 0, errors = 0, skipped = 0;

    for (let i = 0; i < pdfLinks.length; i++) {
      const pdf = pdfLinks[i];
      const subjectDir = path.join(CONFIG.outputDir, sanitize(pdf.subject));
      ensureDir(subjectDir);
      const fileName = sanitize(pdf.course || pdf.text || `cours_${i + 1}`) + '.pdf';
      const outputPath = path.join(subjectDir, fileName);

      if (fs.existsSync(outputPath)) { skipped++; continue; }

      log('📥', `[${i + 1}/${pdfLinks.length}] ${pdf.subject}/${fileName}`);
      const size = await downloadPDF(pdf.url, outputPath, cookies);
      if (size > 0) { downloaded++; } else { errors++; }
      await sleep(500);
    }

    // 8. Rapport
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║        📊 RAPPORT FINAL - 3ÈME          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║ 📚 Cours explorés: ${allCourses.length}`);
    console.log(`║ 📄 PDFs trouvés:   ${pdfLinks.length}`);
    console.log(`║ ✅ Téléchargés:    ${downloaded}`);
    console.log(`║ ⏭️  Déjà existants: ${skipped}`);
    console.log(`║ ❌ Erreurs:        ${errors}`);
    console.log('╚══════════════════════════════════════════╝');

    fs.writeFileSync(path.join(CONFIG.dataDir, 'final_stats.json'), JSON.stringify({ courses: allCourses.length, pdfs: pdfLinks.length, downloaded, skipped, errors }, null, 2));

  } catch (e) {
    log('❌', `ERREUR FATALE: ${e.message}`);
  } finally {
    await sleep(3000);
    await browser.close();
    log('🔒', 'Chrome fermé');
  }
})();
