const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config.json');

const slashData = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Register yourself for prediction points');

const slashExecute = async (interaction, model, _state) => {
  try {
    const userId = interaction.user.id;
    const already = await model.isRegistered(userId);

    if (already) {
      await interaction.reply({ content: 'It appears you have already registered!', ephemeral: true });
      return;
    }

    await model.setUser(userId, interaction.user.username, config.INITIAL_BALANCE);
    await interaction.reply(`Thanks for registering! You will start with ${config.INITIAL_BALANCE} points!`);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: 'Something went wrong while registering you.', ephemeral: true });
  }
};

// legacy message-command shim
const register = async (msg, _args, model, _state) => {
  const userExists = await model.isRegistered(msg.author.id);

  if (userExists) {
    msg.reply('It appears you have already registered!');
  } else {
    await model.setUser(msg.author.id, msg.author.username, config.INITIAL_BALANCE);
    msg.reply(`Thanks for registering! You will start with ${config.INITIAL_BALANCE} points!`);
  }
};

module.exports = {
  // legacy metadata
  name: '!register',
  description: 'Registers a user',
  adminRequired: false,
  execute: register,

  // slash exports
  slashData,
  slashExecute
};