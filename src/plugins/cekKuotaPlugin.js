import axios from "axios";
import { fileURLToPath } from "url";
import path from "path";

const lastUse = new Map();
const lastQuery = new Map();
const inProgress = new Map(); // <-- mencegah proses duplicate

function rateLimit(userId, ms = 6000) {
  const now = Date.now();
  const prev = lastUse.get(userId) || 0;
  if (now - prev < ms) return Math.ceil((ms - (now - prev)) / 1000);
  lastUse.set(userId, now);
  return 0;
}

function normalizeNumber(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/[\s().\-]/g, "");
  if (s.startsWith("+")) s = s.slice(1);

  if (/^0\d+$/i.test(s)) s = "62" + s.slice(1);
  else if (/^8\d+$/i.test(s)) s = "62" + s;
  else if (/^62\d+$/i.test(s)) {
    // ok
  } else if (!/^\d+$/.test(s)) {
    return null;
  }

  if (s.length < 10 || s.length > 15) return null;
  return s;
}

function progressBar(remaining, total) {
  try {
    if (!total || total === 0) return "▫▫▫▫▫▫▫▫▫▫";
    const pct = Math.max(0, Math.min(1, remaining / total));
    const filled = Math.round(pct * 10);
    return "▓".repeat(filled) + "░".repeat(10 - filled) + ` ${(pct * 100).toFixed(0)}%`;
  } catch {
    return "▫▫▫▫▫▫▫▫▫▫";
  }
}

function parseSize(sizeStr) {
  if (!sizeStr || typeof sizeStr !== "string") return 0;
  const cleanStr = sizeStr.replace(/,/g, "").trim();
  const match = cleanStr.match(/^([\d.]+)\s*(GB|MB|KB|TB)?/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = (match[2] || "MB").toUpperCase();
  switch (unit) {
    case "TB": return value * 1024 ** 4;
    case "GB": return value * 1024 ** 3;
    case "MB": return value * 1024 ** 2;
    case "KB": return value * 1024;
    default: return value;
  }
}

function threadOpts(msg, extra = {}) {
  const opts = { ...extra };
  if (msg && msg.message_thread_id) opts.message_thread_id = msg.message_thread_id;
  return opts;
}

function kb(msisdn) {
  return {
    inline_keyboard: [[{ text: "🔄 Cek ulang", callback_data: `cekkuota:retry:${msisdn}` }]],
  };
}

function escapeHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/* =============================
   versi: KMSp
============================= */
function formatHTML(msisdn, res) {
  const sp = res?.data?.data_sp || {};
  const operator = escapeHTML(sp?.prefix?.value) || "-";
  const aktif = escapeHTML(sp?.active_period?.value) || "-";
  const tenggang = escapeHTML(sp?.grace_period?.value) || "-";
  const status4g = escapeHTML(sp?.status_4g?.value) || "-";
  const dukcapil = escapeHTML(sp?.dukcapil?.value) || "-";
  const umurKartu = escapeHTML(sp?.active_card?.value) || "-";
  const volteDevice = escapeHTML(sp?.volte_device?.value) || "-";
  const volteArea = escapeHTML(sp?.volte_area?.value) || "-";
  const volteSimcard = escapeHTML(sp?.volte_simcard?.value) || "-";

  let text = `<b>✅ Cek Kuota ${operator}</b>\n`;
  text += `📱 <b>Nomor:</b> <code>${msisdn}</code>\n`;
  text += `💳 <b>Operator:</b> ${operator}\n`;
  text += `📶 <b>Status 4G:</b> ${status4g}\n`;
  text += `🧾 <b>Dukcapil:</b> ${dukcapil}\n`;
  text += `📅 <b>Umur Kartu:</b> ${umurKartu}\n`;
  text += `⏰ <b>Masa Aktif:</b> ${aktif}\n`;
  text += `⚠️ <b>Masa Tenggang:</b> ${tenggang}\n\n`;

  if (volteDevice !== "-" || volteArea !== "-" || volteSimcard !== "-") {
    text += `<b>📞 Status VoLTE:</b>\n`;
    if (volteDevice !== "-") text += `  • Device: ${volteDevice}\n`;
    if (volteArea !== "-") text += `  • Area: ${volteArea}\n`;
    if (volteSimcard !== "-") text += `  • Simcard: ${volteSimcard}\n\n`;
  }

  if (res?.data?.hasil) {
    const raw = String(res.data.hasil)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/=+/g, "");
    const sections = raw.split(/(?=🎁 Quota:|🎁 Benefit:)/g);

    text += `<b>📊 Detail Kuota:</b>\n`;
    for (const sec of sections) {
      const lines = sec.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
      let name = "", total = "", sisa = "", exp = "";
      for (const ln of lines) {
        if (ln.includes("🎁 Quota:") || ln.includes("🎁 Benefit:"))
          name = ln.replace(/🎁 (Quota|Benefit):\s*/, "");
        if (ln.includes("🎁 Kuota:")) total = ln.replace(/🎁 Kuota:\s*/, "");
        if (ln.includes("🌲 Sisa Kuota:")) sisa = ln.replace(/🌲 Sisa Kuota:\s*/, "");
        if (ln.includes("🍂 Aktif Hingga:")) exp = ln.replace(/🍂 Aktif Hingga:\s*/, "");
      }
      if (!name) continue;
      const totalBytes = parseSize(total);
      const sisaBytes = parseSize(sisa);
      text += `\n📦 <b>${escapeHTML(name)}</b>`;
      if (exp) text += ` — <i>Exp: ${escapeHTML(exp)}</i>\n`;
      if (total && sisa) {
        const bar = progressBar(sisaBytes, totalBytes);
        text += `  • <b>Kuota:</b> ${escapeHTML(sisa)} / ${escapeHTML(total)}\n  • <code>[${bar}]</code>\n`;
      } else if (total) {
        text += `  • <b>Kuota:</b> ${escapeHTML(total)}\n`;
      }
    }
  } else text += `❌ <i>Tidak ada info kuota.</i>`;
  return text;
}

/* =============================
api baru
============================= */
async function cekKuotaBendith(msisdn) {
  const url = `https://bendith.my.id/end.php?check=package&number=${msisdn}&version=2`;
  const { data } = await axios.get(url, { timeout: 15000 });
  return data;
}

function formatBendith(msisdn, data) {
  const info = data?.data?.subs_info || {};
  const pkgs = data?.data?.package_info?.packages || [];

  const operator = escapeHTML(info.operator || "XL");
  const idVerified = escapeHTML(info.id_verified || "-");
  const netType = escapeHTML(info.net_type || "-");
  const expDate = escapeHTML(info.exp_date || "-");
  const grace = escapeHTML(info.grace_until || "-");
  const tenure = escapeHTML(info.tenure || "-");
  const volteDevice = info?.volte?.device ? "Ya" : "Tidak";
  const volteArea = info?.volte?.area ? "Ya" : "Tidak";
  const volteSim = info?.volte?.simcard ? "Ya" : "Tidak";

  let t = `<b>✅ Cek Kuota ${operator}</b>\n`;
  t += `📱 <b>Nomor:</b> <code>${msisdn}</code>\n`;
  t += `💳 <b>Operator:</b> ${operator}\n`;
  t += `🧾 <b>ID Verifikasi:</b> ${idVerified}\n`;
  t += `📶 <b>Jaringan:</b> ${netType}\n`;
  t += `📅 <b>Masa Aktif:</b> ${expDate}\n`;
  t += `⚠️ <b>Masa Tenggang:</b> ${grace}\n`;
  t += `⏳ <b>Umur Kartu:</b> ${tenure}\n\n`;

  if (info.volte) {
    t += `<b>📞 Status VoLTE:</b>\n`;
    t += `  • Device: ${volteDevice}\n`;
    t += `  • Area: ${volteArea}\n`;
    t += `  • Simcard: ${volteSim}\n\n`;
  }

  if (!pkgs.length) {
    t += `❌ <i>Tidak ada info paket.</i>`;
    return t;
  }

  t += `<b>📊 Detail Paket:</b>\n`;
  for (const p of pkgs) {
    const name = escapeHTML(p.name || "-");
    const exp = escapeHTML(p.expiry || "-");
    t += `\n📦 <b>${name}</b> — <i>Exp: ${exp}</i>\n`;

    const quotas = p.quotas || [];
    for (const q of quotas) {
      const qName = escapeHTML(q.name || "-");
      const total = escapeHTML(q.total || "-");
      const remain = escapeHTML(q.remaining || "-");
      const percent = typeof q.percent === "number" ? q.percent : null;

      const totalBytes = parseSize(q.total);
      const remainBytes = parseSize(q.remaining);
      let bar = "";
      if (totalBytes && remainBytes) {
        bar = progressBar(remainBytes, totalBytes);
      }

      t += `  • <b>${qName}</b>\n`;
      t += `     ${remain} / ${total}\n`;
      if (bar) t += `     <code>[${bar}]</code>\n`;
      else if (percent != null) t += `     ⏳ ${percent}%\n`;
    }
  }

  return t;
}

/* =============================
  doble api
============================= */
async function cekKuotaKMSP(msisdn) {
  const { data: res } = await axios.get(
    "https://apigw.kmsp-store.com/sidompul/v4/cek_kuota",
    {
      params: { msisdn, isJSON: true },
      headers: {
        Authorization: "Basic c2lkb21wdWxhcGk6YXBpZ3drbXNw",
        "X-API-Key": "60ef29aa-a648-4668-90ae-20951ef90c55",
        "X-App-Version": "4.0.0",
      },
      timeout: 30000,
    }
  );
  return res;
}

/********************************
 * Plugin Handler
*********************************/
export default function setupCekKuotaPlugin(bot) {
  async function handleCek(msg, msisdn) {
    const chatId = msg.chat.id;
    const fromId = msg.from?.id || msg.chat.id;
    const key = `${chatId}:${msisdn}`;

    // jika sudah ada proses berjalan untuk key ini, return (hindari spam)
    if (inProgress.get(key)) {
      // optional: beri tahu singkat kalau sudah dalam proses
      return bot.sendMessage(chatId, `⏳ Permintaan untuk <code>${msisdn}</code> sedang diproses...`, threadOpts(msg, { parse_mode: "HTML", reply_to_message_id: msg.message_id }));
    }

    // cegah spam dobel input sama (toleransi waktu kecil)
    if (lastQuery.get(key) && Date.now() - lastQuery.get(key) < 5000) return;
    lastQuery.set(key, Date.now());

    const wait = rateLimit(fromId);
    if (wait)
      return bot.sendMessage(
        chatId,
        `⏳ Tunggu ${wait} detik sebelum cek lagi.`,
        threadOpts(msg, { reply_to_message_id: msg.message_id })
      );

    inProgress.set(key, true); // tandai in-progress

    let loading;
    try {
      loading = await bot.sendMessage(
        chatId,
        `🔍 Mengecek kuota <code>${msisdn}</code> ...`,
        threadOpts(msg, { parse_mode: "HTML", reply_to_message_id: msg.message_id })
      );

      /* ==============================
         try api bendith
      ===============================*/
      try {
        const bend = await cekKuotaBendith(msisdn);
        if (bend?.success && bend?.data?.subs_info) {
          await bot.editMessageText(formatBendith(msisdn, bend), {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "HTML",
            reply_markup: kb(msisdn),
          });
          return;
        }
      } catch (e) {
        console.log("Bendith gagal → fallback KMSp:", e.message || e);
      }

      /* ==============================
         Fallback KMSp
      ===============================*/
      const res = await cekKuotaKMSP(msisdn);

      if (!res || !res.status) {
        await bot.editMessageText("❌ Gagal cek kuota atau nomor tidak ditemukan.", {
          chat_id: chatId,
          message_id: loading.message_id,
        });
        return;
      }

      await bot.editMessageText(formatHTML(msisdn, res), {
        chat_id: chatId,
        message_id: loading.message_id,
        parse_mode: "HTML",
        reply_markup: kb(msisdn),
      });

    } catch (err) {
      try {
        if (loading && loading.message_id) {
          await bot.editMessageText(`❌ Error: ${err.message || "Server tidak merespons"}`, {
            chat_id: chatId,
            message_id: loading.message_id,
          });
        } else {
          await bot.sendMessage(chatId, `❌ Error: ${err.message || "Server tidak merespons"}`);
        }
      } catch (e) {
        console.log("Gagal mengirim pesan error:", e);
      }
    } finally {
      // bersihkan flag inProgress agar request berikutnya bisa diproses
      inProgress.delete(key);
    }
  }

  // Command handlers
  bot.onText(/\/(cek|kuota|cekkuota)\s+(.+)/i, async (msg, match) => {
    const msisdn = normalizeNumber(match[2]);
    if (!msisdn)
      return bot.sendMessage(
        msg.chat.id,
        "❌ Nomor tidak valid.\n\n<b>Contoh:</b>\n<code>/cek 081234567890</code>",
        threadOpts(msg, { parse_mode: "HTML", reply_to_message_id: msg.message_id })
      );
    await handleCek(msg, msisdn);
  });

  bot.onText(/\/(cek|kuota|cekkuota)$/i, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `📋 <b>Cara Menggunakan Cek Kuota:</b>\n\n` +
        `<code>/cek &lt;nomor&gt;</code>\n<code>/kuota &lt;nomor&gt;</code>\n<code>/cekkuota &lt;nomor&gt;</code>`,
      threadOpts(msg, { parse_mode: "HTML", reply_to_message_id: msg.message_id })
    );
  });

  // Auto detect nomor
  bot.on("message", async (msg) => {
    // ignore non-text and bot messages
    if (!msg.text) return;
    if (msg.from && msg.from.is_bot) return;

    const text = msg.text.trim();
    // jangan proses jika message itu adalah command cek (handled di onText)
    if (/^\/(cek|kuota|cekkuota)/i.test(text)) return;
    const msisdn = normalizeNumber(text);
    if (!msisdn) return;
    await handleCek(msg, msisdn);
  });

  // Callback handler
  bot.on("callback_query", async (cq) => {
    try {
      const [prefix, action, num] = (cq.data || "").split(":");
      if (prefix !== "cekkuota" || action !== "retry") return;

      const chatId = cq.message.chat.id;
      const key = `${chatId}:${num}`;
      // jika sudah ada in-progress, jawab singkat dan hentikan
      if (inProgress.get(key)) {
        await bot.answerCallbackQuery(cq.id, { text: "⏳ Sedang diproses..." });
        return;
      }

      inProgress.set(key, true);
      try {
        await bot.editMessageText("🔍 Mengecek kuota lagi...", {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
        });

        try {
          const bend = await cekKuotaBendith(num);
          if (bend?.success && bend?.data?.subs_info) {
            await bot.editMessageText(formatBendith(num, bend), {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              parse_mode: "HTML",
              reply_markup: kb(num),
            });
            await bot.answerCallbackQuery(cq.id, { text: "✅ Kuota berhasil dicek ulang!" });
            return;
          }
        } catch (e) {
          console.log("Bendith retry gagal → fallback KMSp:", e.message || e);
        }

        const res = await cekKuotaKMSP(num);

        if (!res || !res.status) {
          await bot.editMessageText("❌ Gagal cek kuota atau nomor tidak ditemukan.", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
          });
        } else {
          await bot.editMessageText(formatHTML(num, res), {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            parse_mode: "HTML",
            reply_markup: kb(num),
          });
        }

        await bot.answerCallbackQuery(cq.id, { text: "✅ Selesai cek ulang!" });
      } finally {
        inProgress.delete(key);
      }

    } catch (e) {
      console.log("callback error:", e);
      try {
        await bot.answerCallbackQuery(cq.id, { text: "❌ Terjadi kesalahan." });
      } catch {}
    }
  });

  console.log("✅ Cek Kuota plugin loaded");
}
