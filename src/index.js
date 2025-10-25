const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const config = require('../config.json');
const Model = require('./models/mysql').model;
const State = require('./state').state;

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // GatewayIntentBits.MessageContent
  ]
});

bot.commands = new Collection();
bot.slash = new Collection();
const model = new Model();

// pass model into State so it can persist bets
const state = new State(model);

const botCommands = require('./commands');
const { messageHandler } = require('./utils');

Object.keys(botCommands).forEach((key) => {
  const mod = botCommands[key];
  if (mod?.name) bot.commands.set(mod.name, mod); // prefix commands
  if (mod?.slashData) {
    bot.slash.set(mod.slashData.name, mod);
  }
});

// register slash commands on ready
bot.once('clientReady', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
    const body = Array.from(bot.slash.values()).map((c) => c.slashData.toJSON());

    if (config.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
        { body }
      );
      console.log('Slash commands registered (guild).');
    } else {
      await rest.put(
        Routes.applicationCommands(config.CLIENT_ID),
        { body }
      );
      console.log('Slash commands registered (global).');
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// slash command handler (and autocomplete)
bot.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = bot.slash.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction, state, model, config);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const cmd = bot.slash.get(interaction.commandName);
    if (!cmd?.slashExecute) return;

    await cmd.slashExecute(interaction, model, state, config);
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      const content = 'Something went wrong executing that command.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => {});
      }
    }
  }
});

// fallback for legacy message-based commands
bot.on('messageCreate', async (msg) => {
  messageHandler(bot, msg, model, state, config.MOD_LIST);
});

bot.login(config.BOT_TOKEN);
