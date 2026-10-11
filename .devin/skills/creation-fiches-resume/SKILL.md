---
name: creation-fiches-resume
description: >-
  Génère les fiches de résumé ResumeCI d'une classe (ex. 3ème, Seconde_C, Terminale_D) : récupération des cours PDF
  sur ecole-ci.org, extraction du texte, rédaction manuelle et soignée des résumés par l'agent dans le style HTML exact
  des fiches existantes, puis build et publication sur le site.
argument-hint: "<classe> [matière(s)]"
triggers:
  - user
  - model
allowed-tools:
  - read
  - grep
  - glob
---

# Compétence : Génération de fiches de résumé ResumeCI

Argument attendu : `$ARGUMENTS` = classe cible (`6eme`, `5eme`, `3eme`, `Seconde_A`, `Seconde_C`, `Premiere_D`,
`Terminale_A`, `Terminale_C`, `Terminale_D`) et éventuellement la ou les matières. Si la classe n'est pas précisée,
demande-la à l'utilisateur avant de commencer.

Toutes les commandes se lancent depuis la racine du repo `resumeci/`.

## Étape 0 : État des lieux (obligatoire)
1. Liste ce qui existe déjà pour la classe : `Fiches_Resume/<classe>/<matière>/` (sources) et `public/fiches/<classe>/`.
2. Vérifie les matières autorisées dans `ALLOWED_SUBJECTS` de `src/build_static.js` : un dossier matière absent de
   cette liste ne sera **pas** publié. Ajoute la matière dans la liste si nécessaire (orthographe exacte du dossier).
3. Ne réécris jamais une fiche existante sans accord explicite de l'utilisateur : ne traite que les leçons manquantes.

## Étape 1 : Récupération des cours PDF
1. Vérifie d'abord si les PDF sont déjà présents localement (`Cours_<classe>/`, `pdfs/`) : si oui, passe à l'étape 2.
2. Sinon, utilise le scraper existant (Puppeteer + Chrome local) plutôt qu'une navigation manuelle :
   - `npm run scrape:<niveau>` si le script existe dans `package.json` (`scrape:6eme`, `scrape:3eme`, `scrape:seconde`,
     `scrape:premiere`), sinon `node src/scraper.js` / `src/scraper_core.js`.
   - Le compte visiteur est défini dans `CONFIG.visitor` de `src/scraper_core.js`. Privilégie un compte appartenant à
     l'utilisateur ; demande-lui ses identifiants s'il en a un plutôt que de créer de nouveaux comptes.
3. Les PDF doivent finir dans `Cours_<classe>/<matière>/`. Ces dossiers sont ignorés par git (ne jamais les commiter).

## Étape 2 : Extraction du texte
1. Utilise l'extracteur du projet : `node src/extract_lessons.js <classe>` (utilise `pdf-parse`, déjà installé).
   Les textes sortent dans `_extracts_<classe>/`.
2. Si un PDF est scanné (texte vide ou illisible), signale-le à l'utilisateur au lieu d'inventer le contenu.

## Étape 3 : Rédaction manuelle par l'agent (cœur de la compétence)
1. **Rédige toi-même chaque fiche** à partir du texte extrait, comme un professeur : n'utilise pas les scripts
   `generate_fiches*.js` pour produire le contenu. Lis le cours en entier avant d'écrire.
2. Contenu attendu : l'essentiel de la leçon, définitions exactes, formules, propriétés, méthodes, exemples courts,
   pièges fréquents. Fidèle au programme ivoirien et au PDF source, sans rien inventer. Français correct et accentué.
3. **Style HTML obligatoire** : ouvre 2 fiches existantes de la même matière dans `Fiches_Resume/<classe>/<matière>/`
   (ex. `Fiches_Resume/3eme/Mathematiques/Fiche_Lecon1_CALCUL_LITTERAL.html`) et reproduis exactement :
   - le même `<head>` (balise `<style>` identique copiée d'une fiche existante, `<title>` et `<meta name="description">` adaptés) ;
   - l'en-tête : `<div class="header"><h1>📝 FICHE DE RÉSUMÉ</h1><div class="meta"><span>📖 Matière</span><span>🏫 Classe</span><span>Leçon N : Titre</span></div></div>` ;
   - les sections `<h2>I. …</h2>`, `<h3>` et uniquement les blocs `div.definition` (définitions), `div.important`
     (propriétés / à retenir), `div.schema` (formules clés), `<table>`, `<ul>/<ol>` déjà utilisés par le site ;
   - pas de JavaScript, pas de CSS externe, pas d'image distante.
4. Nommage : `Fiche_Lecon<N>_<TITRE_EN_MAJUSCULES_SANS_ACCENTS>.html` (ou la convention déjà utilisée dans le dossier
   de la matière — respecte-la). Écris le fichier avec l'outil `write` dans `Fiches_Resume/<classe>/<matière>/`.
5. Montre la première fiche rédigée à l'utilisateur pour validation du ton et du niveau avant d'enchaîner les autres.

## Étape 4 : Build et publication
1. `npm run build` (`src/build_static.js`) : copie les fiches dans `public/fiches/`, ajoute les balises SEO, le QR
   WhatsApp et `fiche-standalone.css/js`, et régénère `public/data/structure.json`, `stats.json`, `search-index.json`,
   `sitemap.xml`.
2. Vérifie : la nouvelle fiche existe dans `public/fiches/<classe>/<matière>/`, contient `fiche-standalone.css`, et
   apparaît dans `public/data/structure.json`. Mets à jour le nombre total de fiches s'il est écrit en dur
   (`public/data/version.json`, textes « 714 fiches » de `index.html` / `inscription.html`) si l'utilisateur le souhaite.
3. Si des fiches déjà publiées n'ont pas les balises standalone : `node src/patch_fiches_standalone.js`.
4. Bump du cache si des assets ont changé (voir `AGENTS.md`), puis propose à l'utilisateur :
   commit + push, et `firebase deploy --only hosting`. Ne déploie pas sans son accord.

## Récapitulatif à donner à la fin
- Liste des fiches créées (classe / matière / leçon) et celles ignorées (PDF manquant ou illisible).
- Commandes lancées et résultat du build.
- Ce qu'il reste à faire (relecture, déploiement).
