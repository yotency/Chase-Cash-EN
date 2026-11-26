import {
  buildBroadcastCommand,
  buildBroadcastModal,
} from '../../services/broadcastService.js';

export const access = 'admin';

export const data = buildBroadcastCommand(
  'maj',
  'Publier une mise à jour / patch notes (EN) avec bannière, titre et description',
);

export async function execute(interaction) {
  const targetChannelId =
    interaction.options.getChannel('salon')?.id || interaction.channelId;
  const roleId = interaction.options.getRole('role')?.id || null;

  const modal = buildBroadcastModal('maj', { targetChannelId, roleId });
  await interaction.showModal(modal);
}
