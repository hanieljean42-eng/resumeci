---
name: devops-deploiement-cache
description: >-
  Utilisez cette compétence pour déployer sur Firebase Hosting, appliquer les règles Firestore,
  mettre à jour le cache du Service Worker ou vérifier le statut de Render.
  Exécute les commandes exactes sans chercher dans tous les fichiers.
---

# Compétence : DevOps, Déploiement & Gestion du Cache (Économie de Tokens)

## 🚀 Commandes de Déploiement Rapide
Ne jamais demander à l'Agent "cherche comment déployer". Exécuter directement :

1. **Déploiement Frontend + Règles Firestore :**
   ```bash
   firebase deploy --only firestore:rules,hosting
   ```
2. **Tester les règles Firestore en local (dry-run) :**
   ```bash
   firebase deploy --only firestore:rules --dry-run
   ```
3. **Backend Render :**
   - Render déploie automatiquement chaque push sur la branche connectée de votre dépôt GitHub.
   - Si besoin de redémarrer le serveur local de test : `cd payment-api && PORT=3999 node server.js`.

## 🔄 Gestion Obligatoire du Cache (Pour que les élèves voient les modifs)
Avant de lancer `firebase deploy`, modifier le paramètre `?v=` :
1. Dans `public/index.html` : Incrémenter `?v=X` sur les `<link rel="stylesheet">` et `<script>`.
2. Dans `public/sw.js` : Incrémenter la version du cache `CACHE_SHELL = 'resumeci-shell-vX'`.
