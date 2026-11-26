import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import {
  OFFICIAL_RULES_DESCRIPTION,
  OFFICIAL_RULES_FIELDS,
  OFFICIAL_RULES_TITLE,
} from '../config/rulesContent.js';
import { getRulesSettings, upsertRulesSettings } from '../db/database.js';
import { createBrandEmbed, withBrandAssets } from '../utils/embed.js';

export const RULES_ACCEPT_ID = 'rules_accept';

const RULES_BANNER_FILENAME = 'rules-banner.jpg';
const RULES_BANNER_PATH = path.resolve(
  process.cwd(),
  'src/assets',
  RULES_BANNER_FILENAME,
);

let cachedRulesBannerPromise = null;

async function getRulesBannerBuffer() {
  if (!cachedRulesBannerPromise) {
    cachedRulesBannerPromise = fs.readFile(RULES_BANNER_PATH).catch((error) => {
      cachedRulesBannerPromise = null;
      throw error;
    });
  }
  return cachedRulesBannerPromise;
}

export async function buildRulesMessagePayload() {
  const bannerAttachment = new AttachmentBuilder(await getRulesBannerBuffer(), {
    name: RULES_BANNER_FILENAME,
  });

  const rulesEmbed = createBrandEmbed()
    .setTitle(OFFICIAL_RULES_TITLE)
    .setDescription(OFFICIAL_RULES_DESCRIPTION)
    .addFields(OFFICIAL_RULES_FIELDS)
    .setImage(`attachment://${RULES_BANNER_FILENAME}`);

  const acceptButton = new ButtonBuilder()
    .setCustomId(RULES_ACCEPT_ID)
    .setLabel('I accept the rules')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const row = new ActionRowBuilder().addComponents(acceptButton);

  return withBrandAssets({
    embeds: [rulesEmbed],
    components: [row],
    files: [bannerAttachment],
  });
}

export async function publishRules({ guild, channelId, roleId }) {
  const channel =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));

  if (!channel || !channel.isTextBased()) {
    throw new Error('Le salon sélectionné pour le règlement est introuvable ou non textuel.');
  }

  const payload = await buildRulesMessagePayload();
  const sentMessage = await channel.send(payload);

  const serializedContent = OFFICIAL_RULES_FIELDS.map(
    (f) => `${f.name}\n${f.value}`,
  ).join('\n\n');

  const saved = upsertRulesSettings({
    guildId: guild.id,
    channelId: channel.id,
    roleId,
    messageId: sentMessage.id,
    title: OFFICIAL_RULES_TITLE,
    content: serializedContent,
  });

  return { saved, sentMessage };
}

export async function handleAcceptRulesButton(interaction) {
  const settings = getRulesSettings(interaction.guild.id);
  if (!settings) {
    await interaction.reply({
      content: '❌ The rules system is not configured on this server yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const role =
    interaction.guild.roles.cache.get(settings.roleId) ||
    (await interaction.guild.roles.fetch(settings.roleId).catch(() => null));

  if (!role) {
    await interaction.reply({
      content:
        '❌ The configured role could not be found. Please contact an administrator.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member =
    interaction.guild.members.cache.get(interaction.user.id) ||
    (await interaction.guild.members.fetch(interaction.user.id));

  if (member.roles.cache.has(role.id)) {
    await interaction.reply({
      content: `✅ You have already accepted the rules and already have the <@&${role.id}> role.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await member.roles.add(role, 'Server rules accepted');
    await interaction.reply({
      content: `✅ Thank you! You have accepted the rules and received the <@&${role.id}> role.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('[RULES] Impossible d’attribuer le rôle:', error);
    await interaction.reply({
      content:
        '❌ I do not have permission to assign this role. Please notify an administrator.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
