import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createBrandEmbed, withBrandAssets } from '../utils/embed.js';

const TITLE_INPUT_ID = 'broadcast_title';
const DESCRIPTION_INPUT_ID = 'broadcast_description';

export const BROADCAST_CONFIGS = {
  annonce: {
    modalPrefix: 'annonce_modal:',
    modalTitle: 'Nouvelle annonce (EN) — Chase & Cash',
    titleLabel: 'Titre de l’annonce (en anglais)',
    titlePlaceholder: 'Ex : Special Weekend Heist Event',
    descriptionLabel: 'Description de l’annonce (en anglais)',
    descriptionPlaceholder: 'Rédige ici le contenu en anglais de ton annonce...',
    bannerFilename: 'annonce-banner.jpg',
    publishedLabel: 'Annonce publiée',
  },
  maj: {
    modalPrefix: 'maj_modal:',
    modalTitle: 'Nouvelle mise à jour (EN) — Chase & Cash',
    titleLabel: 'Titre de la mise à jour (en anglais)',
    titlePlaceholder: 'Ex : Patch Notes v1.2 — New Features & Fixes',
    descriptionLabel: 'Contenu de la mise à jour (en anglais)',
    descriptionPlaceholder: 'Liste ici les ajouts, modifications et correctifs en anglais...',
    bannerFilename: 'maj-banner.jpg',
    publishedLabel: 'Mise à jour publiée',
  },
  maintenance: {
    modalPrefix: 'maintenance_modal:',
    modalTitle: 'Avis de maintenance (EN) — Chase & Cash',
    titleLabel: 'Titre de la maintenance (en anglais)',
    titlePlaceholder: 'Ex : Scheduled Technical Maintenance Tonight',
    descriptionLabel: 'Détails de la maintenance (en anglais)',
    descriptionPlaceholder: 'Indique ici les raisons, la durée estimée et les infos en anglais...',
    bannerFilename: 'maintenance-banner.jpg',
    publishedLabel: 'Avis de maintenance publié',
  },
};

const bannerCache = new Map();

async function getBannerBuffer(filename) {
  if (!bannerCache.has(filename)) {
    const filePath = path.resolve(process.cwd(), 'src/assets', filename);
    const promise = fs.readFile(filePath).catch((error) => {
      bannerCache.delete(filename);
      throw error;
    });
    bannerCache.set(filename, promise);
  }
  return bannerCache.get(filename);
}

export function buildBroadcastCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('Rôle à ping avec le message (facultatif)')
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName('salon')
        .setDescription('Salon où publier le message (par défaut : ce salon)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    );
}

export function buildBroadcastModal(type, { targetChannelId, roleId = null }) {
  const config = BROADCAST_CONFIGS[type];
  if (!config) {
    throw new Error(`Type de broadcast inconnu : ${type}`);
  }

  const customId = roleId
    ? `${config.modalPrefix}${targetChannelId}:${roleId}`
    : `${config.modalPrefix}${targetChannelId}`;

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(config.modalTitle);

  const titleInput = new TextInputBuilder()
    .setCustomId(TITLE_INPUT_ID)
    .setLabel(config.titleLabel)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(config.titlePlaceholder)
    .setMaxLength(256)
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId(DESCRIPTION_INPUT_ID)
    .setLabel(config.descriptionLabel)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(config.descriptionPlaceholder)
    .setMaxLength(4000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descriptionInput),
  );

  return modal;
}

export function findBroadcastTypeForModal(customId) {
  for (const [type, config] of Object.entries(BROADCAST_CONFIGS)) {
    if (customId.startsWith(config.modalPrefix)) {
      return type;
    }
  }
  return null;
}

function parseModalCustomId(customId, prefix, fallbackChannelId) {
  const raw = customId.slice(prefix.length);
  const [channelId, roleId] = raw.split(':');
  return {
    targetChannelId: channelId || fallbackChannelId,
    roleId: roleId || null,
  };
}

function buildMentionOptions(guild, roleId) {
  if (!roleId) {
    return { content: undefined, allowedMentions: undefined };
  }

  if (roleId === guild.roles.everyone.id) {
    return {
      content: '@everyone',
      allowedMentions: { parse: ['everyone'] },
    };
  }

  return {
    content: `<@&${roleId}>`,
    allowedMentions: { roles: [roleId] },
  };
}

export async function buildBroadcastPayload(
  type,
  { title, description, content, allowedMentions },
) {
  const config = BROADCAST_CONFIGS[type];
  if (!config) {
    throw new Error(`Type de broadcast inconnu : ${type}`);
  }

  const bannerAttachment = new AttachmentBuilder(
    await getBannerBuffer(config.bannerFilename),
    { name: config.bannerFilename },
  );

  const embed = createBrandEmbed()
    .setTitle(title)
    .setDescription(description)
    .setImage(`attachment://${config.bannerFilename}`);

  const payload = {
    embeds: [embed],
    files: [bannerAttachment],
  };

  if (content) {
    payload.content = content;
  }
  if (allowedMentions) {
    payload.allowedMentions = allowedMentions;
  }

  return withBrandAssets(payload);
}

export async function handleBroadcastModalSubmit(interaction) {
  const type = findBroadcastTypeForModal(interaction.customId);
  if (!type) return;

  const config = BROADCAST_CONFIGS[type];

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Cette action est réservée uniquement aux administrateurs du serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { targetChannelId, roleId } = parseModalCustomId(
    interaction.customId,
    config.modalPrefix,
    interaction.channelId,
  );

  const channel =
    interaction.guild.channels.cache.get(targetChannelId) ||
    (await interaction.guild.channels.fetch(targetChannelId).catch(() => null));

  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({
      content: '❌ Le salon cible est introuvable ou ne permet pas l’envoi de messages.',
    });
    return;
  }

  const title = interaction.fields.getTextInputValue(TITLE_INPUT_ID).trim();
  const description = interaction.fields
    .getTextInputValue(DESCRIPTION_INPUT_ID)
    .trim();

  if (!title || !description) {
    await interaction.editReply({
      content: '❌ Le titre et le contenu ne peuvent pas être vides.',
    });
    return;
  }

  const { content, allowedMentions } = buildMentionOptions(interaction.guild, roleId);
  const payload = await buildBroadcastPayload(type, {
    title,
    description,
    content,
    allowedMentions,
  });
  await channel.send(payload);

  const pingInfo = content ? ` avec mention de ${content}` : '';
  await interaction.editReply({
    content: `✅ ${config.publishedLabel} dans <#${channel.id}>${pingInfo}.`,
  });
}
