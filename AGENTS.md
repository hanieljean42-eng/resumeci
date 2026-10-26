# ResumeCI — notes projet

## Architecture
- `public/` : site statique (PWA) déployé sur **Firebase Hosting** (`resumeci.me`).
- `payment-api/server.js` : API Node/Express (paiements GeniusPay, inscription/connexion élèves, admin) déployée sur **Render** (`rootDir: ./payment-api`). `server.js` à la racine n'est qu'un point d'entrée qui fait `require('./payment-api/server.js')` (source unique, ne pas dupliquer). Dépendances : `npm install --prefix payment-api`.
- `src/frontend/app.js` : **source lisible** de `public/app.js`. Ne jamais éditer `public/app.js` directement.
- `firestore.rules` : accès `users`/`inscriptions` réservé à l'admin (email Firebase Auth). Les élèves passent par l'API (Admin SDK).

## Commandes
- Minifier le frontend : `npm run minify` (génère `public/app.js` depuis `src/frontend/app.js`).
- Vérifier la syntaxe : `node --check payment-api/server.js`.
- API en local : `cd payment-api && PORT=3999 node server.js` (nécessite `payment-api/firebase-admin.json` ou `FIREBASE_SERVICE_ACCOUNT`).
- Règles Firestore (dry-run) : `firebase deploy --only firestore:rules --dry-run`.
- Déploiement front + règles : `firebase deploy --only firestore:rules,hosting`.
- Render se déploie automatiquement depuis GitHub (vérifier la branche suivie dans le dashboard Render).

## Classes universitaires
- Une filière universitaire est une classe comme les autres : `Fiches_Resume/Licence_{N}_{Filiere}/{Matiere}/` (ex. `Licence_1_Droit/Droit_Constitutionnel/`), sans page ni JS à part.
- Pour l'activer : ajouter la classe et ses matières dans `ALLOWED_SUBJECTS` (`src/build_static.js`), dans `CLASS_ORDER` (`src/frontend/app.js`, puis `npm run minify`) et une `<option>` dans `regClass` (`public/inscription.html`).
- Quiz : `public/data/quizzes/{Classe}/{Matiere}.json` (même nom que le dossier matière).

## Cache
- Bumper `?v=` de l'asset modifié dans `public/index.html` + `public/sw.js`, et `CACHE_SHELL` dans `sw.js`.

## Variables d'environnement Render
`FIREBASE_SERVICE_ACCOUNT` (JSON complet), `GENIUSPAY_PUBLIC_KEY`, `GENIUSPAY_SECRET_KEY`, `ADMIN_EMAILS`, `WEBHOOK_SECRET`, `PUBLIC_API_URL`.

## Sécurité / conventions
- Mots de passe : `passwordHash` (bcryptjs), 8 caractères minimum à l'inscription. Les anciens champs `password` en clair sont migrés à la première connexion. Jamais de mot de passe dans localStorage ni de lecture `users/` depuis le navigateur.
- Paiements idempotents : chaque référence GeniusPay traitée est enregistrée dans `payments/{reference}`.
- `WEBHOOK_SECRET` obligatoire en production (le serveur refuse de démarrer sinon).
- Ne jamais commiter `data/`, `data_*/`, `_extracts_*`, `.env`, `firebase-admin.json` (voir `.gitignore`, `SECURITY.md`).
- Un numéro WhatsApp = un seul document `users/{numero}` (uid = numéro).
- Aucun déblocage premium sans référence GeniusPay vérifiée côté serveur (`/api/confirm-payment`, `/api/webhook`), `/api/check-payment`, et `/api/user-status` via `users/{uid}.pendingPayment` mémorisé par `/api/pay`).
- Paiements : `/api/pay` réutilise la transaction GeniusPay encore en attente (même formule, < 10 min) ; le front surveille le paiement (`watchPendingPayment`) et re-rend la vue au déblocage.
- Routes `/api/admin/*` : jeton Firebase ID (`Authorization: Bearer`) + email dans `ADMIN_EMAILS`.
- Session élève : `buildProfile` ajoute un `sessionToken` signé (HMAC, `SESSION_SECRET` ou `WEBHOOK_SECRET`) stocké dans `resumeci_profile` ; `syncUserProfileFromRemote` l'envoie en `Authorization: Bearer`. Sans jeton, `/api/user-status` ne renvoie que le statut premium.
- Accueil : `public/index.html` affiche `#introScreen` aux visiteurs sans profil ; « Continuer » mène à `/inscription.html` (plus de redirection automatique dans le `<head>`).

## Vidéos TikTok
- MoneyPrinterTurbo installé hors repo : `C:\MPT\MoneyPrinterTurbo` (venv `C:\mpt-venv`, LLM Ollama local sans clé). Voir `.devin/skills/videos-tiktok-resumeci/SKILL.md`.
- Toute vidéo générée doit être copiée dans `C:\Users\DJEBLE\OneDrive\Desktop\VIDEO RESUMECI\VIDEO RESUMECI` (nommage `NN_ResumeCI_Titre.mp4`).
