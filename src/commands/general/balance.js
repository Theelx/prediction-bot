const { SlashCommandBuilder } = require('discord.js');

const slashData = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your points or another user’s points')
  .addUserOption(o =>
    o.setName('user')
      .setDescription('User to check (defaults to you)')
      .setRequired(false)
  );

const slashExecute = async (interaction, model, _state) => {
  const target = interaction.options.getUser('user') || interaction.user;

  try {
    const points = await model.getPoints(target.id);

    if (target.id === interaction.user.id) {
      await interaction.reply(`You currently have ${points} points.`);
    } else {
      await interaction.reply(`${target.username} currently has ${points} points.`);
    }
  } catch {
    const msg = (target.id === interaction.user.id)
      ? 'It appears you have not registered, so you do not have a balance.'
      : `${target.username} is not registered, so they do not have a balance.`;
    await interaction.reply({ content: msg, ephemeral: true });
  }
};

// legacy message-command shim
const getBalance = async (msg, _args, model, _state) => {
  try {
    const points = await model.getPoints(msg.author.id);
    msg.reply(`You currently have ${points} points.`);
  } catch {
    msg.reply('It appears you have not registered, so you do not have a balance.');
  }
};

module.exports = {
  // legacy metadata
  name: '!balance',
  description: 'Check the amount of points a user has',
  adminRequired: false,
  execute: getBalance,

  // slash exports
  slashData,
  slashExecute
};