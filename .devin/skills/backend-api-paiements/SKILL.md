---
name: backend-api-paiements
description: >-
  Utilisez cette compétence pour toute modification du backend, des routes d'authentification,
  des paiements GeniusPay, de Firestore Admin SDK ou de l'API Node/Express dans payment-api/.
  Permet d'économiser un maximum de tokens en limitant le contexte à ce dossier uniquement.
---

# Compétence : Backend & API Paiements (Économie de Tokens)

## 🎯 Périmètre Strict (Ne lire AUCUN autre fichier)
- **Fichier principal :** `payment-api/server.js` (Ne PAS toucher au `server.js` racine qui n'est qu'un pont).
- **Configuration :** `payment-api/package.json`, `firestore.rules`.
- **INTERDICTION STRICTE :** Ne JAMAIS lire ni explorer `src/frontend/app.js`, `public/`, ou les dossiers de données `data/` pour des tâches backend.

## 🔒 Règles Critiques de Sécurité & Conventions
1. **Mots de passe :** Toujours hachés avec `bcryptjs` (champ `passwordHash`, 8 caractères min). Jamais en clair.
2. **Paiements GeniusPay :**
   - Idempotence stricte : Chaque référence GeniusPay traitée est sauvegardée dans `payments/{reference}`.
   - Les routes clés : `/api/pay`, `/api/confirm-payment`, `/api/check-payment`, `/api/webhook`.
   - `WEBHOOK_SECRET` obligatoire.
3. **Session élève :** Utilise un token HMAC (`sessionToken`) signé avec `SESSION_SECRET` ou `WEBHOOK_SECRET`.
4. **Routes admin :** Doivent vérifier le jeton Firebase ID (`Authorization: Bearer`) et l'email dans `ADMIN_EMAILS`.

## 🧪 Validation & Test Rapide (Zéro Token Perdu)
Après chaque modification :
1. Exécuter : `node --check payment-api/server.js`
2. Si syntaxe OK, terminer sans relire tout le fichier.
