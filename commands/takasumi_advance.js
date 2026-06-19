import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("takasumi_advance")
  .setDescription("takasumi bot拡張機能の有効/無効を設定")
  .addBooleanOption(option =>
    option
      .setName("enabled")
      .setDescription("有効にするか")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, { client }) {
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: "サーバー内でのみ使用できます",
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean("enabled");

  // DB保存
  await client.db.collection("takasumi_advance").updateOne(
    { guildId: interaction.guildId },
    {
      $set: {
        guildId: interaction.guildId,
        enabled,
      },
    },
    { upsert: true }
  );

  // ギルドコマンド更新
  const rest = new REST({ version: "10" }).setToken(
    process.env.DISCORD_BOT_TOKEN
  );

  if (enabled) {
    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        interaction.guildId
      ),
      {
        body: client.takasumiCommandsJSON,
      }
    );
  } else {
    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        interaction.guildId
      ),
      {
        body: [],
      }
    );
  }

  await interaction.reply({
    content: enabled
      ? "takasumi bot拡張機能を有効化しました"
      : "takasumi bot拡張機能を無効化しました",
  });
}