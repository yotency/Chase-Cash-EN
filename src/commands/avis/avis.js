import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { publishAvisPanel } from '../../services/avisService.js';
import { createBrandEmbed, withBrandAssets } from '../../utils/embed.js';

export const access = 'admin';

export const data = new SlashCommandBuilder()
  .setName('avis')
  .setDescription('Configurer le système d’avis joueurs (EN) et publier le panneau avec bouton')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('salon_panneau')
      .setDescription('Salon où afficher l’embed EN avec le bouton "Leave a Review"')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addChannelOption((option) =>
    option
      .setName('salon_publication')
      .setDescription('Salon où seront publiés les avis validés des joueurs')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  );

export async function execute(interaction) {
  const panelChannel = interaction.options.getChannel('salon_panneau', true);
  const publishChannel = interaction.options.getChannel('salon_publication', true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { saved } = await publishAvisPanel({
    guild: interaction.guild,
    panelChannel,
    publishChannel,
  });

  const confirmEmbed = createBrandEmbed()
    .setTitle('⭐ Système d’avis (EN) configuré')
    .setDescription(
      `Le panneau d’avis en anglais avec le bouton **Leave a Review** a été publié dans <#${saved.panelChannelId}>.`,
    )
    .addFields(
      {
        name: 'Salon du panneau',
        value: `<#${saved.panelChannelId}>`,
        inline: true,
      },
      {
        name: 'Salon des avis publiés',
        value: `<#${saved.publishChannelId}>`,
        inline: true,
      },
    );

  const payload = await withBrandAssets({ embeds: [confirmEmbed] });
  await interaction.editReply(payload);
}
