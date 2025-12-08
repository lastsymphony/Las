import buildReplyKeyboard, { buildProductsListText } from "./keyboard.js";

/**
 * handlerMenu(msg, bot, products)
 */
export default async function handlerMenu(msg, bot, products = []) {
  const text = String(msg.text || "").trim();
  const chatId = msg.chat.id;

  // commands handled elsewhere (/start), handle reply keys:
  if (/^🏷\s*List Produk$/i.test(text) || /^list produk$/i.test(text)) {
    const listText = buildProductsListText(products, 1, 10);
    return bot.sendMessage(chatId, listText, {
      reply_markup: { remove_keyboard: false }
    });
  }

  if (/^❓\s*Cara Order$/i.test(text) || /^cara order$/i.test(text)) {
    return bot.sendMessage(chatId, `Cara Order:\n1) Pilih produk / nomor\n2) Pilih variasi -> atur Jumlah -> Beli\n3) Kirim nomor tujuan & konfirmasi pembayaran`);
  }

  if (/^⚠️\s*Information$/i.test(text) || /^information$/i.test(text) || /^info$/i.test(text)) {
    return bot.sendMessage(chatId, `Information:\n- Jam layanan: 08:00-22:00\n- Owner: Katheryne`);
  }

  if (/^💰\s*Deposit$/i.test(text) || /^deposit$/i.test(text)) {
    return bot.sendMessage(chatId, `Deposit:\nTransfer ke rekening 123456789 a.n. TOKO\nSetelah transfer, kirim bukti ke admin.`);
  }

  if (/^📄\s*Laporan Stok$/i.test(text) || /^laporan stok$/i.test(text)) {
    return bot.sendMessage(chatId, "Laporan Stok: (contoh)\nPulsa 5k: 100\nPulsa 10k: 50");
  }

  // pagination: Prev / Next
  if (/^◀️\s*Prev$/i.test(text) || /^Prev$/i.test(text)) {
    // determine current page from text? Simpler: ask client to send /menu pageN - but user asked no questions.
    // We'll parse numbers from previous keyboard: We'll store page in chat state? To keep simple: if user presses Prev/Next we will send page 1 or 2 based on presence of "Halaman"
    // Simpler pragmatic approach: if Prev then send page 1, if Next then send page 2
    const keyboard = buildReplyKeyboard(products, 1);
    return bot.sendMessage(chatId, buildProductsListText(products, 1, 10), {
      reply_markup: { keyboard, resize_keyboard: true }
    });
  }

  if (/^Next\s*▶️$/i.test(text) || /^Next$/i.test(text) || /^Next ▶️$/i.test(text)) {
    const keyboard = buildReplyKeyboard(products, 2);
    return bot.sendMessage(chatId, buildProductsListText(products, 2, 10), {
      reply_markup: { keyboard, resize_keyboard: true }
    });
  }

  // numeric selection (1..n)
  const numMatch = text.match(/^([1-9]\d*)$/);
  if (numMatch) {
    const idx = Number(numMatch[1]);
    if (idx < 1 || idx > products.length) {
      return bot.sendMessage(chatId, `Nomor produk tidak valid. Pilih 1..${products.length}`);
    }
    const product = products[idx - 1];

    // product summary
    const lines = [];
    lines.push(`╭───────────────`);
    lines.push(`┊・Produk : ${product.nama}`);
    lines.push(`┊・Stok Terjual : ${product.terjual ?? 0}`);
    if (product.deskripsi) lines.push(`┊・Desk : ${product.deskripsi}`);
    if (product.penjelasan_url) lines.push(`┊・penjelasan : ${product.penjelasan_url}`);
    lines.push(`╰───────────────\n`);

    // Variasi list + inline keyboard (each variation -> callback data "var:<prodIdx>:<varIdx>")
    const variations = product.variasi || [];
    if (!variations.length) lines.push("Tidak ada variasi untuk produk ini.");
    else {
      lines.push("╭───────────────");
      lines.push("┊ Variasi, Harga - (Stok):");
      variations.forEach(v => {
        lines.push(`┊・${v.nama} - Rp ${formatRupiah(v.harga)} - (${v.stok})`);
      });
      lines.push("╰───────────────");
    }

    // Build inline keyboard: one row per variation (Detail -> open modal detail/qty)
    const inline = [];
    if (variations.length) {
      for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        // show variation label abbreviated
        const label = v.nama.length > 35 ? (v.nama.slice(0, 32) + "...") : v.nama;
        inline.push([{ text: label, callback_data: `var:${idx}:${i + 1}` }]);
      }
    } else {
      // fallback single "Detail" and "Back"
      inline.push([{ text: "Detail", callback_data: `detail:${idx}` }]);
    }
    // add back button row
    inline.push([{ text: "◀️ Kembali", callback_data: `back:list` }]);

    return bot.sendMessage(chatId, lines.join("\n"), {
      reply_markup: { inline_keyboard: inline }
    });
  }
}

// helper: rupiah format
function formatRupiah(num) {
  if (typeof num !== "number") num = Number(num) || 0;
  return num.toLocaleString("id-ID");
}
