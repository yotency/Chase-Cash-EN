import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AttachmentBuilder,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { createBrandEmbed, withBrandAssets } from '../../utils/embed.js';

export const access = 'admin';

const BANNER_FILENAME = 'annonce-banner.jpg';
const BANNER_PATH = path.resolve(process.cwd(), 'src/assets', BANNER_FILENAME);

let cachedBannerPromise = null;

async function getBannerBuffer() {
  if (!cachedBannerPromise) {
    cachedBannerPromise = fs.readFile(BANNER_PATH).catch((error) => {
      cachedBannerPromise = null;
      throw error;
    });
  }
  return cachedBannerPromise;
}

export const data = new SlashCommandBuilder()
  .setName('devencours')
  .setDescription('Publier l’annonce officielle "Server in Development" (EN) avec lien d’invitation')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('salon')
      .setDescription('Salon où publier le message (par défaut : ce salon)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false),
  )
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription('Rôle à ping avec l’annonce (facultatif)')
      .setRequired(false),
  );

export async function buildDevEnCoursPayload({ content, allowedMentions } = {}) {
  const bannerAttachment = new AttachmentBuilder(await getBannerBuffer(), {
    name: BANNER_FILENAME,
  });

  const embed = createBrandEmbed({ footerExtra: 'Under Development' })
    .setTitle('🚧 Server in Development — Chase & Cash')
    .setDescription(
      'We are excited to announce the creation of our **Chase & Cash** server!\n' +
        'The concept is simple: **robbers, cops, and as much cash as you can stack!** 💰🚨\n\n' +
        'Stay tuned — the server is currently **under active development**, and sneak peeks, updates, and official announcements are coming very soon!',
    )
    .addFields(
      {
        name: '🔥 The Concept',
        value:
          'Choose your side on the streets of Los Santos: pull off back-to-back heists and high-speed chases to build your fortune, or join the police to hunt down criminals and keep the city in check.',
        inline: false,
      },
      {
        name: '⏳ Coming Soon',
        value:
          'Our team is working hard to deliver a smooth, intense, and unforgettable experience. Keep an eye on the announcement channels so you don’t miss a thing!',
        inline: false,
      },
      {
        name: '🤝 While You Wait — Invite Your Friends!',
        value:
          'Help grow the **Chase & Cash** community before launch! Click the copy icon below to share our Discord invite link directly:\n' +
          '```\nhttps://discord.gg/chasecash\n```',
        inline: false,
      },
    )
    .setImage(`attachment://${BANNER_FILENAME}`);

  const payload = {
    embeds: [embed],
    files: [bannerAttachment],
  };

  if (content) payload.content = content;
  if (allowedMentions) payload.allowedMentions = allowedMentions;

  return withBrandAssets(payload);
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetChannel =
    interaction.options.getChannel('salon') || interaction.channel;
  const role = interaction.options.getRole('role');

  if (!targetChannel || !targetChannel.isTextBased()) {
    await interaction.editReply({
      content: '❌ Le salon cible est introuvable ou ne permet pas l’envoi de messages.',
    });
    return;
  }

  let content;
  let allowedMentions;
  if (role) {
    if (role.id === interaction.guild.roles.everyone.id) {
      content = '@everyone';
      allowedMentions = { parse: ['everyone'] };
    } else {
      content = `<@&${role.id}>`;
      allowedMentions = { roles: [role.id] };
    }
  }

  const payload = await buildDevEnCoursPayload({ content, allowedMentions });
  await targetChannel.send(payload);

  const pingInfo = content ? ` avec mention de ${content}` : '';
  await interaction.editReply({
    content: `✅ Annonce **Server in Development (EN)** publiée dans <#${targetChannel.id}>${pingInfo}.`,
  });
}
