---
name: generation-fiches-cours
description: >-
  Utilisez cette compétence pour rédiger de nouvelles fiches de résumé (4ème, 1ère A, 1ère C)
  ou modifier des fiches existantes dans public/fiches/.
  Permet d'économiser un maximum de tokens en suivant un gabarit HTML strict sans analyser toute la base.
---

# Compétence : Génération de Fiches de Résumé APC (Anti-Gaspillage de Tokens)

## 🎯 Emplacement des Fiches
- Dossier cible : `public/fiches/{Niveau}/{Matiere}/Fiche_Lecon{X}_{TITRE}.html`
- *Exemples de niveaux :* `4eme`, `Premiere_A`, `Premiere_C`.

## 📐 Gabarit HTML Officiel (Copier ce squelette exact)
Ne PAS lire 10 fichiers d'exemple. Utiliser directement cette structure :

```html
<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Leçon {NUM} — {TITRE_LECON} — {MATIERE} {CLASSE} | ResumeCI</title>
<meta name="description" content="Fiche résumé - {TITRE_LECON} - {MATIERE} {CLASSE} | ResumeCI">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://resumeci.me/fiches/{CLASSE}/{MATIERE}/Fiche_Lecon{NUM}_{SLUG}.html">
<link rel="stylesheet" href="/fiche-standalone.css?v=1">
<script src="/fiche-standalone.js?v=1"></script>
</head>
<body>
<div class="header">
  <h1>📝 FICHE DE RÉSUMÉ</h1>
  <div class="meta">
    <span>📖 {MATIERE}</span>
    <span>🏫 {CLASSE}</span>
    <span>Leçon {NUM} : {TITRE_LECON}</span>
  </div>
</div>

<!-- CONTENU DU COURS (CLASSES CSS OBLIGATOIRES) -->
<h2>I. Définitions & Notions Clés</h2>
<div class="definition"><strong>Notion :</strong> Explication claire et concise.</div>

<h2>II. Formules & Propriétés Essentielles</h2>
<div class="schema">Formule clé encadrée</div>
<div class="important"><strong>Propriétés fondamentales :</strong><ul><li>Règle 1</li><li>Règle 2</li></ul></div>

<h2>III. ⚠️ Piège d'Examen & Méthode APC</h2>
<div class="important" style="border-left: 4px solid #ef4444; background: #fef2f2;">
  <strong>⚠️ Piège classique :</strong> L'erreur à ne jamais commettre le jour de l'épreuve.
</div>

<!-- BLOC WHATSAPP OFFICIEL RESUMECI -->
<div class="resume-ci-whatsapp-qr" style="margin-top:28px;padding:16px 18px;border:2px solid #25d366;border-radius:14px;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);text-align:center;page-break-inside:avoid">
  <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">📺 Chaîne WhatsApp ResumeCI</p>
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=8&data=https%3A%2F%2Fwhatsapp.com%2Fchannel%2F0029Vb8u2u0KrWQxKOhaDZ1F" width="100" height="100" alt="QR Code chaîne WhatsApp ResumeCI" loading="lazy" style="display:block;margin:0 auto 8px;border-radius:8px;background:#fff;padding:6px;box-shadow:0 2px 8px rgba(0,0,0,.06)"/>
  <a href="https://whatsapp.com/channel/0029Vb8u2u0KrWQxKOhaDZ1F" target="_blank" rel="noopener" style="font-size:11px;color:#15803d;font-weight:600;text-decoration:none">Scanne le QR ou clique pour nous suivre — fiches, quiz &amp; actus</a>
</div>
<div style="text-align:center;color:#94a3b8;font-size:10px;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb">Créé par <strong style="color:#64748b">Haniel_dev</strong></div>
</body></html>
```

## ⚡ Économie de Tokens
- Demandez à l'Agent de rédiger **matière par matière** ou leçon par leçon.
- Ne demandez JAMAIS "rédige toute la 4ème d'un coup", cela épuiserait vos tokens en une seule invite.
