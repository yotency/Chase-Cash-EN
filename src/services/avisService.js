import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  createAvisEntry,
  getAvisSettings,
  upsertAvisSettings,
} from '../db/database.js';
import { createBrandEmbed, withBrandAssets } from '../utils/embed.js';

export const AVIS_OPEN_BUTTON_ID = 'avis_open_modal';
export const AVIS_MODAL_ID = 'avis_submit_modal';

const AVIS_BANNER_FILENAME = 'avis-banner.jpg';
const AVIS_BANNER_PATH = path.resolve(
  process.cwd(),
  'src/assets',
  AVIS_BANNER_FILENAME,
);

let cachedAvisBannerPromise = null;

async function getAvisBannerBuffer() {
  if (!cachedAvisBannerPromise) {
    cachedAvisBannerPromise = fs.readFile(AVIS_BANNER_PATH).catch((error) => {
      cachedAvisBannerPromise = null;
      throw error;
    });
  }
  return cachedAvisBannerPromise;
}

const TITLE_INPUT_ID = 'avis_title';
const DESCRIPTION_INPUT_ID = 'avis_description';
const SERVER_RATING_INPUT_ID = 'avis_server_rating';
const STAFF_RATING_INPUT_ID = 'avis_staff_rating';

export function parseStarRating(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const match = rawInput.trim().match(/^([1-5])(?:\s*\/\s*5)?$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function formatStars(rating) {
  const clamped = Math.min(5, Math.max(1, rating));
  return `${'⭐'.repeat(clamped)}${'☆'.repeat(5 - clamped)} (**${clamped}/5**)`;
}

export async function buildAvisPanelPayload({ publishChannelId }) {
  const bannerAttachment = new AttachmentBuilder(await getAvisBannerBuffer(), {
    name: AVIS_BANNER_FILENAME,
  });

  const embed = createBrandEmbed({ footerExtra: 'Your feedback matters' })
    .setTitle('⭐ Share Your Feedback — Chase & Cash')
    .setDescription(
      'Your opinion helps us improve the server and community!\n\n' +
        'You can share here:\n' +
        '• 🏙️ **Your overall review of the Chase & Cash server** (gameplay, content, atmosphere…)\n' +
        '• 🛡️ **Your feedback on the staff team** (support, availability, fairness, responsiveness…)\n\n' +
        'Click the button below to rate both the server and the staff from **1 to 5 stars**, with an optional title and comment.\n' +
        `All submitted reviews are published in <#${publishChannelId}>.`,
    )
    .setImage(`attachment://${AVIS_BANNER_FILENAME}`);

  const button = new ButtonBuilder()
    .setCustomId(AVIS_OPEN_BUTTON_ID)
    .setLabel('Leave a Review')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('⭐');

  const row = new ActionRowBuilder().addComponents(button);

  return withBrandAssets({
    embeds: [embed],
    components: [row],
    files: [bannerAttachment],
  });
}

export function buildAvisModal() {
  const modal = new ModalBuilder()
    .setCustomId(AVIS_MODAL_ID)
    .setTitle('Leave a Review — Chase & Cash');

  const titleInput = new TextInputBuilder()
    .setCustomId(TITLE_INPUT_ID)
    .setLabel('Review title (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. Awesome server and super helpful staff!')
    .setMaxLength(100)
    .setRequired(false);

  const descriptionInput = new TextInputBuilder()
    .setCustomId(DESCRIPTION_INPUT_ID)
    .setLabel('Description / Comment (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      'Share your thoughts about the Chase & Cash server and/or the staff team...',
    )
    .setMaxLength(1500)
    .setRequired(false);

  const serverRatingInput = new TextInputBuilder()
    .setCustomId(SERVER_RATING_INPUT_ID)
    .setLabel('Chase & Cash Server Rating (1 to 5)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter a number between 1 and 5 (e.g. 5)')
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true);

  const staffRatingInput = new TextInputBuilder()
    .setCustomId(STAFF_RATING_INPUT_ID)
    .setLabel('Staff Team Rating (1 to 5)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Enter a number between 1 and 5 (e.g. 5)')
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(serverRatingInput),
    new ActionRowBuilder().addComponents(staffRatingInput),
  );

  return modal;
}

export async function publishAvisPanel({ guild, panelChannel, publishChannel }) {
  const payload = await buildAvisPanelPayload({
    publishChannelId: publishChannel.id,
  });
  const sentMessage = await panelChannel.send(payload);

  const saved = upsertAvisSettings({
    guildId: guild.id,
    panelChannelId: panelChannel.id,
    publishChannelId: publishChannel.id,
    panelMessageId: sentMessage.id,
  });

  return { saved, sentMessage };
}

export async function handleAvisOpenButton(interaction) {
  const settings = getAvisSettings(interaction.guild.id);
  if (!settings) {
    await interaction.reply({
      content: '❌ The review system is not configured on this server yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(buildAvisModal());
}

export async function buildPublishedAvisPayload({
  authorUser,
  authorDisplayName,
  avisNumber,
  title,
  description,
  serverRating,
  staffRating,
}) {
  const average = (serverRating + staffRating) / 2;
  const formattedAverage = Number.isInteger(average)
    ? `${average}`
    : average.toFixed(1);

  const embedColor =
    average >= 4 ? 0xf5b942 : average >= 2.5 ? 0xe67e22 : 0xe74c3c;

  const paddedNumber = String(avisNumber).padStart(4, '0');
  const avatarUrl =
    typeof authorUser.displayAvatarURL === 'function'
      ? authorUser.displayAvatarURL({ extension: 'png', size: 256 })
      : null;

  const embed = createBrandEmbed({
    color: embedColor,
    footerExtra: `Review #${paddedNumber}`,
  })
    .setTitle(title ? `💬 ${title}` : '⭐ New Review — Chase & Cash')
    .addFields(
      {
        name: '🏙️ Server Rating',
        value: formatStars(serverRating),
        inline: true,
      },
      {
        name: '🛡️ Staff Rating',
        value: formatStars(staffRating),
        inline: true,
      },
      {
        name: '📊 Average',
        value: `**${formattedAverage} / 5**`,
        inline: true,
      },
      {
        name: '👤 Author',
        value: `<@${authorUser.id}> (\`${authorUser.tag || authorUser.username}\`)`,
        inline: false,
      },
    );

  if (description) {
    embed.setDescription(description);
  } else {
    embed.setDescription(`*Review submitted by <@${authorUser.id}>.*`);
  }

  if (avatarUrl) {
    embed.setAuthor({
      name: authorDisplayName || authorUser.username,
      iconURL: avatarUrl,
    });
    embed.setThumbnail(avatarUrl);
  }

  return withBrandAssets({ embeds: [embed] });
}

export async function handleAvisModalSubmit(interaction) {
  const settings = getAvisSettings(interaction.guild.id);
  if (!settings) {
    await interaction.reply({
      content: '❌ The review system is not configured on this server yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawTitle = interaction.fields.getTextInputValue(TITLE_INPUT_ID).trim();
  const rawDescription = interaction.fields
    .getTextInputValue(DESCRIPTION_INPUT_ID)
    .trim();
  const rawServerRating = interaction.fields.getTextInputValue(
    SERVER_RATING_INPUT_ID,
  );
  const rawStaffRating = interaction.fields.getTextInputValue(
    STAFF_RATING_INPUT_ID,
  );

  const serverRating = parseStarRating(rawServerRating);
  if (!serverRating) {
    await interaction.reply({
      content:
        '❌ The **server rating** must be a whole number between **1** and **5** (e.g. `5`).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const staffRating = parseStarRating(rawStaffRating);
  if (!staffRating) {
    await interaction.reply({
      content:
        '❌ The **staff rating** must be a whole number between **1** and **5** (e.g. `5`).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const publishChannel =
    interaction.guild.channels.cache.get(settings.publishChannelId) ||
    (await interaction.guild.channels
      .fetch(settings.publishChannelId)
      .catch(() => null));

  if (!publishChannel || !publishChannel.isTextBased()) {
    await interaction.editReply({
      content:
        '❌ The review publication channel could not be found. Please notify an administrator.',
    });
    return;
  }

  const title = rawTitle || null;
  const description = rawDescription || null;

  const savedEntry = createAvisEntry({
    guildId: interaction.guild.id,
    authorId: interaction.user.id,
    authorTag: interaction.user.tag || interaction.user.username,
    title,
    description,
    serverRating,
    staffRating,
  });

  const authorDisplayName =
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username;

  const payload = await buildPublishedAvisPayload({
    authorUser: interaction.user,
    authorDisplayName,
    avisNumber: savedEntry.avisNumber,
    title,
    description,
    serverRating,
    staffRating,
  });

  await publishChannel.send(payload);

  await interaction.editReply({
    content: `✅ Thank you for your review! It has been published in <#${publishChannel.id}>.`,
  });
}
