import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { env } from './config/env.js';
import { closeDatabase, getDatabase } from './db/database.js';
import { loadCommandModules } from './utils/loadCommands.js';

async function registerCommands(client) {
  client.commands = new Collection();
  const modules = await loadCommandModules();
  for (const command of modules) {
    client.commands.set(command.data.name, command);
  }
}

async function registerEvents(client) {
  const eventsDir = path.resolve(process.cwd(), 'src/events');
  for (const file of fs.readdirSync(eventsDir)) {
    if (!file.endsWith('.js')) continue;
    const fileUrl = pathToFileURL(path.join(eventsDir, file)).href;
    const event = await import(fileUrl);

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

async function main() {
  if (!env.discordToken) {
    console.error('[BOOT] DISCORD_TOKEN manquant dans .env');
    process.exit(1);
  }

  getDatabase();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  await registerCommands(client);
  await registerEvents(client);

  const shutdown = () => {
    console.log('[BOT-EN] Arrêt en cours...');
    client.destroy();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await client.login(env.discordToken);
}

main().catch((error) => {
  console.error('[BOOT] Erreur fatale:', error);
  closeDatabase();
  process.exit(1);
});
