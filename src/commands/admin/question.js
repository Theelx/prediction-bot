const { SlashCommandBuilder //, PermissionFlagsBits
} = require('discord.js');
const { isAdminUser } = require('../../utils');

const MAX_ANSWERS = 10;

const slashData = new SlashCommandBuilder()
  .setName('question')
  .setDescription('Open a new prediction question')
  // .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // gated via isAdminUser()
  .addStringOption(o =>
    o.setName('question')
      .setDescription('The question to ask')
      .setRequired(true)
  );

// add answer1 through answer10 (optional)
for (let i = 1; i <= MAX_ANSWERS; i++) {
  slashData.addStringOption(o =>
    o.setName(`answer${i}`)
      .setDescription(`Allowed answer ${i}`)
      .setRequired(false)
  );
}

const slashExecute = async (interaction, model, state, config) => {
  // gate: Manage Server OR in MOD_LIST
  // if (!isAdminUser(interaction, config)) {
  //   await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  //   return;
  // }

  const question = interaction.options.getString('question', true);

  const provided = [];
  for (let i = 1; i <= MAX_ANSWERS; i++) {
    const val = interaction.options.getString(`answer${i}`);
    if (val && val.trim()) {
      provided.push(val.trim());
    }
  }

  const allowedAnswers = provided.length ? provided : ['yes', 'no'];
  const allowedAnswersStr = allowedAnswers.join(';-');

  // create DB row (is_open = TRUE) and get its AUTO_INCREMENT prediction_number
  const predictionNumber = await model.createPrediction(interaction.user.id, question, allowedAnswersStr);

  // register this market in memory, multiple markets can be open concurrently
  state.openPredictions(predictionNumber, allowedAnswers);

  await interaction.reply(
    `**Predictions opened!** (#${predictionNumber}) ${question}\n**Options:** ${allowedAnswers.join(', ')}`
  );
};

// legacy message command shim
const openPredictions = (msg) => {
  msg.reply('Please use the `/question` slash command to start a prediction.');
};

module.exports = {
  name: '!question',
  description: 'Ask a question to predict on',
  adminRequired: false,
  execute: openPredictions,

  slashData,
  slashExecute
};