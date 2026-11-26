import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { publishRules } from '../../services/rulesService.js';
import { createBrandEmbed, withBrandAssets } from '../../utils/embed.js';

export const access = 'admin';

export const data = new SlashCommandBuilder()
  .setName('setup-rules')
  .setDescription('Publier le règlement officiel (EN) avec attribution automatique de rôle')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName('salon')
      .setDescription('Salon où publier le règlement en anglais')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true),
  )
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription('Rôle attribué automatiquement après acceptation du règlement')
      .setRequired(true),
  );

export async function execute(interaction) {
  const guild = interaction.guild;
  const channel = interaction.options.getChannel('salon', true);
  const role = interaction.options.getRole('role', true);

  if (role.id === guild.roles.everyone.id) {
    await interaction.reply({
      content: '❌ Tu ne peux pas choisir `@everyone` comme rôle à attribuer.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (role.managed) {
    await interaction.reply({
      content:
        '❌ Ce rôle est géré par une intégration/bot et ne peut pas être attribué manuellement.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botMember =
    guild.members.me || (await guild.members.fetchMe().catch(() => null));

  if (botMember && botMember.roles.highest.comparePositionTo(role) <= 0) {
    await interaction.reply({
      content: `❌ Mon rôle est trop bas dans la hiérarchie pour attribuer <@&${role.id}>. Place le rôle du bot au-dessus dans **Paramètres du serveur → Rôles**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { saved } = await publishRules({
    guild,
    channelId: channel.id,
    roleId: role.id,
  });

  const confirmEmbed = createBrandEmbed()
    .setTitle('✅ Règlement (EN) publié')
    .setDescription(
      `Le règlement officiel en anglais a été publié dans <#${saved.channelId}>.\n` +
        `Les membres qui cliqueront sur **I accept the rules** recevront automatiquement <@&${saved.roleId}>.`,
    );

  const payload = await withBrandAssets({ embeds: [confirmEmbed] });
  await interaction.editReply(payload);
}
