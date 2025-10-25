const { SlashCommandBuilder } = require('discord.js');
const config = require('../../../config.json');

const slashData = new SlashCommandBuilder()
  .setName('predict')
  .setDescription('Bet points on an outcome')
  .addIntegerOption(o =>
    o.setName('prediction_number')
      .setDescription('Which prediction you want to bet on')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(o =>
    o.setName('outcome')
      .setDescription('The outcome you want to bet on')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(o =>
    o.setName('amount')
      .setDescription('How many points to bet')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(config.MAX_BET || 10000)
  );

const autocomplete = async (interaction, state, model) => {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'prediction_number') {
    const typed = String(focused.value ?? '');
    const open = await model.getOpenPredictions(25);
    const choices = open
      .filter(p =>
        `${p.prediction_number}`.startsWith(typed) ||
        (p.question || '').toLowerCase().includes(typed.toLowerCase())
      )
      .slice(0, 25)
      .map(p => ({
        name: `${p.prediction_number} — ${p.question}`.slice(0, 100),
        value: p.prediction_number
      }));
    await interaction.respond(choices);
    return;
  }

  if (focused.name === 'outcome') {
    const predNum = interaction.options.getInteger('prediction_number');
    const answers = predNum ? await state.getAllowedAnswers(predNum) : [];
    const typed = String(focused.value ?? '').toLowerCase();
    const suggestions = answers
      .filter(a => a.toLowerCase().startsWith(typed))
      .slice(0, 25)
      .map(a => ({ name: a, value: a }));
    await interaction.respond(suggestions);
  }
};

const slashExecute = async (interaction, model, state, config) => {
  const predictionNumber = interaction.options.getInteger('prediction_number', true);
  const outcome = interaction.options.getString('outcome', true).toLowerCase();
  const bet = interaction.options.getInteger('amount', true);

  // ensure the market is open
  const isOpen = await model.isPredictionOpen(predictionNumber);
  if (!isOpen) {
    await interaction.reply({ content: `Prediction #${predictionNumber} is not open.`, ephemeral: true });
    return;
  }

  // basic amount guards
  if (bet > (config.MAX_BET || Number.MAX_SAFE_INTEGER)) {
    await interaction.reply({ content: `The maximum bet size is ${config.MAX_BET}.`, ephemeral: true });
    return;
  } else if (bet < (config.MIN_BET || Number.MIN_SAFE_INTEGER)) {
    await interaction.reply({ content: `The minimum bet size is ${config.MIN_BET}.`, ephemeral: true });
    return;
  } else if (bet <= 0) {
    await interaction.reply({ content: 'Please enter a positive number.', ephemeral: true });
    return;
  }

  // check existing bet for this user & prediction
  const userId = interaction.user.id;
  const existing = await model.getUserBetForPrediction(userId, predictionNumber); // { predicted_outcome, bet_amount } | null

  // if they already bet on a different outcome, block it
  if (existing && String(existing.predicted_outcome).toLowerCase() !== outcome) {
    await interaction.reply({
      content: `You already bet on **${existing.predicted_outcome}** for prediction #${predictionNumber}. You cannot bet on another outcome.`,
      ephemeral: true
    });
    return;
  }

  // get balance
  let balance;
  try {
    balance = await model.getPoints(userId);
  } catch {
    await interaction.reply({ content: 'You are not registered, so you cannot make a prediction.', ephemeral: true });
    return;
  }

  // you can only add to your existing bet and never decrease (amount is always an additional top-up)
  if (bet > balance) {
    await interaction.reply({ content: `You do not have enough points. You have ${balance} points.`, ephemeral: true });
    return;
  } else if (bet > (balance / 2)) {
    // optional customizability
    await interaction.reply({
      content: `Imagine being ${config?.NAME_MAPPING?.[userId] ?? interaction.user.username} but pulling a ${config?.BLAME_NAME ?? interaction.user.username} and betting more than half your points lmao no`,
      ephemeral: true
    });
    return;
  }

  // apply the additional bet (state/model handle aggregation + cross-outcome prevention)
  try {
    await state.addPrediction(predictionNumber, userId, outcome, bet);
  } catch (error) {
    await interaction.reply({ content: error.message, ephemeral: true });
    return;
  }

  // deduct points now
  const newBalance = balance - bet;
  await model.setPoints(userId, newBalance);

  // tailored confirmation
  if (existing) {
    const prev = Number(existing.bet_amount || 0);
    const totalNow = prev + bet;
    await interaction.reply(
      `You are betting an **additional ${bet}** points on **${outcome}** for prediction **#${predictionNumber}** (total on this outcome now **${totalNow}**). New balance: **${newBalance}**.`
    );
  } else {
    await interaction.reply(
      `You spent **${bet}** points on **${outcome}** for prediction **#${predictionNumber}**. New balance: **${newBalance}**.`
    );
  }
};

// legacy shim
const makePrediction = (msg) => {
  msg.reply('Please use the `/predict` slash command.');
};

module.exports = {
  name: '!predict',
  description: 'Use points to make a prediction',
  adminRequired: false,
  execute: makePrediction,

  slashData,
  slashExecute,
  autocomplete: (i, state, model) => autocomplete(i, state, model),
};