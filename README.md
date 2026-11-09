# Frontend — THIÈS / Ségrégation socio-spatiale

Version réorganisée en **pages/routes indépendantes** avec identité visuelle commune.

## Routes
- `/` Accueil
- `/comprendre` Comprendre Thiès
- `/geoportail` Géoportail
- `/analyses` Analyses / tableau de bord
- `/histoire` Histoire & évolution
- `/donnees` Données & méthodologie
- `/apropos` À propos
- `/administration` Administration

## Points corrigés
- Chaque entrée de navigation ouvre une vraie page, pas une longue section de l'accueil.
- Chaque page possède une ambiance/image dédiée.
- Page Histoire avec anciennes images de la gare et du chemin de fer de Thiès.
- Mode clair complet : fonds blancs/clairs, cartes, tableaux et panneaux adaptés.
- Mode sombre conservé dans l'identité bleu nuit/cyan.
- Accueil conservé avec l'image `public/thies-hero.png`.
- Géoportail connecté à `http://localhost:8000/api/quartiers/` et affiche les géométries reçues par l'API.
- Aucun résultat de ségrégation n'est inventé : les éléments non calculés sont explicitement indiqués.

## Installation
```bash
npm install
npm run dev
```

Le backend Django/GeoDjango doit être démarré sur `http://localhost:8000` pour alimenter le Géoportail et les statistiques.
