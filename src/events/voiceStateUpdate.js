import { Events } from 'discord.js';
import { getVocalSettings } from '../db/database.js';
import {
  createEphemeralVoiceChannel,
  deleteTempVoiceIfEmpty,
} from '../services/vocalService.js';

export const name = Events.VoiceStateUpdate;
export const once = false;

export async function execute(oldState, newState) {
  if (oldState.channelId === newState.channelId) return;

  if (oldState.channelId && oldState.channel) {
    await deleteTempVoiceIfEmpty(oldState.channel).catch((error) => {
      console.error('[VOCAL] Erreur lors de la suppression du salon vide:', error);
    });
  }

  if (!newState.channelId || !newState.channel) return;

  const settings = getVocalSettings(newState.guild.id);
  if (!settings || newState.channelId !== settings.triggerChannelId) return;

  await createEphemeralVoiceChannel({
    voiceState: newState,
    triggerChannel: newState.channel,
    settings,
  }).catch((error) => {
    console.error('[VOCAL] Erreur lors de la création du salon éphémère:', error);
  });
}
