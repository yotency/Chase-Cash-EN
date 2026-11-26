import { Events, MessageFlags, PermissionFlagsBits } from 'discord.js';
import {
  getTicketCategory,
  TICKET_ADD_MEMBER_BTN_ID,
  TICKET_ADD_MEMBER_SELECT_ID,
  TICKET_CLOSE_CANCEL_ID,
  TICKET_CLOSE_CONFIRM_ID,
  TICKET_CLOSE_REQUEST_ID,
  TICKET_MODAL_PREFIX,
  TICKET_REMOVE_MEMBER_BTN_ID,
  TICKET_REMOVE_MEMBER_SELECT_ID,
  TICKET_SELECT_ID,
} from '../config/ticketConfig.js';
import { getTicketByChannel, getTicketSettings } from '../db/database.js';
import {
  buildCategoryModal,
  buildCloseConfirmationComponents,
  buildMemberSelectMenu,
  createTicketChannel,
  extractModalFormData,
  finalizeTicketClose,
  isTicketStaff,
} from '../services/ticketService.js';
import {
  handleAcceptRulesButton,
  RULES_ACCEPT_ID,
} from '../services/rulesService.js';
import {
  findBroadcastTypeForModal,
  handleBroadcastModalSubmit,
} from '../services/broadcastService.js';
import {
  AVIS_MODAL_ID,
  AVIS_OPEN_BUTTON_ID,
  handleAvisModalSubmit,
  handleAvisOpenButton,
} from '../services/avisService.js';
import { createBrandEmbed, withBrandAssets } from '../utils/embed.js';

export const name = Events.InteractionCreate;
export const once = false;

const closingTickets = new Set();

async function handleChatInputCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`[CMD] Commande inconnue : /${interaction.commandName}`);
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Cette commande est réservée uniquement aux administrateurs du serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await command.execute(interaction);
}

async function handleSelectMenu(interaction) {
  if (interaction.customId !== TICKET_SELECT_ID) return;

  const selectedKey = interaction.values[0];
  const modal = buildCategoryModal(selectedKey);
  if (!modal) {
    await interaction.reply({
      content: '❌ Invalid ticket category.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(modal);
  await interaction.message
    .edit({ components: interaction.message.components })
    .catch(() => {});
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === AVIS_MODAL_ID) {
    await handleAvisModalSubmit(interaction);
    return;
  }

  if (findBroadcastTypeForModal(interaction.customId)) {
    await handleBroadcastModalSubmit(interaction);
    return;
  }

  if (!interaction.customId.startsWith(TICKET_MODAL_PREFIX)) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const categoryKey = interaction.customId.slice(TICKET_MODAL_PREFIX.length);
  const category = getTicketCategory(categoryKey);
  if (!category) {
    await interaction.editReply({ content: '❌ Unknown ticket category.' });
    return;
  }

  const settings = getTicketSettings(interaction.guild.id);
  if (!settings) {
    await interaction.editReply({
      content: '❌ The ticket system is not configured on this server yet.',
    });
    return;
  }

  const formData = extractModalFormData(category, interaction);
  const { ticketChannel, paddedNumber } = await createTicketChannel({
    guild: interaction.guild,
    member: interaction.member,
    category,
    formData,
    settings,
  });

  await interaction.editReply({
    content: `✅ Your ticket **#${paddedNumber}** (${category.label}) has been created: <#${ticketChannel.id}>`,
  });
}

async function handleUserSelectMenu(interaction) {
  const isAdd = interaction.customId === TICKET_ADD_MEMBER_SELECT_ID;
  const isRemove = interaction.customId === TICKET_REMOVE_MEMBER_SELECT_ID;
  if (!isAdd && !isRemove) return;

  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status !== 'open') {
    await interaction.update({
      content: '❌ This ticket is already closed or could not be found.',
      components: [],
    });
    return;
  }

  const settings = getTicketSettings(interaction.guild.id);
  if (!isTicketStaff(interaction.member, settings)) {
    await interaction.update({
      content: '❌ Only staff members can manage ticket participants.',
      components: [],
    });
    return;
  }

  const changedIds = [];
  const skippedNotes = [];

  for (const userId of interaction.values) {
    if (isAdd) {
      const targetMember = await interaction.guild.members
        .fetch(userId)
        .catch(() => null);
      if (!targetMember) {
        skippedNotes.push(`<@${userId}> (not found on server)`);
        continue;
      }

      await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      });
      changedIds.push(userId);
    } else {
      if (userId === ticket.ownerId) {
        skippedNotes.push(`<@${userId}> (ticket owner)`);
        continue;
      }
      if (userId === interaction.client.user.id) {
        skippedNotes.push(`<@${userId}> (bot)`);
        continue;
      }

      await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: false,
        SendMessages: false,
      });
      changedIds.push(userId);
    }
  }

  const statusParts = [];
  if (changedIds.length > 0) {
    const list = changedIds.map((id) => `<@${id}>`).join(', ');
    statusParts.push(
      isAdd
        ? `✅ Member(s) added: ${list}`
        : `✅ Member(s) removed: ${list}`,
    );
  }
  if (skippedNotes.length > 0) {
    statusParts.push(`⚠️ Skipped: ${skippedNotes.join(', ')}`);
  }

  await interaction.update({
    content: statusParts.join('\n') || 'No changes were made.',
    components: [],
  });

  if (changedIds.length > 0) {
    const mentions = changedIds.map((id) => `<@${id}>`).join(', ');
    const logEmbed = createBrandEmbed()
      .setTitle(isAdd ? '➕ Member(s) Added to Ticket' : '➖ Member(s) Removed from Ticket')
      .setDescription(
        isAdd
          ? `${mentions} was/were added to the ticket by <@${interaction.user.id}>.`
          : `${mentions} was/were removed from the ticket by <@${interaction.user.id}>.`,
      );

    const payload = await withBrandAssets({ embeds: [logEmbed] });
    await interaction.channel.send(payload);
  }
}

async function handleButton(interaction) {
  if (interaction.customId === AVIS_OPEN_BUTTON_ID) {
    await handleAvisOpenButton(interaction);
    return;
  }

  if (interaction.customId === RULES_ACCEPT_ID) {
    await handleAcceptRulesButton(interaction);
    return;
  }

  if (
    interaction.customId === TICKET_ADD_MEMBER_BTN_ID ||
    interaction.customId === TICKET_REMOVE_MEMBER_BTN_ID
  ) {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status !== 'open') {
      await interaction.reply({
        content: '❌ This ticket is already closed or could not be found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = getTicketSettings(interaction.guild.id);
    if (!isTicketStaff(interaction.member, settings)) {
      await interaction.reply({
        content: '❌ Only staff members can manage ticket participants.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const action = interaction.customId === TICKET_ADD_MEMBER_BTN_ID ? 'add' : 'remove';
    await interaction.reply({
      content:
        action === 'add'
          ? '➕ Select the member(s) to **add** to this ticket:'
          : '➖ Select the member(s) to **remove** from this ticket:',
      components: buildMemberSelectMenu(action),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === TICKET_CLOSE_REQUEST_ID) {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status !== 'open') {
      await interaction.reply({
        content: '❌ This ticket is already closed or could not be found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = getTicketSettings(interaction.guild.id);
    const canClose =
      interaction.user.id === ticket.ownerId ||
      isTicketStaff(interaction.member, settings);

    if (!canClose) {
      await interaction.reply({
        content: '❌ You do not have permission to close this ticket.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content:
        '⚠️ Are you sure you want to close this ticket? A transcript will be sent to the player and to the logs channel before the channel is deleted.',
      components: buildCloseConfirmationComponents(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === TICKET_CLOSE_CANCEL_ID) {
    await interaction.update({
      content: 'Ticket closure cancelled.',
      components: [],
    });
    return;
  }

  if (interaction.customId === TICKET_CLOSE_CONFIRM_ID) {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.status !== 'open' || closingTickets.has(interaction.channelId)) {
      await interaction.update({
        content: 'This ticket is already being closed or is already closed.',
        components: [],
      });
      return;
    }

    closingTickets.add(interaction.channelId);
    try {
      await interaction.update({
        content: '🔒 Closing ticket and generating transcript...',
        components: [],
      });

      await finalizeTicketClose({
        channel: interaction.channel,
        guild: interaction.guild,
        closedByUser: interaction.user,
        ticket,
      });
    } finally {
      closingTickets.delete(interaction.channelId);
    }
  }
}

export async function execute(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isUserSelectMenu()) {
      await handleUserSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (error) {
    console.error('[INTERACTION] Erreur:', error);
    const payload = {
      content: 'An error occurred while processing this interaction.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}
