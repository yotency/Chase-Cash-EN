import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getTicketSettings, upsertTicketSettings } from '../../db/database.js';
import { buildTicketPanelPayload } from '../../services/ticketService.js';
import { createBrandEmbed, withBrandAssets } from '../../utils/embed.js';

export const access = 'admin';

export const data = new SlashCommandBuilder()
  .setName('setup-ticket')
  .setDescription('Configurer le système de tickets (EN) et publier le panneau d’ouverture')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('categorie')
      .setDescription('Catégorie Discord où les tickets seront créés pour le staff')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(true),
  )
  .addChannelOption((option) =>
    option
      .setName('salon_logs')
      .setDescription('Salon où envoyer les retranscriptions des tickets fermés')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addChannelOption((option) =>
    option
      .setName('salon')
      .setDescription('Salon où publier le panneau de tickets (par défaut : ce salon)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(false),
  )
  .addRoleOption((option) =>
    option
      .setName('role_staff')
      .setDescription('Optionnel : rôle staff à ping et autoriser dans les tickets')
      .setRequired(false),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const existing = getTicketSettings(guild.id);

  const categoryChannel = interaction.options.getChannel('categorie', true);
  const logChannel = interaction.options.getChannel('salon_logs', true);
  const panelChannel =
    interaction.options.getChannel('salon') || interaction.channel;
  const staffRoleOption = interaction.options.getRole('role_staff');

  if (!panelChannel || !panelChannel.isTextBased()) {
    await interaction.editReply({
      content: '❌ Le salon cible pour le panneau de tickets doit être un salon textuel.',
    });
    return;
  }

  const staffRoleId = staffRoleOption?.id ?? existing?.staffRoleId ?? null;

  const saved = upsertTicketSettings({
    guildId: guild.id,
    panelChannelId: panelChannel.id,
    categoryId: categoryChannel.id,
    logChannelId: logChannel.id,
    staffRoleId,
  });

  const panelPayload = await buildTicketPanelPayload();
  await panelChannel.send(panelPayload);

  const confirmEmbed = createBrandEmbed()
    .setTitle('✅ Système de tickets (EN) configuré')
    .setDescription(`Le panneau de tickets en anglais a été publié dans <#${panelChannel.id}>.`)
    .addFields(
      { name: 'Catégorie des tickets', value: `<#${saved.categoryId}>`, inline: true },
      { name: 'Salon des logs', value: `<#${saved.logChannelId}>`, inline: true },
      {
        name: 'Rôle staff',
        value: saved.staffRoleId
          ? `<@&${saved.staffRoleId}>`
          : 'Non défini *(configurable plus tard avec `/setup-ticket`)*',
        inline: true,
      },
    );

  const replyPayload = await withBrandAssets({ embeds: [confirmEmbed] });
  await interaction.editReply(replyPayload);
}
