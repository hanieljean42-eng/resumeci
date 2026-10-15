// Génère public/flyer-miage.html — flyers découpables Licence 1 MIAGE
// Réutilise le design + les 3 QR codes (site, WhatsApp, TikTok) de promo-flyers.html
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'promo-flyers.html');
const OUT = path.join(ROOT, 'public', 'flyer-miage.html');

const src = fs.readFileSync(SRC, 'utf8');

// 1) CSS : réutiliser tout le bloc <style> de promo-flyers.html
const css = src.match(/<style>([\s\S]*?)<\/style>/)[1];

// 2) QR codes : les 3 data URIs uniques, dans l'ordre (web, whatsapp, tiktok)
const qrSet = new Set();
for (const m of src.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)) qrSet.add(m[1]);
const [QR_WEB, QR_WA, QR_TIKTOK] = [...qrSet];
if (!QR_WEB || !QR_WA || !QR_TIKTOK) throw new Error('QR codes introuvables');

function qrTrio() {
  return `
          <div class="card-qr-trio">
            <a href="https://resumeci.me" target="_blank" rel="noopener noreferrer" class="qr-ticket-col col-web" title="Scanner ou cliquer pour visiter resumeci.me">
              <span class="qr-ticket-badge badge-web"><i class="fas fa-globe"></i> SITE WEB</span>
              <div class="qr-container">
                <img class="qr-img" src="data:image/png;base64,${QR_WEB}">
              </div>
              <div class="qr-ticket-footer">
                <span class="qr-scan-hint">↑ Scannez</span>
                <span class="qr-target-url url-web">resumeci.me</span>
              </div>
            </a>
            <a href="https://wa.me/2250104911010" target="_blank" rel="noopener noreferrer" class="qr-ticket-col col-wa" title="Scanner ou cliquer pour discuter sur WhatsApp au 0104911010">
              <span class="qr-ticket-badge badge-wa"><i class="fab fa-whatsapp"></i> WHATSAPP</span>
              <div class="qr-container">
                <img class="qr-img" src="data:image/png;base64,${QR_WA}">
              </div>
              <div class="qr-ticket-footer">
                <span class="qr-scan-hint">↑ Écrivez-nous</span>
                <span class="qr-target-url url-wa">01 04 91 10 10</span>
              </div>
            </a>
            <a href="https://tiktok.com/@resumeci00" target="_blank" rel="noopener noreferrer" class="qr-ticket-col col-tiktok" title="Scanner ou cliquer pour voir les vidéos TikTok">
              <span class="qr-ticket-badge badge-tiktok"><i class="fab fa-tiktok"></i> TIKTOK</span>
              <div class="qr-container">
                <img class="qr-img" src="data:image/png;base64,${QR_TIKTOK}">
              </div>
              <div class="qr-ticket-footer">
                <span class="qr-scan-hint">↑ Suivez</span>
                <span class="qr-target-url url-tiktok">@resumeci00</span>
              </div>
            </a>
          </div>`;
}

function card({ theme, icon, name, sub, badge, title, lines, punch }) {
  return `
        <div class="flyer-card theme-${theme}">
          <div class="card-pill-header">
            <div class="cph-brand">
              <span class="cph-icon">${icon}</span>
              <div class="cph-titles">
                <span class="cph-name" contenteditable="true">${name}</span>
                <span class="cph-sub" contenteditable="true">${sub}</span>
              </div>
            </div>
            <span class="cph-badge">${badge}</span>
          </div>
          <div class="card-info-box" contenteditable="true">
            <div class="cib-title">${title}</div>
            ${lines.map(l => `<div class="cib-line">${l}</div>`).join('\n            ')}
          </div>
          <div class="card-footer-box">
            <span class="cfb-badge" contenteditable="true">EN PLUS</span>
            <span class="cfb-punchline" contenteditable="true">${punch}</span>
          </div>
${qrTrio()}
        </div>`;
}

const PAGE1 = [
  card({
    theme: 'indigo', icon: '🎓', name: 'ResumeCI • Licence 1 MIAGE',
    sub: 'Université — Côte d\u2019Ivoire', badge: 'Nouveau',
    title: 'Ta Licence 1 MIAGE, entièrement résumée :',
    lines: [
      '<strong>21 matières</strong> couvertes — Semestre 1 &amp; Semestre 2.',
      '<strong>78 fiches de résumé</strong> rédigées chapitre par chapitre.',
      '<strong>450 questions de quiz</strong> avec corrigés détaillés.'
    ],
    punch: 'Fiches, quiz, flashcards, audio — tout hors-ligne.'
  }),
  card({
    theme: 'blue', icon: '📐', name: 'Semestre 1',
    sub: 'Les matières du premier semestre', badge: 'S1',
    title: 'Semestre 1 — Ce qui t\u2019attend :',
    lines: [
      'Analyse 1 · Algèbre · Algorithme de base',
      'ATO · Systèmes d\u2019exploitation · Macro &amp; Microéconomie',
      'Technique d\u2019expression · Développement personnel'
    ],
    punch: 'Chaque chapitre du cours a sa fiche dédiée.'
  }),
  card({
    theme: 'emerald', icon: '💻', name: 'Semestre 2',
    sub: 'Programmation, maths &amp; gestion', badge: 'S2',
    title: 'Semestre 2 — Ce qui t\u2019attend :',
    lines: [
      'Analyse 2 · Algèbre 2 · Statistiques · Probas',
      'Python · Langage C · Merise · Prog web (CSS)',
      'Maths &amp; Gestion financière · Gestion de projet · Droit'
    ],
    punch: 'Même les matières ajoutées en cours d\u2019année.'
  }),
  card({
    theme: 'purple', icon: '❓', name: 'Quiz d\u2019entraînement',
    sub: 'Teste-toi sur chaque leçon', badge: '450 Q',
    title: 'Révise comme à l\u2019examen :',
    lines: [
      '<strong>450 questions</strong> QCM + Vrai/Faux corrigées.',
      'Une <strong>explication pédagogique</strong> à chaque réponse.',
      'Ciblées sur les <strong>pièges d\u2019examen</strong> de chaque chapitre.'
    ],
    punch: '5 questions par fiche — valide chaque leçon en 5 min.'
  }),
  card({
    theme: 'teal', icon: '🎧', name: 'Audio &amp; Hors-ligne',
    sub: 'Révise partout, même sans réseau', badge: 'PWA',
    title: 'Tes cours dans la poche :',
    lines: [
      '<strong>Écoute</strong> tes fiches en mode audio.',
      'Installe l\u2019app sur ton <strong>écran d\u2019accueil</strong>.',
      'Fonctionne <strong>hors-ligne</strong> après le 1er chargement.'
    ],
    punch: 'Parfait dans le bus ou en déplacement.'
  }),
  card({
    theme: 'rose', icon: '⚠️', name: 'Pièges d\u2019Examen',
    sub: 'Ce que 80% des étudiants ratent', badge: 'Bonus',
    title: 'Gagne des points facilement :',
    lines: [
      'Chaque fiche liste les <strong>pièges classiques</strong> du chapitre.',
      'Confusions fréquentes <strong>expliquées simplement</strong>.',
      'Formules et définitions clés <strong>mises en avant</strong>.'
    ],
    punch: 'Le correcteur teste toujours les mêmes erreurs.'
  })
];

const PAGE2 = [
  card({
    theme: 'amber', icon: '💰', name: 'Pass Pro • 1 000 F/mois',
    sub: 'La formule réussite totale', badge: 'Pro',
    title: 'Débloque tout le contenu L1 MIAGE :',
    lines: [
      'Accès illimité aux <strong>78 fiches + 450 quiz</strong>.',
      'Audio, flashcards, statistiques de progression.',
      'Paiement <strong>Wave, Orange, MTN ou Moov</strong>.'
    ],
    punch: 'Pass Starter 500 F — l\u2019essentiel pour réviser.'
  }),
  card({
    theme: 'orange', icon: '📱', name: 'Installe l\u2019Application',
    sub: 'Sans passer par Play Store', badge: '1 clic',
    title: 'ResumeCI sur ton téléphone :',
    lines: [
      'Ouvre <strong>resumeci.me</strong> dans ton navigateur.',
      'Menu ⋮ → « Ajouter à l\u2019écran d\u2019accueil ».',
      'L\u2019app se lance comme une vraie application.'
    ],
    punch: 'Révise même sans connexion internet.'
  }),
  card({
    theme: 'green', icon: '💬', name: 'Communauté WhatsApp',
    sub: 'Chaîne officielle ResumeCI', badge: 'Rejoins',
    title: 'Ne révise plus seul :',
    lines: [
      'Annonces des <strong>nouvelles fiches et matières</strong>.',
      'Astuces de révision chaque semaine.',
      'Pose tes <strong>questions</strong> directement à l\u2019équipe.'
    ],
    punch: 'Rejoins la communauté d\u2019étudiants connectés.'
  }),
  card({
    theme: 'cyan', icon: '🎬', name: 'ResumeCI sur TikTok',
    sub: '@resumeci00 — révisions en 60 s', badge: 'Vidéos',
    title: 'Apprends en regardant :',
    lines: [
      'Astuces mémo et révisions <strong>express en vidéo</strong>.',
      'Quiz interactifs et corrigés.',
      '1 jour = 1 astuce pour tes <strong>partiels</strong>.'
    ],
    punch: 'Scanne le QR et abonne-toi gratuitement.'
  }),
  card({
    theme: 'indigo', icon: '🏆', name: 'Objectif Mention',
    sub: 'L1 MIAGE validée du premier coup', badge: 'Mention',
    title: 'La méthode des premiers de promo :',
    lines: [
      '<strong>1 fiche + 1 quiz par jour</strong> = tout le programme.',
      'Révision active : teste-toi au lieu de relire.',
      'Suis ta <strong>progression</strong> avec les statistiques.'
    ],
    punch: 'Vise la mention aux partiels de S1 et S2.'
  }),
  card({
    theme: 'purple', icon: '👨‍💻', name: 'Par Haniel_dev',
    sub: 'Créé pour les étudiants ivoiriens', badge: 'Made in CI',
    title: 'Une question sur un cours ?',
    lines: [
      'Écris-nous sur WhatsApp au <strong>01 04 91 10 10</strong>.',
      'Assistance directe pour les étudiants.',
      'Suggère la <strong>prochaine matière</strong> à résumer.'
    ],
    punch: 'ResumeCI — par des Ivoiriens, pour les Ivoiriens.'
  })
];

const html = `<!DOCTYPE html><html lang="fr"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResumeCI • Flyers Licence 1 MIAGE — Découpables A4</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&amp;family=Poppins:wght@700;800;900&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>${css}</style>
</head>
<body>

  <header class="control-header">
    <div class="brand-group">
      <img src="./icon-192.png" alt="ResumeCI" class="brand-logo" onerror="this.src='/icon.svg'">
      <div>
        <h1 class="brand-title">ResumeCI • Flyers Licence 1 MIAGE</h1>
        <p class="brand-sub">12 fiches promo découpables • 3 QR par fiche (Site + WhatsApp + TikTok) • Format A4</p>
      </div>
    </div>

    <div class="page-tabs">
      <button class="tab-btn active" onclick="filterPage('all')">Toutes (12)</button>
      <button class="tab-btn" onclick="filterPage('1')">Page 1</button>
      <button class="tab-btn" onclick="filterPage('2')">Page 2</button>
    </div>

    <div class="btn-actions">
      <button class="ctrl-btn btn-edit" id="btnToggleEdit" onclick="toggleEditMode()">
        <i class="fas fa-pen-to-square"></i> <span>Activer Mode Édition</span>
      </button>
      <button class="ctrl-btn btn-print" onclick="window.print()">
        <i class="fas fa-print"></i> <span>Imprimer A4 (PDF)</span>
      </button>
      <a href="/" class="ctrl-btn btn-back">
        <i class="fas fa-arrow-left"></i> Retour au site
      </a>
    </div>
  </header>

  <div class="edit-banner" id="editBanner">
    ✏️ <strong>Mode Édition Activé :</strong> Clique sur n'importe quel texte ou titre pour le modifier directement avant d'imprimer !
  </div>

  <div class="pages-container">
      <div class="page-sheet" data-page="1">
        <div class="page-header-tag">PAGE 1 — LICENCE 1 MIAGE : LA PLATEFORME &amp; LES MATIÈRES</div>
        <div class="cards-grid">
          ${PAGE1.join('\n          ')}
        </div>
      </div>
      <div class="page-sheet" data-page="2">
        <div class="page-header-tag">PAGE 2 — LICENCE 1 MIAGE : PASS, APP &amp; COMMUNAUTÉ</div>
        <div class="cards-grid">
          ${PAGE2.join('\n          ')}
        </div>
      </div>
  </div>

  <script>
    function toggleEditMode() {
      const btn = document.getElementById('btnToggleEdit');
      const banner = document.getElementById('editBanner');
      const isEditing = !document.body.classList.contains('editing');
      document.querySelectorAll('[contenteditable]').forEach(el => {
        el.setAttribute('contenteditable', isEditing ? 'true' : 'false');
      });
      if (isEditing) {
        document.body.classList.add('editing');
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-check"></i> <span>Terminer Édition</span>';
        banner.classList.add('show');
      } else {
        document.body.classList.remove('editing');
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-pen-to-square"></i> <span>Activer Mode Édition</span>';
        banner.classList.remove('show');
      }
    }

    function filterPage(p) {
      document.querySelectorAll('.page-sheet').forEach(sheet => {
        sheet.style.display = (p === 'all' || sheet.dataset.page === p) ? 'flex' : 'none';
      });
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
    }

    document.querySelectorAll('[contenteditable]').forEach(el => el.setAttribute('contenteditable', 'false'));
  </script>
</body></html>`;

fs.writeFileSync(OUT, html);
console.log('✅ flyer-miage.html généré :', (html.length / 1024).toFixed(0), 'Ko,', PAGE1.length + PAGE2.length, 'cartes');
