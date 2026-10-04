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
- Aucun déblocage premium sans référence GeniusPay vérifiée côté serveur (`/api/confirm-payment`, `/api/webhook`).
- Routes `/api/admin/*` : jeton Firebase ID (`Authorization: Bearer`) + email dans `ADMIN_EMAILS`.
