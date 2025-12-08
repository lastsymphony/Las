/**
 * handlerMenu(msg, bot, products)
 *
 * - products: array loaded from products.json
 */
export default async function handlerMenu(msg, bot, products = []) {
  const text = String(msg.text || "").trim();
  const chatId = msg.chat.id;

  // static menus
  if (/^🏷\s*List Produk$/i.test(text) || /^list produk$/i.test(text)) {
    // send short product list
    if (!products.length) {
      return bot.sendMessage(chatId, "Daftar produk kosong.");
    }
    const lines = products.map((p, idx) => `${idx+1}. ${p.name}`);
    return bot.sendMessage(chatId, `Daftar Produk:\n\n${lines.join("\n")}\n\nPilih nomor untuk melihat detail.`, {
      reply_markup: {
        keyboard: undefined // keep existing keyboard
      }
    });
  }

  if (/^❓\s*Cara Order$/i.test(text) || /^cara order$/i.test(text)) {
    return bot.sendMessage(chatId, `Cara Order:\n1. Pilih produk\n2. Kirim nomor tujuan\n3. Lakukan pembayaran\n\nContoh: pilih nomor produk lalu ikuti instruksi.`);
  }

  if (/^⚠️\s*Information$/i.test(text) || /^information$/i.test(text) || /^info$/i.test(text)) {
    return bot.sendMessage(chatId, `Information:\n- Jam layanan 08:00-22:00\n- Owner: Katheryne\n- Support: reply here.`);
  }

  if (/^💰\s*Deposit$/i.test(text) || /^deposit$/i.test(text)) {
    return bot.sendMessage(chatId, `Deposit:\nTransfer ke rekening 123456789 a.n. TOKO\nSetelah transfer, kirim bukti atau hubungi admin.`);
  }

  if (/^📄\s*Laporan Stok$/i.test(text) || /^laporan stok$/i.test(text)) {
    // simple placeholder
    return bot.sendMessage(chatId, "Laporan Stok: (contoh)\nPulsa 5k: 100\nPulsa 10k: 50\nPaket Data 1GB: 25");
  }

  // numeric selection: 1..N
  const numMatch = text.match(/^([1-9]|1[0-9]|2[0-9]|30)$/); // allow up to 30 just in case
  if (numMatch) {
    const num = Number(numMatch[0]);
    if (num < 1 || num > products.length) {
      return bot.sendMessage(chatId, `Nomor produk tidak valid. Pilih 1..${products.length}`);
    }
    const product = products[num - 1];

    // prepare product summary
    const summary = [
      `✅ *${product.name}*`,
      product.description ? `${product.description}` : "",
      product.price ? `Harga: ${product.price}` : "",
      `ID Produk: ${product.id}`,
    ].filter(Boolean).join("\n");

    // inline keyboard
    const inlineKeyboard = [
      [
        { text: "Detail", callback_data: `detail:${num}` },
        { text: "Beli", callback_data: `buy:${num}` }
      ]
    ];

    return bot.sendMessage(chatId, summary, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }

  // fallback: unknown text -> prompt main menu
  if (text.length > 0) {
    return bot.sendMessage(chatId, `Maaf, aku nggak mengerti "${text}". Ketik /menu untuk melihat daftar.`, {
      reply_markup: {
        // re-create keyboard according to current product count
        keyboard: (await import("./keyboard.js")).default(products.length),
        resize_keyboard: true
      }
    });
  }
}
