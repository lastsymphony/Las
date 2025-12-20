import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import setupCekKuotaPlugin from "./src/plugins/cekKuotaPlugin.js"; // Import plugin

dotenv.config();
const TOKEN = '8481195310:AAES45ef0PPFjwhMhn7a7Im1hZXsjp-LEgM';

const bot = new TelegramBot(TOKEN, { polling: true });

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const intro = `Halo 👋\n\nGunakan perintah berikut:\n/cek <nomor> - Cek kuota nomor telepon\n/kuota <nomor> - Cek kuota nomor telepon\n/cekkuota <nomor> - Cek kuota nomor telepon\n\nContoh: /cek 081234567890`;
  return bot.sendMessage(chatId, intro);
});

// Setup plugin cek kuota
setupCekKuotaPlugin(bot);

console.log("Bot cek kuota berjalan. Ketik /start di Telegram.");
