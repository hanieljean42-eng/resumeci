---
name: devops-deploiement-cache
description: >-
  Utilisez cette compétence pour déployer sur Firebase Hosting, appliquer les règles Firestore,
  mettre à jour le cache du Service Worker ou vérifier le statut de Render.
  Exécute les commandes exactes sans chercher dans tous les fichiers.
---

# Compétence : DevOps, Déploiement & Gestion du Cache (Économie de Tokens)

## ⛔ RÈGLE D'OR — JAMAIS DE DÉPLOIEMENT SANS TEST LOCAL VALIDÉ

Avant TOUT `git push` ou `firebase deploy`, le workflow obligatoire est :

```
1. Build local      →  npm run minify  (+ node src/build_static.js si fiches/quiz)
2. Serveurs locaux  →  API :3000 + front :8080 (voir section ci-dessous)
3. TEST UTILISATEUR →  l'utilisateur vérifie en local (http://localhost:8080)
4. Son « GO » explicite reçu
5. Commit → push (Render) → firebase deploy → vérifs live
```

**Interdit** : déployer « pour gagner du temps » sans validation de l'utilisateur.
Si le test local échoue → corriger, retester, puis seulement proposer le déploiement.

## 🖥️ Environnement de test local

```bash
# Terminal 1 — API locale (port 3000 obligatoire : le front le cible en priorité sur localhost)
cd payment-api && node server.js        # nécessite payment-api/.env (DEV_MODE=1 pour les outils test)

# Terminal 2 — Front statique
cd public && python -m http.server 8080
```

- Site local : **http://localhost:8080**
- Outil de test (comptes/forfaits gratuits, changement de classe en 1 clic) : **http://127.0.0.1:3000/dev**
  - Actif uniquement si `DEV_MODE=1` dans `payment-api/.env` **et** hors production (`NODE_ENV != production`) — inexistant sur Render.
  - Endpoint : `POST /api/dev/test-account` `{phone, selectedClass, plan|'keep', password, days}`.
  - Les comptes de test (07000000xx, mdp `test1234`) sont écrits dans la **vraie base** — utiliser des numéros de test.
  - Après changement de classe/forfait → **reconnexion** sur `localhost:8080/connexion.html` (le profil se recharge au login, pas au refresh).

## 🚀 Commandes de Déploiement Rapide (après GO utilisateur)

1. **Déploiement Frontend + Règles Firestore :**
   ```bash
   firebase deploy --only firestore:rules,hosting
   ```
   Si `Authentication Error` → retry (le token se rafraîchit), sinon demander à l'utilisateur `firebase login --reauth`.
2. **Tester les règles Firestore en local (dry-run) :**
   ```bash
   firebase deploy --only firestore:rules --dry-run
   ```
3. **Backend Render :** déployé automatiquement à chaque push sur `main`. Vérifier ensuite :
   ```bash
   curl -s https://resumeci-payment-api.onrender.com/api/health   # uptime récent = déployé
   ```

## 🔄 Gestion Obligatoire du Cache (Pour que les élèves voient les modifs)

Avant `firebase deploy`, incrémenter :
1. `public/index.html` : `?v=X` sur les `<link rel="stylesheet">` et `<script>`.
2. `public/sw.js` : `CACHE_SHELL = 'resumeci-shell-vX'` + le `?v=` de `/app.js`.

## ✅ Checklist post-déploiement

- [ ] `sw.js` live retourne la nouvelle version de cache
- [ ] Les assets modifiés (`app.js`, `index.html`, JSON…) répondent 200 sur resumeci-d5c9a.web.app
- [ ] `api/health` uptime < ~15 min (Render redéployé) si le backend a changé
- [ ] Route protégée → testée **avec sessionToken** (401 sans auth = normal, pas un bug)
