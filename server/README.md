# Assistant IA (optionnel)
1. `cd frontend && ANTHROPIC_API_KEY=sk-ant-... npm run assistant`  (port 8787, modèle par défaut claude-sonnet-5-5, modifiable via ANTHROPIC_MODEL)
2. `npm run dev` (ou `npm run build && npm run preview`) : le proxy /api/assistant est déjà configuré.
Sans serveur ou sans clé, l'assistant fonctionne en mode local (moteur de calcul seul).
Ne jamais mettre la clé dans le code du frontend.
