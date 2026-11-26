import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { upsertVocalSettings } from '../../db/database.js';
import { createBrandEmbed, withBrandAssets } from '../../utils/embed.js';

export const access = 'admin';

export const data = new SlashCommandBuilder()
  .setName('setup-vocal')
  .setDescription('Configurer le salon vocal par défaut (EN) pour créer des vocaux éphémères')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('salon')
      .setDescription('Salon vocal déclencheur (cliquer dessus crée un vocal éphémère)')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true),
  )
  .addChannelOption((option) =>
    option
      .setName('categorie')
      .setDescription('Catégorie où créer les vocaux éphémères (par défaut : celle du salon)')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(false),
  );

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const triggerChannel = interaction.options.getChannel('salon', true);
  const categoryOption = interaction.options.getChannel('categorie');
  const targetCategoryId = categoryOption?.id ?? triggerChannel.parentId ?? null;

  const saved = upsertVocalSettings({
    guildId: interaction.guild.id,
    triggerChannelId: triggerChannel.id,
    categoryId: targetCategoryId,
  });

  const embed = createBrandEmbed()
    .setTitle('🔊 Système de vocaux éphémères (EN) configuré')
    .setDescription(
      `Lorsqu’un membre rejoindra <#${saved.triggerChannelId}>, un salon vocal éphémère à son pseudo sera automatiquement créé et il y disposera de tous les droits.`,
    )
    .addFields(
      { name: 'Salon déclencheur', value: `<#${saved.triggerChannelId}>`, inline: true },
      {
        name: 'Catégorie de création',
        value: saved.categoryId ? `<#${saved.categoryId}>` : 'Racine du serveur',
        inline: true,
      },
    );

  const payload = await withBrandAssets({ embeds: [embed] });
  await interaction.editReply(payload);
}
