const { PermissionFlagsBits } = require('discord.js');

const messageHandler = async (bot, msg, model, state, modList) => {
  if (msg.author.bot) return;
  
  const args = msg.content.split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (!bot.commands.has(commandName)) return;

  const command = bot.commands.get(commandName);
  if (command.adminRequired && !modList.includes(msg.author.id)) {
    msg.reply('You are not authorized to execute this command.');
    return;
  }

  try {
    await command.execute(msg, args, model, state);
  } catch (error) {
    console.error(error);
    msg.reply('There was an error trying to execute that command.');
  }
};

function isAdminUser(interaction, config = {}) {
  const hasManage =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    false;

  const modList = Array.isArray(config.MOD_LIST) ? config.MOD_LIST : [];
  const isWhitelisted = modList.includes(interaction.user?.id);

  return hasManage || isWhitelisted;
}


module.exports = {
  messageHandler,
  isAdminUser,
};
