const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const slashData = new SlashCommandBuilder()
  .setName('openpredictions')
  .setDescription('List all open predictions and their numbers')
  .addBooleanOption(o =>
    o.setName('show_options')
      .setDescription('Include the allowed options for each prediction')
      .setRequired(false)
  );

const buildEmbed = (items) => {
  const embed = new EmbedBuilder()
    .setTitle('Open Predictions')
    .setColor(0x57F287) // green
    .setTimestamp();

  for (const it of items) {
    // field name is the number, value is the question (+ options if provided)
    embed.addFields({ name: `#${it.prediction_number}`, value: it.value });
  }
  return embed;
};

const slashExecute = async (interaction, model, _state) => {
  const showOptions = interaction.options.getBoolean('show_options') ?? false;

  const open = await model.getOpenPredictions(25); // up to 25 fields fits neatly in one embed
  if (!open.length) {
    await interaction.reply({ content: 'There are no open predictions right now.', ephemeral: true });
    return;
  }

  const items = [];
  for (const p of open) {
    let value = p.question || '(no question text)';
    if (showOptions) {
      const answers = await model.getAllowedAnswers(p.prediction_number);
      if (answers.length) {
        value += `\n*Options:* ${answers.join(', ')}`;
      }
    }
    items.push({ prediction_number: p.prediction_number, value });
  }

  const embed = buildEmbed(items);
  await interaction.reply({ embeds: [embed] });
};

// legacy message-command shim
const fallback = async (msg, _args, model, _state) => {
  const open = await model.getOpenPredictions(10);
  if (!open.length) {
    await msg.channel.send('There are no open predictions right now.');
    return;
  }
  const items = open.map(p => ({ prediction_number: p.prediction_number, value: p.question || '(no question text)' }));
  const embed = buildEmbed(items);
  await msg.channel.send({ embeds: [embed] });
};

module.exports = {
  name: '!openpredictions',
  description: 'List all open predictions and their numbers',
  adminRequired: false,
  execute: fallback,

  slashData,
  slashExecute
};