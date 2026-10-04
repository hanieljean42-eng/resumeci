// Point d'entrée unique : l'API vit dans payment-api/server.js (déployée sur Render avec rootDir ./payment-api).
// Ce fichier évite la duplication du code ; installer les dépendances avec `npm install --prefix payment-api`.
require('./payment-api/server.js');
