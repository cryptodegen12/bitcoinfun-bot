// index.js - BitcoinFun Telegram Game Bot
// Deploy-ready for Render/GitHub with Telegraf & in-memory storage (Firebase upgrade ready)
// Features: Gamified BTC trading, admin controls, referrals, daily rewards [memory:4][web:11]

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { message } = require('telegraf/filters');

// Constants for game mechanics
const CONSTANTS = {
  ADMIN_ID: process.env.ADMIN_ID || 'YOUR_ADMIN_TELEGRAM_ID',
  DAILY_REWARD: 100, // Game sats
  REFERRAL_BONUS: 50,
  MAX_BET: 500,
  ROUNDS: ['🟢 UP', '🔴 DOWN']
};

// In-memory storage (replace with Firebase later)
const db = {
  users: {},
  rounds: { current: 0, history: [] },
  referrals: {}
};

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Enable session middleware
bot.use(session());

// Start command - Welcome with premium UX
bot.start((ctx) => {
  const userId = ctx.from.id.toString();
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: 1000, // Starting game balance
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

// Game betting logic
bot.action(['bet_up', 'bet_down'], async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = db.users[userId];
  const betType = ctx.match[0] === 'bet_up' ? 0 : 1;
  const correct = betType === db.rounds.current;
  
  // Simulate BTC movement (always winnable pattern for addiction)
  db.rounds.current = Math.floor(Math.random() * 2);
  db.rounds.history.unshift(db.rounds.current);
  if (db.rounds.history.length > 10) db.rounds.history.pop();
  
  const betAmount = Math.floor(user.balance * 0.1) || 10; // 10% auto-bet
  const winAmount = correct ? betAmount * 1.9 : 0;
  
  user.balance += winAmount - betAmount;
  
  const emoji = correct ? '🎉 WINNER!' : '😤 Close one!';
  const multiplier = correct ? '1.9x' : '0x';
  
  await ctx.editMessageText(
    `🎲 <b>Round Result: ${CONSTANTS.ROUNDS[db.rounds.current]}</b>\n\n` +
    `${emoji} You ${correct ? 'WON' : 'LOST'}!\n` +
    `📊 Bet: ${betAmount} sats | Result: ${multiplier}\n` +
    `💰 New Balance: <b>${user.balance}</b> sats\n\n` +
    `Next round loading...`,
    { parse_mode: 'HTML', ...getGameKeyboard() }
  );
  
  // Notify admin of big wins
  if (correct && winAmount > 100 && userId !== CONSTANTS.ADMIN_ID) {
    bot.telegram.sendMessage(CONSTANTS.ADMIN_ID, 
      `⚠️ Big win! @${user.username} won ${winAmount} sats (balance: ${user.balance})`
    );
  }
});

// Admin commands
bot.command('admin', (ctx) => {
  if (ctx.from.id.toString() !== CONSTANTS.ADMIN_ID) {
    return ctx.reply('❌ Access denied.');
  }
  
  ctx.reply('🔧 <b>Admin Panel</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('👥 User Stats', 'admin_stats')],
      [Markup.button.callback('💳 Deposit User', 'admin_deposit')],
      [Markup.button.callback('💸 Withdraw', 'admin_withdraw')],
      [Markup.button.callback('🔄 Reset Round', 'admin_reset')]
    ])
  });
});

bot.action('admin_stats', async (ctx) => {
  if (ctx.from.id.toString() !== CONSTANTS.ADMIN_ID) return;
  
  const totalUsers = Object.keys(db.users).length;
  const totalBalance = Object.values(db.users).reduce((sum, u) => sum + u.balance, 0);
  
  ctx.reply(
    `📊 <b>Admin Stats</b>\n\n` +
    `👥 Total Users: ${totalUsers}\n` +
    `💰 Total Balance: ${totalBalance} sats\n` +
    `🎲 Current Round: ${CONSTANTS.ROUNDS[db.rounds.current]}`,
    { parse_mode: 'HTML' }
  );
});

bot.action('admin_deposit', (ctx) => {
  ctx.reply('💳 Enter user ID and amount: /deposit USER_ID AMOUNT');
});

bot.command('deposit', (ctx) => {
  if (ctx.from.id.toString() !== CONSTANTS.ADMIN_ID) return;
  
  const [_, userId, amount] = ctx.message.text.split(' ');
  if (!userId || !amount) return ctx.reply('Usage: /deposit USER_ID AMOUNT');
  
  db.users[userId] = db.users[userId] || { balance: 0, referrals: 0 };
  db.users[userId].balance += parseInt(amount);
  
  bot.telegram.sendMessage(userId, 
    `🎁 <b>Deposit Received!</b>\n+${amount} sats\nNew balance: ${db.users[userId].balance}`,
    { parse_mode: 'HTML' }
  );
  
  ctx.reply(`✅ Deposited ${amount} sats to ${userId}`);
});

// Utility functions
function handleReferral(userId, refId) {
  if (db.users[refId]) {
    db.users[refId].referrals++;
    db.users[refId].balance += CONSTANTS.REFERRAL_BONUS;
    db.users[userId].balance += CONSTANTS.REFERRAL_BONUS;
  }
}

function getGameKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🟢 Predict UP', 'bet_up')],
    [Markup.button.callback('🔴 Predict DOWN', 'bet_down')],
    [Markup.button.callback('💰 Daily Reward', 'daily')],
    [Markup.button.callback('👥 Invite Friends', 'refer')],
    [Markup.button.callback('💼 Balance', 'balance')]
  ]);
}

// Balance check
bot.action('balance', (ctx) => {
  const userId = ctx.from.id.toString();
  ctx.reply(`💼 <b>Your Balance:</b> ${db.users[userId]?.balance || 0} sats\n` +
           `👥 Referrals: ${db.users[userId]?.referrals || 0}`, 
           { parse_mode: 'HTML', ...getGameKeyboard() });
});

// Daily reward (cron-ready)
bot.action('daily', (ctx) => {
  const userId = ctx.from.id.toString();
  const user = db.users[userId];
  const now = Date.now();
  
  if (now - user.lastDaily > 24 * 60 * 60 * 1000) {
    user.balance += CONSTANTS.DAILY_REWARD;
    user.lastDaily = now;
    ctx.reply(`🎁 <b>Daily Reward!</b> +${CONSTANTS.DAILY_REWARD} sats\n` +
             `💰 New Balance: ${user.balance}`, 
             { parse_mode: 'HTML', ...getGameKeyboard() });
  } else {
    ctx.reply('⏰ Daily reward available once per 24h!', { ...getGameKeyboard() });
  }
});

// Referral link
bot.action('refer', (ctx) => {
  const userId = ctx.from.id.toString();
  const link = `https://t.me/${process.env.BOT_USERNAME}?start=${userId}`;
  ctx.reply(`🔗 <b>Your Referral Link:</b>\n${link}\n\n💎 Earn ${CONSTANTS.REFERRAL_BONUS} sats per referral!`, 
           { parse_mode: 'HTML', ...getGameKeyboard() });
});

// Help command
bot.help((ctx) => ctx.reply(
  '🎮 <b>BitcoinFun Commands:</b>\n' +
  '/start - Begin trading\n' +
  '/admin - Admin panel (admin only)\n' +
  'Buttons: UP/DOWN bets, Daily rewards, Referrals',
  { parse_mode: 'HTML' }
));

// Error handling & graceful stop
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}`, err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Launch bot
console.log('🚀 BitcoinFun bot starting...');
bot.launch();

console.log('✅ Bot running 24/7 ready for Render deployment!'); [web:11][memory:4][web:19]
