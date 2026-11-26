# Chase & Cash — Discord Bot (EN)

Version anglaise du bot Discord **Chase & Cash** (destinée à tourner sur le même serveur Discord que le bot FR) :
- **8 commandes slash admin uniquement** (noms de commandes conservés en français pour le staff : `/setup-rules`, `/setup-ticket`, `/setup-vocal`, `/avis`, `/annonce`, `/maj`, `/maintenance`, `/devencours`).
- **Tous les embeds, boutons, menus, formulaires, MPs et retranscriptions joueurs en anglais**.

## Persistance des données (Local & Railway)

- **En local** : `DATA_DIR=./data`
- **Sur Railway** : monter un Volume sur `/data`, définir `DATA_DIR=/data` et utiliser la commande de démarrage `npm run deploy-commands && npm start`.
