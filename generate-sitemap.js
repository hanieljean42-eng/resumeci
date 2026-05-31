const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://resumeci.me';
const TODAY = new Date().toISOString().split('T')[0];

// Lire le fichier structure.json
const structurePath = path.join(__dirname, 'public', 'data', 'structure.json');
const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'));

let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- Page d'accueil -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Quiz et Flashcards -->
  <url>
    <loc>${BASE_URL}/quiz.html</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/flashcards.html</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

`;

// Parcourir toutes les classes et matières
for (const [className, subjects] of Object.entries(structure)) {
  for (const [subject, fiches] of Object.entries(subjects)) {
    if (Array.isArray(fiches) && fiches.length > 0) {
      for (const fiche of fiches) {
        if (fiche.url) {
          sitemap += `  <url>
    <loc>${BASE_URL}${fiche.url}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
        }
      }
    }
  }
}

sitemap += '</urlset>';

// Écrire le fichier sitemap.xml
const sitemapPath = path.join(__dirname, 'public', 'sitemap.xml');
fs.writeFileSync(sitemapPath, sitemap);

console.log(`✅ Sitemap générée : ${sitemapPath}`);
console.log(`📊 Nombre total de fiches indexées : ${structure.stats?.totalFiches || 'calcul en cours...'}`);
