// src/plugins/geminiPlugin.js
import fetch from "node-fetch";

class GeminiClient {
  constructor() {
    this.s = null;
    this.r = 1;
  }

  async init() {
    const res = await fetch("https://gemini.google.com/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
      },
    });

    const h = await res.text();

    this.s = {
      a: h.match(/"SNlM0e":"(.*?)"/)?.[1] || "",
      b: h.match(/"cfb2h":"(.*?)"/)?.[1] || "",
      c: h.match(/"FdrFJe":"(.*?)"/)?.[1] || "",
    };

    return this.s;
  }

  async ask(message) {
    if (!this.s) await this.init();

    const payload = [null, JSON.stringify([[message, 0, null, null, null, null, 0]])];
    const params = new URLSearchParams({
      bl: this.s.b,
      "f.sid": this.s.c,
      hl: "id",
      _reqid: this.r++,
      rt: "c",
    });

    const res = await fetch(
      `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${params}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
          "x-same-domain": "1",
        },
        body: `f.req=${encodeURIComponent(JSON.stringify(payload))}&at=${this.s.a}`,
      }
    );

    return this.parse(await res.text());
  }

  parse(text) {
    let last = null;

    for (const line of text.split("\n").filter((x) => x.startsWith('[["wrb.fr"'))) {
      try {
        const data = JSON.parse(JSON.parse(line)[0][2]);
        if (data[4]?.[0]?.[1]) {
          last = {
            text: Array.isArray(data[4][0][1])
              ? data[4][0][1][0]
              : data[4][0][1],
          };
        }
      } catch {}
    }

    return last;
  }
}

const gemini = new GeminiClient();

export default function setupGeminiPlugin(bot) {
  // /gemini pertanyaan
  bot.onText(/\/gemini (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const question = match[1];

    const waitMsg = await bot.sendMessage(chatId, "🤖 Gemini sedang berpikir...");

    try {
      const res = await gemini.ask(question);

      if (!res?.text) {
        return bot.editMessageText("❌ Gagal mendapatkan jawaban Gemini.", {
          chat_id: chatId,
          message_id: waitMsg.message_id,
        });
      }

      await bot.editMessageText(`✨ *Gemini*\n\n${res.text}`, {
        chat_id: chatId,
        message_id: waitMsg.message_id,
        parse_mode: "Markdown",
      });
    } catch (err) {
      await bot.editMessageText("⚠️ Terjadi error saat menghubungi Gemini.", {
        chat_id: chatId,
        message_id: waitMsg.message_id,
      });
      console.error("Gemini error:", err);
    }
  });

  // alias: /ai
  bot.onText(/\/ai (.+)/, (msg, match) => {
    bot.emit("text", msg, [`/gemini ${match[1]}`]);
  });
}
