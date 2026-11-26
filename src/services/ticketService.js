import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  getTicketCategory,
  TICKET_ADD_MEMBER_BTN_ID,
  TICKET_ADD_MEMBER_SELECT_ID,
  TICKET_CATEGORIES,
  TICKET_CLOSE_CANCEL_ID,
  TICKET_CLOSE_CONFIRM_ID,
  TICKET_CLOSE_REQUEST_ID,
  TICKET_MODAL_PREFIX,
  TICKET_REMOVE_MEMBER_BTN_ID,
  TICKET_REMOVE_MEMBER_SELECT_ID,
  TICKET_SELECT_ID,
} from '../config/ticketConfig.js';
import {
  closeTicketRecord,
  createTicketRecord,
  getTicketSettings,
  incrementTicketCounter,
} from '../db/database.js';
import { createBrandEmbed, withBrandAssets } from '../utils/embed.js';

const TICKET_BANNER_FILENAME = 'ticket-banner.jpg';
const TICKET_BANNER_PATH = path.resolve(
  process.cwd(),
  'src/assets',
  TICKET_BANNER_FILENAME,
);

let cachedTicketBannerPromise = null;

async function getTicketBannerBuffer() {
  if (!cachedTicketBannerPromise) {
    cachedTicketBannerPromise = fs.readFile(TICKET_BANNER_PATH).catch((error) => {
      cachedTicketBannerPromise = null;
      throw error;
    });
  }
  return cachedTicketBannerPromise;
}

export function isTicketStaff(member, settings) {
  if (!member) return false;
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }
  return Boolean(settings?.staffRoleId && member.roles.cache.has(settings.staffRoleId));
}

export async function buildTicketPanelPayload() {
  const bannerAttachment = new AttachmentBuilder(await getTicketBannerBuffer(), {
    name: TICKET_BANNER_FILENAME,
  });

  const embed = createBrandEmbed()
    .setTitle('Support Center — Chase & Cash')
    .setDescription(
      'Need to contact our team? Select the category that best matches your request from the menu below, then fill out the form.',
    )
    .setImage(`attachment://${TICKET_BANNER_FILENAME}`);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_SELECT_ID)
    .setPlaceholder('Select a ticket category...')
    .addOptions(
      Object.values(TICKET_CATEGORIES).map((cat) => ({
        label: cat.label,
        description: cat.description,
        value: cat.key,
        emoji: cat.emoji,
      })),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return withBrandAssets({
    embeds: [embed],
    components: [row],
    files: [bannerAttachment],
  });
}

export function buildCategoryModal(categoryKey) {
  const category = getTicketCategory(categoryKey);
  if (!category) return null;

  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_MODAL_PREFIX}${category.key}`)
    .setTitle(category.modalTitle);

  for (const field of category.fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.style)
      .setRequired(field.required);

    if (field.minLength) input.setMinLength(field.minLength);
    if (field.maxLength) input.setMaxLength(field.maxLength);
    if (field.placeholder) input.setPlaceholder(field.placeholder);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

export function extractModalFormData(category, interaction) {
  return category.fields.map((field) => {
    const rawValue = interaction.fields.getTextInputValue(field.id)?.trim() || '';
    return {
      id: field.id,
      label: field.label.replace(/\s*\((?:min\.\s*40\s*(?:characters|chars)|optional)\)/gi, ''),
      value: rawValue || 'Not provided',
      provided: Boolean(rawValue),
    };
  });
}

export async function createTicketChannel({
  guild,
  member,
  category,
  formData,
  settings,
}) {
  const ticketNumber = incrementTicketCounter(guild.id);
  const paddedNumber = String(ticketNumber).padStart(4, '0');
  const channelName = `ticket-${category.channelPrefix}-${paddedNumber}`;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  const validStaffRole =
    settings.staffRoleId && guild.roles.cache.has(settings.staffRoleId)
      ? settings.staffRoleId
      : null;

  if (validStaffRole) {
    permissionOverwrites.push({
      id: validStaffRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: settings.categoryId,
    topic: `Ticket #${paddedNumber} (${category.label}) • Opened by ${member.user.tag}`,
    permissionOverwrites,
  });

  createTicketRecord({
    channelId: ticketChannel.id,
    guildId: guild.id,
    ticketNumber,
    ownerId: member.id,
    category: category.key,
    formData,
  });

  const embedFields = formData.map((entry) => ({
    name: entry.label,
    value: entry.value.slice(0, 1024),
    inline: false,
  }));

  const staffNotice = validStaffRole
    ? `<@${member.id}> <@&${validStaffRole}>`
    : `<@${member.id}>`;

  const ticketEmbed = createBrandEmbed()
    .setTitle(`${category.emoji} Ticket #${paddedNumber} — ${category.label}`)
    .setDescription(
      `Hello <@${member.id}>, your ticket has been opened.\n` +
        `A staff member will assist you shortly.\n\n` +
        `**Submitted information:**`,
    )
    .addFields(embedFields);

  const addButton = new ButtonBuilder()
    .setCustomId(TICKET_ADD_MEMBER_BTN_ID)
    .setLabel('Add Member')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('➕');

  const removeButton = new ButtonBuilder()
    .setCustomId(TICKET_REMOVE_MEMBER_BTN_ID)
    .setLabel('Remove Member')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('➖');

  const closeButton = new ButtonBuilder()
    .setCustomId(TICKET_CLOSE_REQUEST_ID)
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  const actionRow = new ActionRowBuilder().addComponents(
    addButton,
    removeButton,
    closeButton,
  );

  const openingPayload = await withBrandAssets({
    content: `${staffNotice} — New ticket opened!`,
    embeds: [ticketEmbed],
    components: [actionRow],
  });

  await ticketChannel.send(openingPayload);
  return { ticketChannel, ticketNumber, paddedNumber };
}

export function buildMemberSelectMenu(action) {
  const isAdd = action === 'add';
  const select = new UserSelectMenuBuilder()
    .setCustomId(isAdd ? TICKET_ADD_MEMBER_SELECT_ID : TICKET_REMOVE_MEMBER_SELECT_ID)
    .setPlaceholder(
      isAdd
        ? 'Select one or more members to add...'
        : 'Select one or more members to remove...',
    )
    .setMinValues(1)
    .setMaxValues(5);

  return [new ActionRowBuilder().addComponents(select)];
}

export function buildCloseConfirmationComponents() {
  const confirmButton = new ButtonBuilder()
    .setCustomId(TICKET_CLOSE_CONFIRM_ID)
    .setLabel('Confirm Close')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('✅');

  const cancelButton = new ButtonBuilder()
    .setCustomId(TICKET_CLOSE_CANCEL_ID)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('❌');

  return [new ActionRowBuilder().addComponents(confirmButton, cancelButton)];
}

async function fetchAllChannelMessages(channel) {
  const allMessages = [];
  let beforeId;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(beforeId ? { before: beforeId } : {}),
    });

    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    if (batch.size < 100) break;
    beforeId = batch.last().id;
  }

  return allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function formatDateEn(isoOrMs) {
  return new Date(isoOrMs).toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + ' UTC';
}

function buildTranscriptText({ ticket, category, ownerTag, closedByTag, messages }) {
  const paddedNumber = String(ticket.ticketNumber).padStart(4, '0');
  const lines = [
    '============================================================',
    `TICKET TRANSCRIPT #${paddedNumber} — CHASE & CASH`,
    '============================================================',
    `Category    : ${category?.label || ticket.category}`,
    `Opened by   : ${ownerTag} (${ticket.ownerId})`,
    `Closed by   : ${closedByTag}`,
    `Opened at   : ${formatDateEn(ticket.createdAt)}`,
    `Closed at   : ${formatDateEn(Date.now())}`,
    `Messages    : ${messages.length}`,
    '',
    '--- INITIAL FORM ---',
  ];

  for (const field of ticket.formData) {
    lines.push(`${field.label} : ${field.value}`);
  }

  lines.push('', '--- MESSAGE HISTORY ---', '');

  for (const msg of messages) {
    const timestamp = formatDateEn(msg.createdTimestamp);
    const authorName = msg.member?.displayName || msg.author?.username || 'Unknown';
    const authorTag = msg.author?.tag || msg.author?.id || 'unknown';
    lines.push(`[${timestamp}] ${authorName} (${authorTag})`);

    if (msg.content) {
      lines.push(msg.content);
    }

    for (const embed of msg.embeds) {
      const parts = [embed.title, embed.description].filter(Boolean);
      if (embed.fields?.length) {
        for (const f of embed.fields) {
          parts.push(`${f.name}: ${f.value}`);
        }
      }
      if (parts.length) {
        lines.push(`[Embed] ${parts.join(' | ')}`);
      }
    }

    if (msg.attachments.size > 0) {
      for (const att of msg.attachments.values()) {
        lines.push(`[Attachment: ${att.name}] ${att.url}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export async function finalizeTicketClose({ channel, guild, closedByUser, ticket }) {
  const settings = getTicketSettings(guild.id);
  const category = getTicketCategory(ticket.category);
  const paddedNumber = String(ticket.ticketNumber).padStart(4, '0');

  const ownerMember = await guild.members.fetch(ticket.ownerId).catch(() => null);
  const ownerUser =
    ownerMember?.user || (await guild.client.users.fetch(ticket.ownerId).catch(() => null));
  const ownerTag = ownerUser?.tag || ticket.ownerId;

  const messages = await fetchAllChannelMessages(channel);
  const transcriptText = buildTranscriptText({
    ticket,
    category,
    ownerTag,
    closedByTag: `${closedByUser.tag} (${closedByUser.id})`,
    messages,
  });

  const transcriptFilename = `transcript-ticket-${paddedNumber}.txt`;
  const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');

  closeTicketRecord(channel.id, closedByUser.id);

  // 1. DM to ticket owner
  let dmSent = false;
  let dmError = null;
  if (ownerUser) {
    try {
      const dmEmbed = createBrandEmbed()
        .setTitle(`🔒 Ticket #${paddedNumber} Closed`)
        .setDescription(
          `Your **${category?.label || ticket.category}** ticket on **${guild.name}** has been closed by <@${closedByUser.id}>.\n` +
            `You will find the full transcript attached below.`,
        )
        .addFields(
          { name: 'Category', value: category?.label || ticket.category, inline: true },
          { name: 'Messages', value: String(messages.length), inline: true },
        );

      const dmPayload = await withBrandAssets({
        embeds: [dmEmbed],
        files: [new AttachmentBuilder(transcriptBuffer, { name: transcriptFilename })],
      });

      await ownerUser.send(dmPayload);
      dmSent = true;
    } catch (error) {
      dmError = error.message || String(error);
    }
  } else {
    dmError = 'User not found';
  }

  // 2. Send to logs channel
  if (settings?.logChannelId) {
    try {
      const logChannel =
        guild.channels.cache.get(settings.logChannelId) ||
        (await guild.channels.fetch(settings.logChannelId));

      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = createBrandEmbed()
          .setTitle(`📄 Transcript — Ticket #${paddedNumber}`)
          .addFields(
            { name: 'Category', value: category?.label || ticket.category, inline: true },
            { name: 'Opened by', value: `<@${ticket.ownerId}> (\`${ownerTag}\`)`, inline: true },
            { name: 'Closed by', value: `<@${closedByUser.id}>`, inline: true },
            { name: 'Messages', value: String(messages.length), inline: true },
            {
              name: 'DM sent to player',
              value: dmSent ? '✅ Yes' : `❌ No (${dmError || 'DMs closed'})`,
              inline: true,
            },
          );

        const logPayload = await withBrandAssets({
          embeds: [logEmbed],
          files: [new AttachmentBuilder(transcriptBuffer, { name: transcriptFilename })],
        });

        await logChannel.send(logPayload);
      }
    } catch (error) {
      console.error('[TICKET] Erreur lors de l’envoi dans le salon de logs:', error);
    }
  }

  // 3. Delete ticket channel after a short delay
  await channel
    .send('🔒 Ticket closed. Transcript saved — deleting channel in 3 seconds...')
    .catch(() => {});

  setTimeout(() => {
    channel.delete(`Ticket #${paddedNumber} closed by ${closedByUser.tag}`).catch((err) => {
      console.error('[TICKET] Impossible de supprimer le salon:', err);
    });
  }, 3000);
}
