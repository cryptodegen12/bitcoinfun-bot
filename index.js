const TelegramBot = require("node-telegram-bot-api");

// ENV variables (Railway me set honge)
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN) {
  console.error("❌ BOT_TOKEN missing");
  process.exit(1);
}

// Start bot with polling (Railway friendly)
const bot = new TelegramBot(TOKEN, { polling: true });

// In-memory DB (temporary)
const users = {};

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!users[chatId]) {
    users[chatId] = {
      capital: 35,
      lastPlay: null
    };

    if (ADMIN_ID) {
      bot.sendMessage(
        ADMIN_ID,
        `🆕 New user joined BitcoinFun\nUser ID: ${chatId}`
      );
    }
  }

  const welcome = `
🎮 *Welcome to BitcoinFun*

Daily BTC rounds designed to simulate high-growth scenarios.

• One round per day
• +2.5% in-game capital
• Compounding engine
• Simulation only

Trading mode active.
`;

  bot.sendMessage(chatId, welcome, {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [
        ["🎯 Play BTC Round"],
        ["💼 My Capital", "⏳ Timer"],
        ["ℹ️ How It Works"]
      ],
      resize_keyboard: true
    }
  });
});

// Button handling
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!users[chatId]) return;

  const user = users[chatId];

  // PLAY ROUND
  if (text === "🎯 Play BTC Round") {
    const now = Date.now();

    if (user.lastPlay && now - user.lastPlay < 24 * 60 * 60 * 1000) {
      const remaining =
        24 * 60 * 60 * 1000 - (now - user.lastPlay);

      const hours = Math.ceil(remaining / (1000 * 60 * 60));

      bot.sendMessage(
        chatId,
        `⏳ Round already played.\nCome back after ${hours} hour(s).`
      );
      return;
    }

    const reward = user.capital * 0.025;
    user.capital += reward;
    user.lastPlay = now;

    bot.sendMessage(
      chatId,
      `✅ *BTC Round Completed*\n\n+${reward.toFixed(
        2
      )} BT Fun added\n\n💼 New Capital: *${user.capital.toFixed(
        2
      )} BT Fun*`,
      { parse_mode: "Markdown" }
    );
  }

  // MY CAPITAL
  if (text === "💼 My Capital") {
    bot.sendMessage(
      chatId,
      `💼 *Your Capital*\n\n${user.capital.toFixed(2)} BT Fun`,
      { parse_mode: "Markdown" }
    );
  }

  // TIMER
  if (text === "⏳ Timer") {
    if (!user.lastPlay) {
      bot.sendMessage(chatId, "🎯 You can play now.");
      return;
    }

    const now = Date.now();
    const diff = now - user.lastPlay;

    if (diff >= 24 * 60 * 60 * 1000) {
      bot.sendMessage(chatId, "🎯 You can play now.");
    } else {
      const hours = Math.ceil(
        (24 * 60 * 60 * 1000 - diff) / (1000 * 60 * 60)
      );
      bot.sendMessage(chatId, `⏳ Next round in ${hours} hour(s).`);
    }
  }

  // HOW IT WORKS
  if (text === "ℹ️ How It Works") {
    bot.sendMessage(
      chatId,
      `ℹ️ *How BitcoinFun Works*

• This is a simulated game engine
• No real trading involved
• Capital is in-game only
• One guaranteed round per day
• Rewards compound automatically

Fun. Consistency. Engine-driven.`,
      { parse_mode: "Markdown" }
    );
  }
});

console.log("✅ BitcoinFun bot is running...");

