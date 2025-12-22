const TelegramBot = require("node-telegram-bot-api");
const admin = require("firebase-admin");

// ===== ENV =====
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const FIREBASE_KEY = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!TOKEN || !FIREBASE_KEY) {
  console.error("Missing ENV");
  process.exit(1);
}

// ===== FIREBASE INIT =====
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(FIREBASE_KEY))
});
const db = admin.firestore();

// ===== BOT =====
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== CONSTANTS =====
const ROUND_INTERVAL = 12 * 60 * 60 * 1000;
const PING_INTERVAL = 6 * 60 * 60 * 1000;
const MIN_ACTIVATION = 35;
const MIN_REDEEM = 30;

// ===== UTIL =====
const userRef = (id) => db.collection("users").doc(String(id));

// ===== START =====
bot.onText(/\/start(?:\s+(\w+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const refCode = match?.[1] || null;

  const ref = userRef(chatId);
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      capital: 0,
      activated: false,
      lastPlay: null,
      lastPing: null,
      pingCount: 0,
      referredBy: refCode || null,
      referrals: 0,
      doubleUntil: null
    });

    if (refCode) {
      const q = await db.collection("users")
        .where("myRef", "==", refCode).get();
      if (!q.empty) {
        const inviter = q.docs[0];
        await inviter.ref.update({
          capital: admin.firestore.FieldValue.increment(5),
          referrals: admin.firestore.FieldValue.increment(1),
          doubleUntil: Date.now() + 24 * 60 * 60 * 1000
        });
      }
    }
  }

  await ref.update({ myRef: chatId.toString() });

  bot.sendMessage(chatId,
`🚀 *Welcome to BitcoinFun*

💎 Premium BTC reward game  
🎯 1 round every 12 hours  
⚙️ Compounding engine  
🔥 Manual-reviewed rewards  

Ready to unlock your game capital? 😎`,
{
  parse_mode: "Markdown",
  reply_markup: {
    keyboard: [
      ["🔓 Activate Game Capital"],
      ["🎯 Play Bitcoin Round"],
      ["💼 My Capital", "🤝 Referrals"],
      ["💸 Redeem", "ℹ️ How It Works"]
    ],
    resize_keyboard: true
  }
});
});

// ===== ACTIVATE =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const ref = userRef(chatId);
  const user = (await ref.get()).data();
  if (!user) return;

  if (text === "🔓 Activate Game Capital") {
    await ref.update({ pendingActivation: true });
    return bot.sendMessage(chatId,
`🔐 *Capital Activation*

💰 Minimum: *35*  
🚀 Higher amount allowed  

📸 Send transaction screenshot  
⏳ Manual admin review`,
{ parse_mode: "Markdown" });
  }

  if (text === "🎯 Play Bitcoin Round") {
    if (!user.activated)
      return bot.sendMessage(chatId,"🔒 Activate capital first 😎");

    const now = Date.now();
    const interval =
      user.doubleUntil && now < user.doubleUntil
        ? ROUND_INTERVAL / 2
        : ROUND_INTERVAL;

    if (user.lastPlay && now - user.lastPlay < interval) {
      const h = Math.ceil((interval - (now - user.lastPlay)) / 3600000);
      return bot.sendMessage(chatId,`⏳ Next round in ${h}h`);
    }

    const reward = user.capital * 0.025;
    await ref.update({
      capital: admin.firestore.FieldValue.increment(reward),
      lastPlay: now,
      lastPing: null,
      pingCount: 0
    });

    return bot.sendMessage(chatId,
`⚙️ *BTC Engine Complete*

🔥 +2.5% added  
💼 New Capital updated  

Consistency = Alpha 😎`,
{ parse_mode: "Markdown" });
  }

  if (text === "💼 My Capital") {
    return bot.sendMessage(chatId,
`💼 *Your Capital*

🔥 ${user.capital.toFixed(2)} BT Fun`,
{ parse_mode: "Markdown" });
  }

  if (text === "🤝 Referrals") {
    return bot.sendMessage(chatId,
`🤝 *Invite & Earn*

Invite link:
https://t.me/BitcoinFunBot?start=${chatId}

🎁 Reward:
+5 BT Fun  
+24h double rounds`,
{ parse_mode: "Markdown" });
  }

  if (text === "💸 Redeem") {
    if (user.capital < MIN_REDEEM)
      return bot.sendMessage(chatId,"❌ Minimum 30 BT Fun required");

    await ref.update({ redeemStep: "address" });
    return bot.sendMessage(chatId,
"🔗 Send your *BEP20 USDT address*",
{ parse_mode: "Markdown" });
  }

  if (user.redeemStep === "address" && text.startsWith("0x")) {
    await db.collection("redeems").add({
      user: chatId,
      amount: MIN_REDEEM,
      address: text,
      status: "pending",
      time: Date.now()
    });
    await ref.update({ redeemStep: null });
    return bot.sendMessage(chatId,
"📨 Redeem request submitted\n⏳ Manual review");
  }
});

// ===== PHOTO (ACTIVATION) =====
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const ref = userRef(chatId);
  const user = (await ref.get()).data();
  if (!user?.pendingActivation) return;

  const photo = msg.photo.at(-1).file_id;
  await ref.update({ pendingActivation: false });

  bot.sendPhoto(ADMIN_ID, photo, {
    caption: `🧾 ACTIVATE\nUser: ${chatId}\n/approve ${chatId} AMOUNT`
  });

  bot.sendMessage(chatId,"✅ Screenshot received. Await approval.");
});

// ===== ADMIN COMMANDS =====
bot.onText(/\/approve (\d+) (\d+)/, async (msg, m) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  const id = m[1], amt = +m[2];
  if (amt < MIN_ACTIVATION) return;

  await userRef(id).update({
    activated: true,
    capital: admin.firestore.FieldValue.increment(amt)
  });

  bot.sendMessage(id,
`🎉 *Activation Approved*
💼 ${amt} BT Fun credited`,
{ parse_mode: "Markdown" });
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id.toString() !== ADMIN_ID) return;
  const snap = await db.collection("users").get();
  bot.sendMessage(ADMIN_ID,
`📊 STATS
Users: ${snap.size}`);
});

// ===== 6H PING =====
setInterval(async () => {
  const now = Date.now();
  const snap = await db.collection("users").get();

  snap.forEach(async (doc) => {
    const u = doc.data();
    if (!u.lastPlay) return;
    if (now - u.lastPlay >= PING_INTERVAL && u.pingCount < 4) {
      await doc.ref.update({
        lastPing: now,
        pingCount: admin.firestore.FieldValue.increment(1)
      });
      bot.sendMessage(doc.id,
"👀 BitcoinFun misses you...\nYour BTC engine is waiting ⚙️");
    }
  });
}, 60 * 60 * 1000);

console.log("🚀 BitcoinFun FULL SYSTEM RUNNING");
