# Sécurité — ResumeCI

## Signaler une vulnérabilité
Contacter l'administrateur en privé (WhatsApp de l'assistance ou email admin). Ne pas ouvrir d'issue publique.

## Secrets et données personnelles
- Aucun secret dans le dépôt. Les secrets vivent dans les variables d'environnement Render
  (`FIREBASE_SERVICE_ACCOUNT`, `GENIUSPAY_SECRET_KEY`, `WEBHOOK_SECRET`, …, déclarées `sync: false` dans `render.yaml`).
- `render.yaml` ne contient que des valeurs publiques (ex. clé publique GeniusPay `pk_live_…`).
- Ne jamais commiter : `.env*`, `firebase-admin.json`, `data/`, `data_*/`, `_extracts_*`, logs (voir `.gitignore`).
  Les artefacts de scraping (cookies de session, pages HTML, captures) restent en local.

## Authentification
- Les mots de passe sont hachés (bcrypt) côté API ; minimum 8 caractères à l'inscription.
- L'authentification passe uniquement par `POST /api/login`. Aucun mot de passe n'est stocké dans
  `localStorage` ni comparé dans le navigateur ; les anciens profils locaux sont nettoyés au chargement.
- Réponse identique (`401`, « Identifiants invalides ») pour compte inexistant et mauvais mot de passe.
  `POST /api/register` révèle forcément l'existence d'un numéro (un nouveau numéro crée un compte) :
  seul le rate limiting atténue ce cas tant qu'il n'y a pas de vérification du numéro (OTP).
- Rate limiting par IP : `/api/login` 10 / 15 min, `/api/register` 5 / h, `/api/pay` et `/api/check-payment` 30 / 15 min.

## Paiements
- Aucun déblocage sans vérification du statut auprès de l'API GeniusPay (check-payment, confirm-payment, webhook).
- Idempotence : chaque référence traitée est enregistrée dans la collection Firestore `payments` (doc ID = référence) ;
  une référence déjà traitée ne prolonge ni ne réinitialise `premiumExpiresAt`.
- Webhook : jeton partagé via l'en-tête `x-webhook-token` ou le paramètre `?token=` ; `WEBHOOK_SECRET` est obligatoire en production.

## API
- CORS restreint à `resumeci.me`, `www.resumeci.me`, `resumeci-d5c9a.web.app`, `resumeci-d5c9a.firebaseapp.com`
  (+ `localhost` hors production). En-têtes de sécurité via `helmet`.
- Les réponses d'erreur ne contiennent pas de détails internes.

## Firestore
- `firestore.rules` : `users` et `inscriptions` réservés à l'admin, `waitlist` en création publique validée, tout le reste refusé.
- Les élèves n'accèdent à leurs données que via l'API (Admin SDK).

## Limitations connues
- **Statut premium contournable côté client.** Le site est statique : les fiches et fonctionnalités premium sont servies
  à tous et le verrouillage repose sur le profil stocké dans `localStorage`. Un utilisateur peut modifier ce profil et
  débloquer l'interface. Évolution proposée : servir le contenu premium depuis l'API (endpoint authentifié par jeton
  de session signé, ex. Firebase Auth custom token ou JWT court) et ne plus publier ce contenu dans `public/`.
- **`/api/user-status`** : sans jeton de session (`sessionToken` HMAC, 180 jours, remis par `/api/login` et `/api/register`), la route ne renvoie que le statut d'abonnement (`isPremium`, `premiumPlan`, `premiumExpiresAt`) ; nom, classe et numéro exigent `Authorization: Bearer <sessionToken>` du même compte. Le statut premium d'un numéro reste donc consultable. Le secret de signature est `SESSION_SECRET` (à défaut `WEBHOOK_SECRET`).
  À protéger par un jeton de session lors de la migration ci-dessus.
- **CSP `script-src 'unsafe-inline'`** conservée : de nombreux scripts et gestionnaires `onclick` sont inline.
  Leur migration vers des fichiers externes (ou des nonces/hashes) est un chantier séparé.
- **`content-protection.js`** est une dissuasion (clic droit, copie), pas une mesure de sécurité.
