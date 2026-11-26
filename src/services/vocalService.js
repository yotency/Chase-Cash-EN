import { ChannelType, PermissionFlagsBits } from 'discord.js';
import {
  getAllTempVoiceChannels,
  getTempVoiceChannel,
  registerTempVoiceChannel,
  removeTempVoiceChannel,
} from '../db/database.js';

const creatingForUsers = new Set();

const OWNER_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.UseExternalSounds,
];

function buildTempVoiceName(member) {
  const pseudo =
    member.displayName || member.user.globalName || member.user.username || 'Voice';
  return pseudo.slice(0, 100);
}

export async function createEphemeralVoiceChannel({
  voiceState,
  triggerChannel,
  settings,
}) {
  const { guild, member } = voiceState;
  if (!member || member.user.bot) return;

  const lockKey = `${guild.id}:${member.id}`;
  if (creatingForUsers.has(lockKey)) return;
  creatingForUsers.add(lockKey);

  try {
    const botId = guild.client.user.id;
    const inheritedOverwrites = triggerChannel.permissionOverwrites.cache
      .filter((overwrite) => overwrite.id !== member.id && overwrite.id !== botId)
      .map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      }));

    const permissionOverwrites = [
      ...inheritedOverwrites,
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.MoveMembers,
        ],
      },
      {
        id: member.id,
        allow: OWNER_CHANNEL_PERMISSIONS,
      },
    ];

    const parentId = settings.categoryId || triggerChannel.parentId || null;
    const tempChannel = await guild.channels.create({
      name: buildTempVoiceName(member),
      type: ChannelType.GuildVoice,
      parent: parentId,
      bitrate: triggerChannel.bitrate,
      userLimit: triggerChannel.userLimit || 0,
      rtcRegion: triggerChannel.rtcRegion || null,
      permissionOverwrites,
      reason: `Temporary voice channel created for ${member.user.tag}`,
    });

    registerTempVoiceChannel({
      channelId: tempChannel.id,
      guildId: guild.id,
      ownerId: member.id,
    });

    try {
      await voiceState.setChannel(tempChannel);
    } catch {
      // Member may have disconnected before being moved
    }

    if (tempChannel.members.size === 0) {
      await tempChannel.delete('Empty temporary voice channel after creation').catch(() => {});
      removeTempVoiceChannel(tempChannel.id);
    }
  } finally {
    creatingForUsers.delete(lockKey);
  }
}

export async function deleteTempVoiceIfEmpty(channel) {
  if (!channel) return;

  const tracked = getTempVoiceChannel(channel.id);
  if (!tracked) return;

  if (channel.members.size > 0) return;

  removeTempVoiceChannel(channel.id);
  await channel.delete('Empty temporary voice channel').catch((error) => {
    if (error?.code !== 10003) {
      console.error(`[VOCAL] Impossible de supprimer ${channel.id}:`, error);
    }
  });
}

export async function cleanupOrphanTempVoices(client) {
  const trackedChannels = getAllTempVoiceChannels();
  for (const record of trackedChannels) {
    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) {
      removeTempVoiceChannel(record.channelId);
      continue;
    }

    const channel =
      guild.channels.cache.get(record.channelId) ||
      (await guild.channels.fetch(record.channelId).catch(() => null));

    if (!channel) {
      removeTempVoiceChannel(record.channelId);
      continue;
    }

    if (channel.members.size === 0) {
      removeTempVoiceChannel(record.channelId);
      await channel
        .delete('Startup cleanup: empty temporary voice channel')
        .catch(() => {});
    }
  }
}
