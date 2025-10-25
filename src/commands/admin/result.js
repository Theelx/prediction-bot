const { SlashCommandBuilder //, PermissionFlagsBits
} = require('discord.js');
const { isAdminUser } = require('../../utils');

const slashData = new SlashCommandBuilder()
  .setName('result')
  .setDescription('Settle a prediction: winners are capped at bet×#options, leftover returns to losers proportionally')
  // .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // gated via isAdminUser/owner check
  .addIntegerOption(o =>
    o.setName('prediction_number')
      .setDescription('Prediction # to settle')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(o =>
    o.setName('outcome')
      .setDescription('Winning outcome')
      .setRequired(true)
      .setAutocomplete(true)
  );

// can this user operate on this prediction?
async function canOperate(interaction, model, config, predictionNumber) {
  if (isAdminUser(interaction, config)) {
    return true;
  }
  // read predictions.id (creator) - if null, only admins may operate
  const ownerId = await model.getPredictionOwnerId(predictionNumber); // may be string, number, or null
  if (ownerId == null) {
    return false;
  }
  return String(ownerId) === String(interaction.user.id);
}

// autocomplete: show all open to admins, only their own open to creators, none to others
const autocomplete = async (interaction, state, model, config) => {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'prediction_number') {
    const typed = String(focused.value ?? '');
    const open = await model.getOpenPredictions(25);

    let rows = open;
    if (!isAdminUser(interaction, config)) {
      // filter to only those the user owns (predictions.id == caller)
      const withOwners = await Promise.all(
        open.map(async p => ({
          ...p,
          ownerId: await model.getPredictionOwnerId(p.prediction_number)
        }))
      );
      rows = withOwners.filter(p => p.ownerId != null && String(p.ownerId) === String(interaction.user.id));
    }

    const choices = rows
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
    if (!predNum) {
      await interaction.respond([]);
      return;
    }

    // only show outcomes if the user can operate on this prediction
    const allowed = await canOperate(interaction, model, config, predNum);
    if (!allowed) {
      await interaction.respond([]);
      return;
    }

    const answers = await state.getAllowedAnswers(predNum);
    const typed = String(focused.value ?? '').toLowerCase();
    const suggestions = answers
      .filter(a => a.toLowerCase().startsWith(typed))
      .slice(0, 25)
      .map(a => ({ name: a, value: a }));
    await interaction.respond(suggestions);
  }
};

function orderKey(row) {
  // prefer bet_id, then created_at, then id
  // created_at doesn't exist yet, it will be added when i get around to it
  if (row.bet_id != null) {
    return Number(row.bet_id);
  }
  if (row.created_at) {
    return new Date(row.created_at).getTime();
  }
  return Number.isFinite(Number(row.id)) ? Number(row.id) : String(row.id);
}

const slashExecute = async (interaction, model, state, config) => {
  const predictionNumber = interaction.options.getInteger('prediction_number', true);
  const outcome = interaction.options.getString('outcome', true).toLowerCase();

  // permission check: admin or creator of this prediction (predictions.id)
  const allowed = await canOperate(interaction, model, config, predictionNumber);
  if (!allowed) {
    await interaction.reply({ content: 'You do not have permission to settle this prediction.', ephemeral: true });
    return;
  }

  // validate outcome
  const answers = await state.getAllowedAnswers(predictionNumber);
  const numOptions = answers.length;
  if (!answers.map(a => a.toLowerCase()).includes(outcome)) {
    await interaction.reply({ content: `Invalid outcome. Choose one of: ${answers.join(', ')}.`, ephemeral: true });
    return;
  }

  // must be open, then close to prevent double-settlement
  const isOpen = await model.isPredictionOpen(predictionNumber);
  if (!isOpen) {
    await interaction.reply({ content: `Prediction #${predictionNumber} is not open.`, ephemeral: true });
    return;
  }
  await model.setPredictionOpen(predictionNumber, false);

  // pull all bets
  const allBets = await model.getBetsForPrediction(predictionNumber);
  if (!allBets.length) {
    await interaction.reply(`No bets were placed for prediction **#${predictionNumber}**. Nothing to settle.`);
    state.clearPrediction(predictionNumber);
    return;
  }

  const winners = allBets.filter(b => String(b.predicted_outcome).toLowerCase() === outcome);
  const losers = allBets.filter(b => String(b.predicted_outcome).toLowerCase() !== outcome);

  // if no winners: refund everyone
  if (winners.length === 0) {
    for (const b of allBets) {
      const current = await model.getPoints(b.id);
      await model.setPoints(b.id, current + Number(b.bet_amount || 0));
    }
    await interaction.reply(`The result for prediction **#${predictionNumber}** is: **${outcome}**.\nNo winners — **all bets have been refunded.**`);
    state.clearPrediction(predictionNumber);
    return;
  }

  // pools and caps
  const losersTotal = losers.reduce((s, b) => s + Number(b.bet_amount || 0), 0);
  const winnerCaps = winners.map(w => {
    const stake = Number(w.bet_amount || 0);
    const capTotal = stake * numOptions; // max total payout
    const capBonus = capTotal - stake; // max bonus from pool
    return { ...w, stake, capBonus: Math.max(0, capBonus) };
  });
  const totalWinnersBonusCap = winnerCaps.reduce((s, w) => s + w.capBonus, 0);
  const winnersBonusPool = Math.min(losersTotal, totalWinnersBonusCap);

  // allocate winnersBonusPool proportionally to capBonus (integer safe)
  let winnersAlloc = winnerCaps.map(w => ({
    id: w.id,
    stake: w.stake,
    bonus: 0,
    key: orderKey(w)
  }));

  if (winnersBonusPool > 0 && totalWinnersBonusCap > 0) {
    let sumBase = 0;
    for (const wa of winnersAlloc) {
      const w = winnerCaps.find(x => x.id === wa.id);
      const share = Math.floor((w.capBonus * winnersBonusPool) / totalWinnersBonusCap);
      wa.bonus = share;
      sumBase += share;
    }
    let remainder = winnersBonusPool - sumBase;
    winnersAlloc.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (let i = 0; i < winnersAlloc.length && remainder > 0; i++, remainder--) {
      winnersAlloc[i].bonus += 1;
    }
    // safety cap
    for (const wa of winnersAlloc) {
      const cap = winnerCaps.find(x => x.id === wa.id).capBonus;
      if (wa.bonus > cap) {
        wa.bonus = cap;
      }
    }
  }

  // pay winners
  await interaction.reply(
    `The result for prediction **#${predictionNumber}** is: **${outcome}**.\n` +
    `Losers’ pool: **${losersTotal}** points. Distributing to winners with cap **stake × ${numOptions}**, remainder back to losers proportionally.`
  );

  for (const wa of winnersAlloc) {
    const user = await model.getUser(wa.id);
    const payout = wa.stake + wa.bonus;
    const newBalance = user.points + payout;
    await model.setPoints(wa.id, newBalance);
    await interaction.followUp(`${user.username} receives **${payout}** (stake ${wa.stake} + bonus ${wa.bonus}). New balance: **${newBalance}**.`);
  }

  // remaining pool -> losers proportionally (integer safe, earliest bet gets leftovers)
  const winnersTaken = winnersAlloc.reduce((s, wa) => s + wa.bonus, 0);
  let remainingPool = losersTotal - winnersTaken;

  if (remainingPool > 0 && losers.length > 0) {
    const losersWithOrder = losers.map(l => ({
      ...l,
      stake: Number(l.bet_amount || 0),
      key: orderKey(l),
      refund: 0
    }));
    const losersTotalStake = losersWithOrder.reduce((s, l) => s + l.stake, 0);

    let sumBase = 0;
    for (const l of losersWithOrder) {
      const share = Math.floor((l.stake * remainingPool) / (losersTotalStake || 1));
      l.refund = share;
      sumBase += share;
    }
    let rem = remainingPool - sumBase;
    losersWithOrder.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (let i = 0; i < losersWithOrder.length && rem > 0; i++, rem--) {
      losersWithOrder[i].refund += 1;
    }

    for (const l of losersWithOrder) {
      if (l.refund <= 0) {
        continue;
      }
      const user = await model.getUser(l.id);
      const newBalance = user.points + l.refund;
      await model.setPoints(l.id, newBalance);
      await interaction.followUp(`${user.username} recovers **${l.refund}** from the remaining pool.`);
    }
  }

  state.clearPrediction(predictionNumber);
};

// legacy shim
const result = (msg) => {
  msg.reply('Please use the `/result` slash command.');
};

module.exports = {
  name: '!result',
  description: 'Submit the result of the prediction',
  adminRequired: true,
  execute: result,

  slashData,
  slashExecute,
  autocomplete: (i, state, model, config) => autocomplete(i, state, model, config),
};