---
name: frontend-pwa-ui
description: >-
  Utilisez cette compétence pour modifier l'interface utilisateur, le formulaire d'inscription,
  la consultation des fiches, le Service Worker (PWA) ou l'interaction avec l'API.
  Protège le quota de tokens en ciblant uniquement src/frontend/app.js et en interdisant la lecture des fichiers minifiés.
---

# Compétence : Frontend & PWA UI (Économie Maximale de Tokens)

## 🛑 RÈGLE D'OR ABSOLUE (Anti-Gaspillage de Tokens)
1. **NE JAMAIS ÉDITER `public/app.js` DIRECTEMENT !** Ce fichier est un build minifié généré.
2. **NE JAMAIS LIRE `public/app.js` !** C'est un fichier lourd de 180+ Ko qui consomme 40 000 tokens pour rien.
3. **Le SEUL fichier source à modifier :** `src/frontend/app.js`.
4. Si la modification concerne l'HTML de base : `public/index.html` ou `public/inscription.html`.

## 🔄 Workflow Obligatoire après toute modification du Frontend
Après avoir modifié `src/frontend/app.js` :
1. Lancer la minification automatique :
   ```bash
   npm run minify
   ```
2. Mettre à jour le numéro de version de cache (`?v=...`) dans :
   - `public/index.html` (sur les balises `<script>` et `<link>`)
   - `public/sw.js` (sur la variable `CACHE_SHELL`)
   *Exemple :* passer de `?v=1.0.4` à `?v=1.0.5`.

## 🔍 Recherche Ciblée dans `src/frontend/app.js` (Zéro scan intégral)
Ne JAMAIS charger les 4 000 lignes de `src/frontend/app.js` en une seule fois.
Utiliser `grep_search` pour cibler la fonction précise :
- Inscription / Connexion : chercher `handleInscription` ou `handleLogin`
- Paiement GeniusPay : chercher `watchPendingPayment` ou `initiatePayment`
- Affichage des fiches : chercher `renderFiche` ou `openFiche`
- PWA / Hors-ligne : chercher `caches.match` ou `sw.js`
