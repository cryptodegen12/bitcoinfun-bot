const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000; // Uses Render's port automatically!

app.get('/', (req, res) => res.send('Bot is Alive!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// index.js - BitcoinFun Telegram Game Bot
require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express'); // 1. Added Express

// Initialize Express app for Render Health Check
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running perfectly!');
});

app.listen(PORT, () => {
  console.log(`Web server is listening on port ${PORT}`);
});

// Constants for game mechanics
const CONSTANTS = {
  ADMIN_ID: process.env.ADMIN_ID, // 2. Ensure this is set in Render Dashboard
  DAILY_REWARD: 100, 
  REFERRAL_BONUS: 50,
  MAX_BET: 500,
  ROUNDS: ['🟢 UP', '🔴 DOWN']
};

const db = {
  users: {},
  rounds: { current: 0, history: [] },
  referrals: {}
};

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

// --- [REMAINDER OF YOUR GAME LOGIC UNCHANGED] ---
// (Keep your bot.start, bot.action, bot.command code exactly as it was)

bot.start((ctx) => {
  const userId = ctx.from.id.toString();
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: 1000,
      referrals: 0,
      lastDaily: 0,
      username: ctx.from.username || ctx.from.first_name
    };
  }
  
  const refId = ctx.startPayload;
  if (refId && refId !== userId) {
    handleReferral(userId, refId);
  }

  ctx.reply(
    `🎰 Welcome to <b>BitcoinFun</b>! 💎\n\n` +
    `🚀 <b>Your Game Balance:</b> ${db.users[userId].balance} sats\n` +
    `👥 Referrals: ${db.users[userId].referrals}\n\n` +
    `⚡ <i>Trade BTC direction, win BIG, repeat!</i>\n\n` +
    `Pick your fate:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🟢 Predict UP', 'bet_up')],
        [Markup.button.callback('🔴 Predict DOWN', 'bet_down')],
        [Markup.button.callback('💰 Daily Reward', 'daily')],
        [Markup.button.callback('👥 Invite Friends', 'refer')],
        [Markup.button.callback('💼 Balance', 'balance')]
      ])
    }
  );
});

// ... (Rest of your bot.action and bot.command handlers here) ...

// Launch bot
bot.launch().then(() => {
  console.log('🚀 BitcoinFun bot starting...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
