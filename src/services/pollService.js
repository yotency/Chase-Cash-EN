import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  closePollRecord,
  createPollRecord,
  getPollById,
  getPollVoteStats,
  setPollMessageId,
  togglePollVote,
} from '../db/database.js';
import { createBrandEmbed, withBrandAssets } from '../utils/embed.js';

export const POLL_MODAL_PREFIX = 'poll_modal:';
export const POLL_VOTE_PREFIX = 'poll_vote:';
export const POLL_CLOSE_PREFIX = 'poll_close:';

const TITLE_INPUT_ID = 'poll_title';
const DESCRIPTION_INPUT_ID = 'poll_description';
const OPTIONS_INPUT_ID = 'poll_options';
const MODE_INPUT_ID = 'poll_mode';

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;

export function parsePollMode(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const val = rawInput.trim().toLowerCase();
  if (['simple', 'unique', 'single', '1', 'one', 'no'].includes(val)) {
    return false;
  }
  if (['multiple', 'multi', 'plusieurs', 'm', 'yes'].includes(val)) {
    return true;
  }
  return null;
}

export function parsePollOptions(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return [];
  return rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 100));
}

function buildProgressBar(count, totalVotes, length = 12) {
  if (totalVotes === 0 || count === 0) {
    return '░'.repeat(length);
  }
  const filled = Math.round((count / totalVotes) * length);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, length - filled));
}

function truncateButtonLabel(text, max = 45) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function buildPollModal({ targetChannelId, roleId = null }) {
  const customId = roleId
    ? `${POLL_MODAL_PREFIX}${targetChannelId}:${roleId}`
    : `${POLL_MODAL_PREFIX}${targetChannelId}`;

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Créer un sondage (EN) — Chase & Cash');

  const titleInput = new TextInputBuilder()
    .setCustomId(TITLE_INPUT_ID)
    .setLabel('Titre du sondage (en anglais)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex : Which weekend event do you want?')
    .setMaxLength(200)
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId(DESCRIPTION_INPUT_ID)
    .setLabel('Description en anglais (facultatif)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Add extra context or details about the poll...')
    .setMaxLength(1500)
    .setRequired(false);

  const optionsInput = new TextInputBuilder()
    .setCustomId(OPTIONS_INPUT_ID)
    .setLabel('Réponses EN (1 par ligne, 2 à 10 choix)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Mega Bank Heist\nMidnight Police Chase\nPvP Tournament')
    .setMaxLength(1000)
    .setRequired(true);

  const modeInput = new TextInputBuilder()
    .setCustomId(MODE_INPUT_ID)
    .setLabel('Type de vote : simple ou multiple')
    .setStyle(TextInputStyle.Short)
    .setValue('simple')
    .setPlaceholder('simple / single ou multiple')
    .setMaxLength(20)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(optionsInput),
    new ActionRowBuilder().addComponents(modeInput),
  );

  return modal;
}

export async function buildPollMessagePayload(poll, { content, allowedMentions } = {}) {
  const stats = getPollVoteStats(poll.id, poll.options.length);
  const isClosed = poll.status === 'closed';
  const maxVotes = Math.max(...stats.counts, 0);

  const modeBadge = poll.allowMultiple
    ? '☑️ **Multiple choice** *(you may select multiple options)*'
    : '🎯 **Single choice** *(1 option only)*';

  const statusBadge = isClosed
    ? '🔴 **Poll Closed**'
    : '🟢 **Poll Open**';

  const descParts = [];
  if (poll.description) {
    descParts.push(poll.description);
    descParts.push('');
  }
  descParts.push(`${statusBadge}  •  ${modeBadge}`);

  const optionLines = poll.options.map((label, idx) => {
    const count = stats.counts[idx] || 0;
    const pct =
      stats.totalVotes > 0 ? Math.round((count / stats.totalVotes) * 100) : 0;
    const bar = buildProgressBar(count, stats.totalVotes);
    const isWinner = isClosed && maxVotes > 0 && count === maxVotes;
    const winnerTag = isWinner ? ' 🏆' : '';
    const voteWord = count === 1 ? 'vote' : 'votes';

    return `${NUMBER_EMOJIS[idx]}  **${label}**${winnerTag}\n\`${bar}\` **${pct}%** • ${count} ${voteWord}`;
  });

  const voterWord = stats.totalVoters === 1 ? 'voter' : 'voters';
  const totalVoteWord = stats.totalVotes === 1 ? 'vote' : 'votes';

  const embed = createBrandEmbed({
    color: isClosed ? 0x95a5a6 : 0xf5b942,
    footerExtra: `Poll #${String(poll.id).padStart(4, '0')} • ${stats.totalVoters} ${voterWord} (${stats.totalVotes} ${totalVoteWord})`,
  })
    .setTitle(`📊 ${poll.title}`)
    .setDescription(descParts.join('\n'))
    .addFields({
      name: isClosed ? '📋 Final Results' : '🗳️ Voting Options',
      value: optionLines.join('\n\n').slice(0, 1024),
      inline: false,
    });

  if (isClosed && poll.closedBy) {
    embed.addFields({
      name: '🔒 Closed',
      value: `Poll closed by <@${poll.closedBy}>.`,
      inline: false,
    });
  }

  const components = [];
  if (!isClosed) {
    for (let i = 0; i < poll.options.length; i += 5) {
      const row = new ActionRowBuilder();
      const slice = poll.options.slice(i, i + 5);
      for (let j = 0; j < slice.length; j += 1) {
        const optionIndex = i + j;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`${POLL_VOTE_PREFIX}${poll.id}:${optionIndex}`)
            .setLabel(truncateButtonLabel(slice[j]))
            .setEmoji(NUMBER_EMOJIS[optionIndex])
            .setStyle(ButtonStyle.Secondary),
        );
      }
      components.push(row);
    }

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${POLL_CLOSE_PREFIX}${poll.id}`)
        .setLabel('Close Poll (Admin)')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
    );
    components.push(controlRow);
  }

  const payload = {
    embeds: [embed],
    components,
  };

  if (content !== undefined) payload.content = content;
  if (allowedMentions !== undefined) payload.allowedMentions = allowedMentions;

  return withBrandAssets(payload);
}

export async function handlePollModalSubmit(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Cette action est réservée uniquement aux administrateurs du serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawId = interaction.customId.slice(POLL_MODAL_PREFIX.length);
  const [targetChannelId, roleId] = rawId.split(':');

  const title = interaction.fields.getTextInputValue(TITLE_INPUT_ID).trim();
  const description =
    interaction.fields.getTextInputValue(DESCRIPTION_INPUT_ID).trim() || null;
  const rawOptions = interaction.fields.getTextInputValue(OPTIONS_INPUT_ID);
  const rawMode = interaction.fields.getTextInputValue(MODE_INPUT_ID);

  if (!title) {
    await interaction.reply({
      content: '❌ Le titre du sondage ne peut pas être vide.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const options = parsePollOptions(rawOptions);
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    await interaction.reply({
      content: `❌ Indique entre **${MIN_OPTIONS}** et **${MAX_OPTIONS}** réponses (une par ligne). Tu en as saisi **${options.length}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const allowMultiple = parsePollMode(rawMode);
  if (allowMultiple === null) {
    await interaction.reply({
      content:
        '❌ Type de vote invalide. Écris **`simple`** / **`single`** ou **`multiple`**.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel =
    interaction.guild.channels.cache.get(targetChannelId || interaction.channelId) ||
    (await interaction.guild.channels
      .fetch(targetChannelId || interaction.channelId)
      .catch(() => null));

  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({
      content: '❌ Le salon cible est introuvable ou ne permet pas l’envoi de messages.',
    });
    return;
  }

  let content;
  let allowedMentions;
  if (roleId) {
    if (roleId === interaction.guild.roles.everyone.id) {
      content = '@everyone';
      allowedMentions = { parse: ['everyone'] };
    } else {
      content = `<@&${roleId}>`;
      allowedMentions = { roles: [roleId] };
    }
  }

  const poll = createPollRecord({
    guildId: interaction.guild.id,
    channelId: channel.id,
    creatorId: interaction.user.id,
    title,
    description,
    options,
    allowMultiple,
  });

  const payload = await buildPollMessagePayload(poll, { content, allowedMentions });
  const sentMessage = await channel.send(payload);
  setPollMessageId(poll.id, sentMessage.id);

  const pingInfo = content ? ` avec mention de ${content}` : '';
  await interaction.editReply({
    content: `✅ Sondage (EN) **#${String(poll.id).padStart(4, '0')}** publié dans <#${channel.id}>${pingInfo}.`,
  });
}

export async function handlePollVoteButton(interaction) {
  const raw = interaction.customId.slice(POLL_VOTE_PREFIX.length);
  const [rawPollId, rawOptionIndex] = raw.split(':');
  const pollId = Number.parseInt(rawPollId, 10);
  const optionIndex = Number.parseInt(rawOptionIndex, 10);

  const poll = getPollById(pollId);
  if (!poll) {
    await interaction.reply({
      content: '❌ This poll could not be found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (poll.status === 'closed') {
    await interaction.reply({
      content: '🔒 This poll is closed and no longer accepts votes.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    Number.isNaN(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= poll.options.length
  ) {
    await interaction.reply({
      content: '❌ Invalid vote option.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const result = togglePollVote({
    pollId: poll.id,
    userId: interaction.user.id,
    optionIndex,
    allowMultiple: poll.allowMultiple,
  });

  const updatedPayload = await buildPollMessagePayload(poll);
  await interaction.update(updatedPayload);

  const chosenLabel = `${NUMBER_EMOJIS[optionIndex]} **${poll.options[optionIndex]}**`;
  const feedback =
    result.action === 'removed'
      ? `↩️ Your vote for ${chosenLabel} has been removed.`
      : result.action === 'changed'
        ? `🔄 Your vote has been changed to ${chosenLabel}.`
        : `✅ Your vote for ${chosenLabel} has been recorded!`;

  await interaction.followUp({
    content: feedback,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePollCloseButton(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Only administrators can close this poll.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const pollId = Number.parseInt(
    interaction.customId.slice(POLL_CLOSE_PREFIX.length),
    10,
  );
  const poll = getPollById(pollId);
  if (!poll) {
    await interaction.reply({
      content: '❌ This poll could not be found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (poll.status === 'closed') {
    await interaction.reply({
      content: 'ℹ️ This poll is already closed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const closedPoll = closePollRecord(poll.id, interaction.user.id);
  const updatedPayload = await buildPollMessagePayload(closedPoll);
  await interaction.update(updatedPayload);
}
