import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { fileURLToPath } from "url";
import path from "path";
import { loadProducts } from "./src/menu/keyboard.js";
import handlerMenu from "./src/menu/handlerMenu.js";

dotenv.config();

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("ERROR: isi TOKEN di .env");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/**
 * Load products (sync at startup) then start bot handlers.
 * loadProducts membaca src/data/products.json dan menyusun keyboard dinamis.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, "src", "data", "products.json");

let products = [];
async function init() {
  products = await loadProducts(dataPath); // returns array
  console.log(`Loaded ${products.length} product(s).`);

  // /start or /menu -> send main menu with dynamic numeric buttons
  bot.onText(/\/start|\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const reply = "Halo! Pilih menu atau nomor produk di bawah:";
    const keyboard = await import("./src/menu/keyboard.js");
    const kb = keyboard.default(products.length);
    bot.sendMessage(chatId, reply, {
      reply_markup: {
        keyboard: kb,
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    });
  });

  // handle normal messages (buttons from reply keyboard)
  bot.on("message", async (msg) => {
    // ignore messages without text
    if (!msg.text) return;

    // If message is a callback query acknowledgement (Telegram sometimes sends text for callbacks), we'll let handlerMenu decide
    await handlerMenu(msg, bot, products);
  });

  // handle inline button callbacks
  bot.on("callback_query", async (callbackQuery) => {
    // callbackQuery.data will hold action like "detail:2" or "buy:2"
    const data = callbackQuery.data || "";
    const message = callbackQuery.message;
    const chatId = message ? message.chat.id : callbackQuery.from.id;

    try {
      if (data.startsWith("detail:")) {
        const idx = Number(data.split(":")[1]);
        const product = products[idx - 1];
        if (!product) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: "Produk tidak ditemukan." });
          return;
        }
        // send detailed list
        const lines = [];
        if (product.items && product.items.length) {
          lines.push(`Detail Produk ${product.name}:\n`);
          product.items.forEach((it, i) => lines.push(`${i+1}. ${it}`));
        } else {
          lines.push(`Tidak ada detail untuk produk ${product.name}.`);
        }
        await bot.sendMessage(chatId, lines.join("\n"));
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      if (data.startsWith("buy:")) {
        const idx = Number(data.split(":")[1]);
        const product = products[idx - 1];
        if (!product) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: "Produk tidak ditemukan." });
          return;
        }
        // Simple purchase flow: ask for destination number
        await bot.sendMessage(chatId, `Kamu memilih *${product.name}*. Silakan kirim nomor tujuan untuk pembelian.`, { parse_mode: "Markdown" });
        await bot.answerCallbackQuery(callbackQuery.id);
        return;
      }

      // unknown callback
      await bot.answerCallbackQuery(callbackQuery.id, { text: "Action tidak dikenal." });
    } catch (err) {
      console.error("callback_query error", err);
      try { await bot.answerCallbackQuery(callbackQuery.id, { text: "Terjadi error." }); } catch(e){}
    }
  });

  console.log("Bot berjalan. Ketik /start di Telegram.");
}

init().catch(err => {
  console.error("Init error:", err);
  process.exit(1);
});
