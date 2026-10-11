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

## 📁 RÉCAPITULATIF DES SKILLS INSTALLÉS DANS VOTRE PROJET

Vos skills sont enregistrés dans **`.devin/skills/`** et **`.agents/skills/`** :
1. **`frontend-pwa-ui`** : Verrouille le front, empêche de lire `public/app.js`, automatise `npm run minify`.
2. **`backend-api-paiements`** : Verrouille `payment-api/server.js`, sécurise GeniusPay et Firestore.
3. **`generation-fiches-cours`** : Gabarit HTML officiel APC pour créer les fiches sans scanner tout le site.
4. **`devops-deploiement-cache`** : Déploiement direct sans fioritures et gestion du cache `?v=`.
