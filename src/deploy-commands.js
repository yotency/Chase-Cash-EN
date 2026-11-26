import { REST, Routes } from 'discord.js';
import { env } from './config/env.js';
import { loadCommandModules } from './utils/loadCommands.js';

async function deploy() {
  if (!env.discordToken || !env.clientId) {
    console.error(
      '[DEPLOY] DISCORD_TOKEN et DISCORD_CLIENT_ID doivent être renseignés dans .env',
    );
    process.exit(1);
  }

  const commandModules = await loadCommandModules();
  const commands = commandModules.map((command) => command.data.toJSON());
  const rest = new REST().setToken(env.discordToken);

  if (env.devGuildId) {
    console.log(
      `[DEPLOY] Enregistrement de ${commands.length} commande(s) sur le serveur (${env.devGuildId})...`,
    );
    await rest.put(Routes.applicationGuildCommands(env.clientId, env.devGuildId), {
      body: commands,
    });
  } else {
    console.log(
      `[DEPLOY] Enregistrement global de ${commands.length} commande(s)...`,
    );
    await rest.put(Routes.applicationCommands(env.clientId), {
      body: commands,
    });
  }

  console.log('[DEPLOY] Commandes enregistrées avec succès.');
}

deploy().catch((error) => {
  console.error('[DEPLOY] Erreur:', error);
  process.exit(1);
});
