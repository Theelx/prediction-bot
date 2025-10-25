const { SlashCommandBuilder //, PermissionFlagsBits
} = require('discord.js');
const { isAdminUser } = require('../../utils');

const slashData = new SlashCommandBuilder()
  .setName('setpoints')
  .setDescription('Set a user’s points to a specific value')
  // .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // gated via isAdminUser()
  .addUserOption(o =>
    o.setName('user')
      .setDescription('User to update')
      .setRequired(true)
  )
  .addIntegerOption(o =>
    o.setName('points')
      .setDescription('New point balance (0 or more)')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(1_000_000_000)
  );

const slashExecute = async (interaction, model, _state, config) => {
  if (!isAdminUser(interaction, config)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const points = interaction.options.getInteger('points', true);

  let prev = null;
  let registered = false;

  try {
    registered = await model.isRegistered(target.id);
    if (registered) {
      try { prev = await model.getPoints(target.id); } catch (_) {}
      await model.setPoints(target.id, points);
    } else {
      await model.setUser(target.id, target.username, points);
    }

    const prevText = prev === null || prev === undefined ? 'n/a' : String(prev);
    await interaction.reply(
      `Set **${target.username}**'s points to **${points}**. (previous: ${prevText}, ${registered ? 'updated' : 'registered new user'})`
    );
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: 'Failed to set points for that user.', ephemeral: true });
  }
};

// legacy message-command shim
const setpointsLegacy = async (msg) => {
  msg.reply('Please use the `/setpoints` slash command.');
};

module.exports = {
  name: '!setpoints',
  description: 'Set a user’s points to a specific value',
  adminRequired: true,
  execute: setpointsLegacy,

  slashData,
  slashExecute
};