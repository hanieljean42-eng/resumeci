# RésuméCI — Fiches de révision automatiques

Application qui génère des fiches de résumé à partir des cours PDF du site ecole-ci.org
pour les élèves de 3ème et Terminale en Côte d'Ivoire.

## Fonctionnalités principales

- Fiches HTML de révision pour Terminale A et Terminale D.
- Interface responsive adaptée au téléphone mobile.
- Flashcards avec répétition espacée.
- Quiz gamifiés avec score, vies, correction immédiate et suivi des erreurs.
- Quiz spécial dates et événements pour Histoire-Géographie.
- Mode PWA installable avec support hors-ligne.
- Lecture audio des fiches avec `SpeechSynthesis`.

## Structure du projet

```
ResumeCI/
├── Fiches_Resume/      → Fiches HTML par classe et matière
├── Cours_Terminale/    → PDFs de cours
├── public/             → Interface, PWA, quiz et flashcards
├── src/                → Scripts de génération/organisation
├── server.js           → Serveur Express
├── package.json        → Dépendances Node.js
└── README.md           → Ce fichier
```

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

## Installation sur téléphone

Sur Chrome Android :

1. Ouvrir l'application publiée.
2. Cliquer sur le menu du navigateur.
3. Choisir `Installer l'application` ou `Ajouter à l'écran d'accueil`.

Sur iPhone :

1. Ouvrir l'application dans Safari.
2. Cliquer sur `Partager`.
3. Choisir `Sur l'écran d'accueil`.

## Publier sur GitHub

```bash
git init
git add .
git commit -m "Initial ResumeCI platform"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/resumeci.git
git push -u origin main
```

## Hébergement recommandé

La plateforme utilise un serveur Node.js Express. Elle peut être publiée sur :

- Render
- Railway
- Fly.io
- VPS

Commande de démarrage :

```bash
npm start
```

## Stack technique

- **Node.js** — Backend
- **Express** — Serveur web
- **pdf-parse** — Extraction de texte des PDFs
- **HTML/CSS/JavaScript** — Interface web
- **Service Worker + Manifest** — PWA installable
- **Puppeteer** (optionnel) — Scraping automatique du site ecole-ci.org
