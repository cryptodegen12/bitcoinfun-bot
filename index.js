require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');

// --- 1. WEB SERVER SETUP (Required for Render) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('BitcoinFun Bot is Online!'));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Health check server running on port ${PORT}`);
});

// --- 2. GAME CONSTANTS ---
const CONSTANTS = {
  ADMIN_ID: process.env.ADMIN_ID || '0',
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

// --- 3. BOT INITIALIZATION ---
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("ERROR: TELEGRAM_BOT_TOKEN is missing in Environment Variables!");
    process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(session());

// --- 4. GAME LOGIC ---
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
    if (db.users[refId]) {
        db.users[refId].referrals++;
        db.users[refId].balance += CONSTANTS.REFERRAL_BONUS;
        db.users[userId].balance += CONSTANTS.REFERRAL_BONUS;
    }
  }

  ctx.reply(
    `🎰 Welcome to <b>BitcoinFun</b>! 💎\n\n` +
    `🚀 <b>Your Balance:</b> ${db.users[userId].balance} sats\n` +
    `Pick your fate:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🟢 Predict UP', 'bet_up'), Markup.button.callback('🔴 Predict DOWN', 'bet_down')],
        [Markup.button.callback('💰 Daily Reward', 'daily')],
        [Markup.button.callback('👥 Invite', 'refer'), Markup.button.callback('💼 Balance', 'balance')]
      ])
    }
  );
});

bot.action(['bet_up', 'bet_down'], async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = db.users[userId];
  if (!user) return ctx.answerCbQuery("Please /start first!");

  const correct = (ctx.match[0] === 'bet_up' ? 0 : 1) === Math.floor(Math.random() * 2);
  const betAmount = 10;
  user.balance += correct ? betAmount : -betAmount;
  
  await ctx.editMessageText(
    `🎲 Result: ${correct ? '🎉 WIN!' : '😤 LOSS'}\n💰 New Balance: <b>${user.balance}</b>`,
    { parse_mode: 'HTML', ...getGameKeyboard() }
  );
});

bot.action('balance', (ctx) => {
    const userId = ctx.from.id.toString();
    ctx.reply(`💼 Balance: ${db.users[userId]?.balance || 0} sats`, getGameKeyboard());
});

bot.action('daily', (ctx) => {
    const user = db.users[ctx.from.id.toString()];
    user.balance += CONSTANTS.DAILY_REWARD;
    ctx.reply(`🎁 +${CONSTANTS.DAILY_REWARD} sats!`, getGameKeyboard());
});

bot.action('refer', (ctx) => {
    ctx.reply(`🔗 Link: https://t.me/${process.env.BOT_USERNAME}?start=${ctx.from.id}`, getGameKeyboard());
});

function getGameKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('🟢 UP', 'bet_up'), Markup.button.callback('🔴 DOWN', 'bet_down')]]);
}

// --- 5. LAUNCH ---
bot.launch().then(() => console.log('🚀 Bot is polling...'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
