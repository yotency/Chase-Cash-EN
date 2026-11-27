import { ActivityType, Events } from 'discord.js';
import { env } from '../config/env.js';
import { cleanupOrphanTempVoices } from '../services/vocalService.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  console.log(`[BOT-EN] Connecté en tant que ${client.user.tag}`);
  console.log(`[DATA] Dossier de persistance : ${env.dataDir}`);

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: 'Chase & Cash',
        type: ActivityType.Playing,
      },
    ],
  });

  await cleanupOrphanTempVoices(client).catch((error) => {
    console.error('[VOCAL] Erreur lors du nettoyage au démarrage:', error);
  });
}
