/**
 * Map Moodle courses to Terminale A / D categories
 * Uses breadcrumb-based approach to avoid infinite loops
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

  const courseMap = {};
  const visited = new Set();

  // Known category IDs from previous run:
  // TERMINALE A = categoryid=9
  // TERMINALE D = categoryid=11
  const targets = [
    { catId: 9, label: 'Tle_A' },
    { catId: 11, label: 'Tle_D' },
  ];

  for (const target of targets) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎯 ${target.label} (categoryid=${target.catId})`);
    console.log('='.repeat(60));

    // Navigate to category page
    const catUrl = `https://lyc.ecole-ci.org/course/index.php?categoryid=${target.catId}`;
    await page.goto(catUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Get subcategories (subjects) - only direct children
    // Use the category listing which shows subcategories with their IDs
    const subCats = await page.evaluate((parentCatId) => {
      const results = [];
      // Look for category links that are NOT the parent
      const links = document.querySelectorAll('.category a[href*="categoryid="], .subcategories a[href*="categoryid="], .content a[href*="categoryid="]');
      const seen = new Set();
      for (const a of links) {
        const href = a.href;
        const match = href.match(/categoryid=(\d+)/);
        if (match) {
          const catId = match[1];
          if (catId !== String(parentCatId) && !seen.has(catId) && a.textContent.trim().length > 0) {
            seen.add(catId);
            results.push({ text: a.textContent.trim(), catId, href });
          }
        }
      }
      return results;
    }, target.catId);

    // Filter to only child categories (subjects under this class)
    // Exclude parent categories (2=SECONDE, 5=PREMIERE, 8=TERMINALE, 10=TLE C, 193=BAC)
    const parentIds = ['2', '5', '8', '10', '193', String(target.catId)];
    // Also exclude sibling Terminale categories
    const siblingIds = targets.map(t => String(t.catId));
    const excludeIds = new Set([...parentIds, ...siblingIds]);
    
    const childCats = subCats.filter(s => !excludeIds.has(s.catId));
    
    console.log(`📂 Matières trouvées: ${childCats.length}`);
    childCats.forEach(c => console.log(`  📚 ${c.text} (id=${c.catId})`));

    // For each subject category, get all courses
    for (const subject of childCats) {
      if (visited.has(subject.catId)) continue;
      visited.add(subject.catId);

      console.log(`\n  📚 ${subject.text}...`);
      await page.goto(subject.href, { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(1500);

      // Get all courses on this page
      const courses = await page.evaluate(() => {
        return [...document.querySelectorAll('a[href*="/course/view.php?id="]')]
          .map(a => {
            const id = new URL(a.href).searchParams.get('id');
            return { text: a.textContent.trim().substring(0, 250), id, href: a.href };
          })
          .filter(c => c.text.length > 0 && c.id);
      });

      console.log(`     ${courses.length} cours`);

      for (const course of courses) {
        courseMap[course.id] = {
          class: target.label,
          subject: subject.text,
          course: course.text,
          url: course.href,
        };
      }

      // Check for sub-subcategories (some subjects have further breakdown)
      const subSubCats = await page.evaluate((excludeList) => {
        const results = [];
        const seen = new Set();
        const links = document.querySelectorAll('a[href*="categoryid="]');
        for (const a of links) {
          const match = a.href.match(/categoryid=(\d+)/);
          if (match && !excludeList.includes(match[1]) && !seen.has(match[1]) && a.textContent.trim().length > 0) {
            seen.add(match[1]);
            results.push({ text: a.textContent.trim(), catId: match[1], href: a.href });
          }
        }
        return results;
      }, [...excludeIds, subject.catId, ...childCats.map(c => c.catId)]);

      for (const subSub of subSubCats) {
        if (visited.has(subSub.catId)) continue;
        visited.add(subSub.catId);

        console.log(`     📁 ${subSub.text}...`);
        await page.goto(subSub.href, { waitUntil: 'networkidle2', timeout: 15000 });
        await sleep(1000);

        const subCourses = await page.evaluate(() => {
          return [...document.querySelectorAll('a[href*="/course/view.php?id="]')]
            .map(a => {
              const id = new URL(a.href).searchParams.get('id');
              return { text: a.textContent.trim().substring(0, 250), id, href: a.href };
            })
            .filter(c => c.text.length > 0 && c.id);
        });

        console.log(`        ${subCourses.length} cours`);
        for (const course of subCourses) {
          courseMap[course.id] = {
            class: target.label,
            subject: subject.text,
            course: course.text,
            url: course.href,
          };
        }
      }
    }
  }

  // Save mapping
  fs.writeFileSync(path.join(DATA_DIR, 'course_category_map.json'), JSON.stringify(courseMap, null, 2));
  
  // Summary
  const byClass = {};
  const bySubject = {};
  for (const [id, info] of Object.entries(courseMap)) {
    byClass[info.class] = (byClass[info.class] || 0) + 1;
    const key = `${info.class} > ${info.subject}`;
    bySubject[key] = (bySubject[key] || 0) + 1;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RÉSUMÉ');
  console.log('='.repeat(60));
  console.log(`Total: ${Object.keys(courseMap).length} cours mappés\n`);
  Object.entries(byClass).forEach(([k, v]) => console.log(`  ${k}: ${v} cours`));
  console.log('\nDétail par matière:');
  Object.entries(bySubject).sort().forEach(([k, v]) => console.log(`  ${k}: ${v} cours`));

  await sleep(2000);
  await browser.close();
  console.log('\n✅ Terminé! → data/course_category_map.json');
})();
