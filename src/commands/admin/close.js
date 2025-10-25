const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdminUser } = require('../../utils');

const slashData = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Close submissions for a specific prediction')
  //.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption(o =>
    o.setName('prediction_number')
      .setDescription('Prediction # to close')
      .setRequired(true)
      .setAutocomplete(true)
  );

const autocomplete = async (interaction, state, model) => {
  const focused = interaction.options.getFocused()?.toString() ?? '';
  const open = await model.getOpenPredictions(25);
  const filtered = open
    .filter(p => `${p.prediction_number}`.startsWith(focused) || (p.question ?? '').toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map(p => ({
      name: `${p.prediction_number} — ${p.question}`.slice(0, 100),
      value: p.prediction_number
    }));
  await interaction.respond(filtered);
};

const slashExecute = async (interaction, model, state, config) => {
  if (!isAdminUser(interaction, config)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const predictionNumber = interaction.options.getInteger('prediction_number', true);

  const isOpen = await model.isPredictionOpen(predictionNumber);
  if (!isOpen) {
    await interaction.reply({ content: `Prediction #${predictionNumber} is not open.`, ephemeral: true });
    return;
  }

  // mark closed in DB
  await model.setPredictionOpen(predictionNumber, false);

  // if the one being closed is the in-memory live one, close it in state too
  if (state.predictionNumber === predictionNumber) {
    state.closePredictions();
  }

  await interaction.reply(`Prediction #${predictionNumber} submissions closed! Please wait for the result.`);
};

// legacy message command shim
const closePredictions = (msg) => {
  msg.reply('Please use the `/close` slash command with a prediction number.');
};

module.exports = {
  name: '!close',
  description: 'Close the predictions and wait for result',
  adminRequired: true,
  execute: closePredictions,

  slashData,
  slashExecute,
  autocomplete: (i, state, model) => autocomplete(i, state, model),
};