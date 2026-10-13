# 🛡️ GUIDE & PROMPTS CHIRURGICAUX : ÉCONOMIE DE TOKENS SUR DEVIN PRO

Ce guide a été spécialement conçu pour **diviser par 5 à 10 votre consommation de tokens et d'ACU sur Devin Pro** en éliminant les lectures inutiles de fichiers et en cloisonnant chaque intervention.

---

## 🛑 LES 4 RÈGLES D'OR ANTI-GASPILLAGE SUR DEVIN

1. **Ne JAMAIS dire à Devin : « Regarde tout le projet » ou « Trouve le bug dans mon site »**  
   👉 Cela force Devin à scanner 50 fichiers, à lire des dizaines de milliers de lignes et à brûler 100 000 tokens avant même d'avoir écrit une seule ligne de code.
2. **Citer TOUJOURS le fichier exact dès le premier message**  
   👉 Donnez le chemin précis (ex: `src/frontend/app.js` ou `payment-api/server.js`).
3. **Interdire la lecture des fichiers minifiés**  
   👉 `public/app.js` pèse plus de 180 Ko minifié. Si Devin l'ouvre, c'est l'équivalent de 40 000 tokens gaspillés en 5 secondes.
4. **Découper les tâches en petites étapes**  
   👉 Ne demandez pas : *« Ajoute la 4ème, corrige les paiements et refais le design »*. Faites 1 session courte par tâche précise.

---

## 📋 BIBLIOTHÈQUE DE PROMPTS PRÊTS À COPIER-COLLER DANS DEVIN

Chaque prompt ci-dessous active directement le bon **Skill** déjà installé dans `.devin/skills/` et bloque la recherche inutile.

---

### 🟢 PROMPT 1 : Modification ou Bug sur l'Interface (Frontend / UI / PWA)

> **À copier-coller dans Devin :**  
> ```text
> Utilise le skill `frontend-pwa-ui`.
> MISSION : [Expliquez ici votre modification, ex: Ajouter un bouton Retour sur la fiche].
> RÈGLES STRICTES D'ÉCONOMIE DE TOKENS :
> 1. Ne scanne pas tout le projet.
> 2. Modifie UNIQUEMENT `src/frontend/app.js` (ou `public/index.html` si modification HTML).
> 3. Ne lis JAMAIS `public/app.js` directement.
> 4. Une fois la modification terminée, lance `npm run minify` et incrémente `?v=` dans `public/index.html` et `public/sw.js`.
> ```

---

### 🔵 PROMPT 2 : Bug ou Ajout sur les Paiements & le Serveur (Backend / API)

> **À copier-coller dans Devin :**  
> ```text
> Utilise le skill `backend-api-paiements`.
> MISSION : [Expliquez ici votre problème, ex: Vérifier la route /api/pay pour GeniusPay].
> RÈGLES STRICTES D'ÉCONOMIE DE TOKENS :
> 1. Ton périmètre est STRICTEMENT limité au dossier `payment-api/`.
> 2. Ne lis AUCUN fichier frontend ni le dossier `public/`.
> 3. Modifie uniquement `payment-api/server.js`.
> 4. Valide le code avec `node --check payment-api/server.js` sans redémarrer tout le système.
> ```

---

### 🟡 PROMPT 3 : Créer une Nouvelle Fiche de Cours (Ex: 4ème ou 1ère A/C)

> **À copier-coller dans Devin :**  
> ```text
> Utilise le skill `generation-fiches-cours`.
> MISSION : Rédige la fiche pour la classe de [4ème / 1ère A], matière [Mathématiques], Leçon [1 : Calcul littéral].
> RÈGLES STRICTES D'ÉCONOMIE DE TOKENS :
> 1. Ne lis pas les 700 fiches existantes. Utilise directement le gabarit HTML officiel défini dans le skill `generation-fiches-cours`.
> 2. Inclus impérativement : Définitions clés, formules encadrées, et l'encadré « ⚠️ Piège d'examen / Méthode APC ».
> 3. Enregistre le fichier directement dans : `public/fiches/[Classe]/[Matiere]/Fiche_Lecon[Num]_[Titre].html`.
> ```

---

### 🟣 PROMPT 4 : Déploiement en Production (Firebase Hosting & Render)

> **À copier-coller dans Devin :**  
> ```text
> Utilise le skill `devops-deploiement-cache`.
> MISSION : Déployer les dernières modifications sur Firebase Hosting.
> RÈGLES STRICTES D'ÉCONOMIE DE TOKENS :
> 1. Ne cherche pas de configuration.
> 2. Vérifie que `public/app.js` est à jour (`npm run minify`).
> 3. Exécute directement : `firebase deploy --only firestore:rules,hosting`.
> 4. Confirme que le déploiement est réussi et arrête-toi là.
> ```

---

### 🟠 PROMPT 5 : L'Agent Scraper des Cours de l'État (ecole-ci.org)

> **À copier-coller dans Devin :**  
> ```text
> Agis en tant qu'Agent Scraper. Utilise le skill `scraper-cours-ecole-ci`.
> MISSION : Télécharger les cours PDF de la classe de [4ème / 1ère A / 1ère C] depuis ecole-ci.org et extraire les textes bruts.
> RÈGLES STRICTES D'ÉCONOMIE DE TOKENS :
> 1. N'écris pas de nouveau scraper. Utilise les scripts existants dans `src/` (ex: `node src/scraper_college.js 4eme` ou `node src/extract_lessons.js 4eme`).
> 2. Ne touche à AUCUN fichier frontend ni backend.
> 3. Range les textes extraits dans le dossier `_extracts_[Classe]/` et termine la session.
> ```

---

### 🎓 PROMPT 6 : Espace Universitaire Complet (Clone de l'Environnement ResumeCI)

> **À copier-coller dans Devin :**  
> ```text
> Utilise le skill `espace-universitaire` situé dans .devin/skills/espace-universitaire/SKILL.md.
>
> MISSION : Construire et déployer l'ENVIRONNEMENT COMPLET de ResumeCI pour l'Espace Universitaire (Licence 1 Droit), en répliquant fidèlement 100% des fonctionnalités du Collège et Lycée :
>
> 1. ARCHITECTURE DES DONNÉES :
>    - Crée le fichier `public/data/structure-universite.json` selon le modèle du skill pour lister les facultés, filières, UE et fiches.
>
> 2. CLONE DE L'ENVIRONNEMENT & FONCTIONNALITÉS SUR public/universite.html :
>    - Barre de navigation supérieure (fil d'ariane, recherche instantanée de notions/articles, bouton mode sombre, favoris).
>    - Sidebar ou sélecteur de filières (Faculté des Sciences Juridiques -> L1 Droit, L2 Droit, etc.).
>    - Composant Lecteur Audio TTS (synthèse vocale avec bouton flottant audioFab pour écouter les fiches en déplacement).
>    - Système de Quizz chronométrés & Galops d'essai relié à public/quizzes/Licence_1_Droit/[Matiere].json.
>    - Flashcards de mémorisation (articles de codes, arrêts et définitions doctrinales).
>    - Modal de progression & statistiques étudiantes.
>    - Modal d'abonnement Pass Licence (Wave, Orange, MTN, Moov Money).
>    - Bulle d'assistance IA pour aide à la méthode et aux cas pratiques.
>
> 3. RÈGLES STRICTES D'ÉCONOMIE DE TOKENS (DEVIN PRO) :
>    - Ne scanne AUCUN dossier du collège ou lycée (3eme, 6eme, Terminale, etc.).
>    - Ne lis JAMAIS le fichier volumineux `public/app.js` (minifié).
>    - Utilise directement les gabarits prêts à l'emploi définis dans le skill `espace-universitaire`.
>    - Travaille uniquement dans `public/universite.html`, `public/data/structure-universite.json`, `public/fiches/Licence_1_Droit/` et `public/quizzes/Licence_1_Droit/`.
> ```

---

## 📁 RÉCAPITULATIF DES SKILLS INSTALLÉS DANS VOTRE PROJET

Vos skills sont enregistrés dans **`.devin/skills/`** et **`.agents/skills/`** :
1. **`frontend-pwa-ui`** : Verrouille le front, empêche de lire `public/app.js`, automatise `npm run minify`.
2. **`backend-api-paiements`** : Verrouille `payment-api/server.js`, sécurise GeniusPay et Firestore.
3. **`generation-fiches-cours`** : Gabarit HTML officiel APC pour créer les fiches secondaires sans scanner tout le site.
4. **`espace-universitaire`** : Dédié au supérieur (L1 Droit, partiels, TD, `universite.html`) sans gaspiller de tokens sur le secondaire.
5. **`clone-frontend-universite`** : Cartographie complète du frontend ResumeCI pour reproduire toute la chaîne (inscription, connexion, fiches, quiz, audio, favoris, stats, paiement).
6. **`devops-deploiement-cache`** : Déploiement direct sans fioritures et gestion du cache `?v=`.
7. **`scraper-cours-ecole-ci`** : Téléchargement automatique des PDF et extraction de texte depuis ecole-ci.org.


