// ================== ENV CHECK ==================
if (!process.env.BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN");
  process.exit(1);
}

// ================== IMPORTS ==================
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

// ================== BOT INIT (POLLING MODE) ==================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true,
});

console.log("🤖 Telegram bot polling started");

// ================== BASIC BOT LOGIC ==================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const welcomeText = `
🔥 *Welcome to BitcoinFun* 🔥

🎮 Play daily BTC rounds
💰 Grow in-game capital
🤝 Invite friends & unlock rewards
⏳ One round every 12 hours

⚠️ *This is a simulation game*
`;

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [
        ["🎯 Play BTC Round"],
        ["💼 My Capital", "🤝 Referrals"],
        ["ℹ️ How It Works"]
      ],
      resize_keyboard: true
    }
  });
});

// ================== BUTTON HANDLER ==================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🎯 Play BTC Round") {
    bot.sendMessage(chatId, "✅ BTC Round played!\n📈 +2.5% added to your in-game capital");
  }

  if (text === "💼 My Capital") {
    bot.sendMessage(chatId, "💰 Your current in-game capital: *35 BT Fun*", {
      parse_mode: "Markdown"
    });
  }

  if (text === "🤝 Referrals") {
    bot.sendMessage(
      chatId,
      "🤝 Invite 1 friend & get *$5 BT Fun*\n⏳ +1 day extra trading access",
      { parse_mode: "Markdown" }
    );
  }

  if (text === "ℹ️ How It Works") {
    bot.sendMessage(
      chatId,
      "📊 *How BitcoinFun Works*\n\n• 1 BTC round every 12 hours\n• Each round adds +2.5%\n• Capital compounds\n• No losses\n\n🎮 Just play & enjoy!",
      { parse_mode: "Markdown" }
    );
  }
});

// ================== EXPRESS SERVER (RENDER FREE FIX) ==================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🚀 BitcoinFun bot is running");
});

app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT}`);
});

// ================== FINAL LOG ==================
console.log("🚀 BitcoinFun FULL SYSTEM RUNNING");
