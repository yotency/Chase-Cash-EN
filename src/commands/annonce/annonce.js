import {
  buildBroadcastCommand,
  buildBroadcastModal,
} from '../../services/broadcastService.js';

export const access = 'admin';

export const data = buildBroadcastCommand(
  'annonce',
  'Publier une annonce officielle (EN) avec bannière, titre et description',
);

export async function execute(interaction) {
  const targetChannelId =
    interaction.options.getChannel('salon')?.id || interaction.channelId;
  const roleId = interaction.options.getRole('role')?.id || null;

  const modal = buildBroadcastModal('annonce', { targetChannelId, roleId });
  await interaction.showModal(modal);
}
