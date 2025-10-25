const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const formatRows = (rows) => {
  const medals = ['🥇', '🥈', '🥉'];
  return rows.map((u, i) => {
    const place = i + 1;
    const tag = medals[i] || `#${place}`;
    // align points to the right-ish using spaces
    const pts = `${u.points}`.padStart(6, ' ');
    return `${tag}  **${u.username}** — ${pts} pts`;
  }).join('\n');
};

const buildEmbed = (users, limit, invokedBy) => {
  const top = users.slice(0, limit);
  const desc = top.length ? formatRows(top) : '_No registered users yet._';

  return new EmbedBuilder()
    .setTitle('🏆 Leaderboard')
    .setDescription(desc)
    .setColor(0x5865F2) // discord blurple
    .setFooter({ text: 'Use /balance to check your own points' })
    .setTimestamp();
};

const slashData = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('See the top-scoring users')
  .addIntegerOption(o =>
    o.setName('limit')
      .setDescription('How many users to show (default 10, max 25)')
      .setRequired(false)
      .setMinValue(3)
      .setMaxValue(25)
  );

const slashExecute = async (interaction, model, _state) => {
  try {
    const limit = interaction.options.getInteger('limit') ?? 10;
    const leaderboard = await model.getLeaderboard();
    const embed = buildEmbed(leaderboard, limit, interaction.user);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: 'Could not fetch the leaderboard right now.', ephemeral: true });
  }
};

// legacy message-command shim
const getLeaderboard = async (msg, _args, model, _state) => {
  try {
    const leaderboard = await model.getLeaderboard();
    const embed = buildEmbed(leaderboard, 10, msg.author);
    await msg.channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(err);
    await msg.channel.send('Could not fetch the leaderboard right now.');
  }
};

module.exports = {
  // legacy metadata
  name: '!leaderboard',
  description: 'See the top-scoring users',
  adminRequired: false,
  execute: getLeaderboard,

  // slash exports
  slashData,
  slashExecute
};