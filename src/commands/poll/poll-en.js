import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildPollModal } from '../../services/pollService.js';

export const access = 'admin';

export const data = new SlashCommandBuilder()
  .setName('poll-en')
  .setDescription('Créer un sondage interactif en anglais (choix simple ou multiple)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('salon')
      .setDescription('Salon où publier le sondage (par défaut : ce salon)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false),
  )
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription('Rôle à ping lors de la publication du sondage (facultatif)')
      .setRequired(false),
  );

export async function execute(interaction) {
  const targetChannelId =
    interaction.options.getChannel('salon')?.id || interaction.channelId;
  const roleId = interaction.options.getRole('role')?.id || null;

  const modal = buildPollModal({ targetChannelId, roleId });
  await interaction.showModal(modal);
}
