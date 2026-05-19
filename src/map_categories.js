/**
 * Map Moodle course IDs to their categories (Terminale A / D)
 * by navigating the category tree
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    defaultViewport: { width: 1366, height: 900 },
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // Login
  console.log('🔐 Login...');
  await page.goto('https://ecole-ci.org/co/loginvisiteur.php', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const phoneInput = await page.$('#telephone');
  if (phoneInput) {
    await phoneInput.click({ clickCount: 3 });
    await phoneInput.type('0700000001', { delay: 50 });
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('#submit, button[name="submit"]').catch(() => page.evaluate(() => document.querySelector('#formlogin')?.submit())),
  ]);
  await sleep(2000);
  if (page.url().includes('login')) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      page.click('#submit, button[name="submit"]').catch(() => page.evaluate(() => document.querySelector('#formlogin')?.submit())),
    ]);
    await sleep(3000);
  }
  console.log('✅ Logged in:', page.url());

  // Navigate to course catalog
  await page.goto('https://lyc.ecole-ci.org/course/', { waitUntil: 'networkidle2' });
  await sleep(2000);

  // Get all top-level category links
  const topCats = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')]
      .map(a => ({ text: a.textContent.trim(), href: a.href }))
      .filter(a => a.text.length > 0);
  });
  console.log('📂 Top categories:', topCats.length);
  topCats.forEach(c => console.log(`  ${c.text} → ${c.href}`));

  // Find Terminale categories
  const tleCats = topCats.filter(c => c.text.match(/terminale|tle/i));
  console.log('\n🎯 Terminale categories:', tleCats.length);
  tleCats.forEach(c => console.log(`  ${c.text}`));

  // For each Terminale category, recursively explore subcategories and get course IDs
  const courseMap = {}; // courseId -> { class, subject, courseName }
  
  async function exploreCategory(catUrl, classLabel, depth = 0) {
    try {
      await page.goto(catUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(1000);
      
      const currentCatId = catUrl.split('categoryid=')[1] || '';
      const info = await page.evaluate((excludeId) => ({
        title: document.querySelector('h2, .page-header-headings h1')?.textContent?.trim() || '',
        courses: [...document.querySelectorAll('a[href*="/course/view.php?id="]')]
          .map(a => ({ text: a.textContent.trim().substring(0, 200), href: a.href, id: new URL(a.href).searchParams.get('id') })),
        subCats: [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')]
          .map(a => ({ text: a.textContent.trim(), href: a.href }))
          .filter(a => a.text.length > 0 && !a.href.includes('categoryid=' + excludeId)),
      }), currentCatId);
      
      const indent = '  '.repeat(depth);
      console.log(`${indent}📂 ${info.title || classLabel}: ${info.courses.length} cours, ${info.subCats.length} sous-cat`);
      
      // Map courses
      for (const course of info.courses) {
        courseMap[course.id] = { class: classLabel, course: course.text, url: course.href };
      }
      
      // Explore subcategories
      for (const sub of info.subCats) {
        // Determine subject from subcategory name
        await exploreCategory(sub.href, classLabel, depth + 1);
      }
    } catch (e) {
      console.log(`❌ Error exploring ${catUrl}: ${e.message}`);
    }
  }

  // If no direct Terminale categories found, explore all top categories to find them
  if (tleCats.length === 0) {
    console.log('\n🔍 Looking deeper for Terminale categories...');
    for (const cat of topCats) {
      await page.goto(cat.href, { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(1000);
      const subCats = await page.evaluate(() => {
        return [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')]
          .map(a => ({ text: a.textContent.trim(), href: a.href }))
          .filter(a => a.text.length > 0);
      });
      console.log(`  📂 ${cat.text}: ${subCats.length} sous-catégories`);
      subCats.forEach(s => console.log(`    → ${s.text}`));
      
      const tleSubCats = subCats.filter(s => s.text.match(/terminale|tle/i));
      for (const ts of tleSubCats) {
        tleCats.push(ts);
      }
    }
  }

  console.log('\n🎯 All Terminale categories found:', tleCats.length);
  tleCats.forEach(c => console.log(`  ${c.text} → ${c.href}`));

  // Explore the TERMINALE category to find A, C, D subcategories
  for (const cat of tleCats) {
    console.log(`\n🔍 Exploring: ${cat.text} → ${cat.href}`);
    await page.goto(cat.href, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1500);
    
    // Get subcategories under TERMINALE (should be A, C, D)
    const subCats = await page.evaluate(() => {
      return [...document.querySelectorAll('a[href*="course/index.php?categoryid="]')]
        .map(a => ({ text: a.textContent.trim(), href: a.href }))
        .filter(a => a.text.length > 0);
    });
    
    console.log(`📂 Sous-catégories de ${cat.text}:`);
    subCats.forEach(s => console.log(`  → ${s.text} : ${s.href}`));
    
    // Only explore Terminale A and D
    for (const sub of subCats) {
      const t = sub.text.toUpperCase();
      let label = null;
      if (t.includes('TERMINALE A') || t === 'A' || t.match(/^TLE\s*A/) || t.match(/TERMINALE\s+A/)) label = 'Tle_A';
      else if (t.includes('TERMINALE D') || t === 'D' || t.match(/^TLE\s*D/) || t.match(/TERMINALE\s+D/)) label = 'Tle_D';
      
      if (label) {
        console.log(`\n🎯 Exploring ${label}: ${sub.text}`);
        await exploreCategory(sub.href, label, 1);
      }
    }
  }

  // Save mapping
  fs.writeFileSync(path.join(DATA_DIR, 'course_category_map.json'), JSON.stringify(courseMap, null, 2));
  console.log(`\n✅ ${Object.keys(courseMap).length} cours mappés`);
  console.log(`📁 Sauvegardé dans data/course_category_map.json`);

  // Show summary
  const byClass = {};
  for (const [id, info] of Object.entries(courseMap)) {
    byClass[info.class] = (byClass[info.class] || 0) + 1;
  }
  console.log('\n📊 Résumé:');
  Object.entries(byClass).forEach(([k, v]) => console.log(`  ${k}: ${v} cours`));

  await sleep(2000);
  await browser.close();
})();
