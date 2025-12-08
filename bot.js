import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import buildReplyKeyboard, { loadProducts } from "./src/menu/keyboard.js";
import handlerMenu from "./src/menu/handlerMenu.js";
import { handleCallback } from "./src/services/orderService.js";

dotenv.config();
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("ERROR: isi TOKEN di .env");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// get data path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsPath = path.join(__dirname, "src", "data", "products.json");

let products = [];

// load products at startup
async function initProducts() {
  products = await loadProducts(productsPath);
  console.log(`Loaded ${products.length} product(s).`);
}

initProducts().catch(err => {
  console.error("Failed loading products:", err);
  process.exit(1);
});

// /start and /menu
bot.onText(/\/start|\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  // default page 1
  const keyboard = buildReplyKeyboard(products, 1);
  const intro = `Halo 👋\nPilih menu atau nomor produk.\nKetik "Next ▶️" / "◀️ Prev" untuk pindah halaman.`;
  return bot.sendMessage(chatId, intro, {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});

// delegate message handler
bot.on("message", async (msg) => {
  // ignore messages without text or commands (commands handled above)
  if (!msg.text) return;
  // ignore callback_query messages (they come separately)
  // pass to handlerMenu which expects (msg, bot, products)
  await handlerMenu(msg, bot, products);
});

// callback_query handling (inline buttons)
bot.on("callback_query", async (callbackQuery) => {
  try {
    await handleCallback(callbackQuery, bot, products);
  } catch (err) {
    console.error("handleCallback error:", err);
    try { await bot.answerCallbackQuery(callbackQuery.id, { text: "Terjadi error." }); } catch(e){}
  }
});

console.log("Bot berjalan. Ketik /start di Telegram.");
