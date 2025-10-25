const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdminUser } = require('../../utils');

const slashData = new SlashCommandBuilder()
  .setName('refund')
  .setDescription('Cancel a prediction and refund all points')
  //.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption(o =>
    o.setName('prediction_number')
      .setDescription('Prediction # to refund')
      .setRequired(true)
      .setAutocomplete(true)
  );

const autocomplete = async (interaction, _state, model) => {
  const focused = interaction.options.getFocused()?.toString() ?? '';
  const open = await model.getOpenPredictions(25);
  const filtered = open
    .filter(p =>
      `${p.prediction_number}`.startsWith(focused) ||
      (p.question ?? '').toLowerCase().includes(focused.toLowerCase())
    )
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

  // must be open to be refundable, also prevents double-refund
  const isOpen = await model.isPredictionOpen(predictionNumber);
  if (!isOpen) {
    await interaction.reply({ content: `Prediction #${predictionNumber} is not open (already closed or refunded).`, ephemeral: true });
    return;
  }

  // close it first to stop further bets while we refund
  await model.setPredictionOpen(predictionNumber, false);

  // load all bets (DB is SoT via bet_amount)
  const bets = await model.getBetsForPrediction(predictionNumber);

  // do the refunds
  let count = 0;
  for (const b of bets) {
    const current = await model.getPoints(b.id);
    const newBalance = current + Number(b.bet_amount || 0);
    await model.setPoints(b.id, newBalance);
    count++;
  }

  // clear any in-memory cache for this market
  state.clearPrediction(predictionNumber);

  if (count === 0) {
    await interaction.reply(`Prediction #${predictionNumber} cancelled. No bets were placed, so no refunds were issued.`);
  } else {
    await interaction.reply(`Prediction #${predictionNumber} cancelled. Refunded **${count}** bet${count === 1 ? '' : 's'}.`);
  }
};

// legacy message-command shim
const refund = (msg) => {
  msg.reply('Please use the `/refund` slash command with a prediction number.');
};

module.exports = {
  name: '!refund',
  description: 'Refund the points in the current prediction',
  adminRequired: true,
  execute: refund,

  slashData,
  slashExecute,
  autocomplete: (i, state, model) => autocomplete(i, state, model),
};