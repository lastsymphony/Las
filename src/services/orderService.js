import dayjs from "dayjs";

// in-memory sessions: key = chatId, value = { prodIndex, varIndex, qty }
const sessions = new Map();

/**
 * handleCallback(callbackQuery, bot, products)
 */
export async function handleCallback(callbackQuery, bot, products = []) {
  const { id: queryId, data, message, from } = callbackQuery;
  const chatId = message ? message.chat.id : from.id;
  // patterns:
  // var:<prodIdx>:<varIdx>
  // qty:<prodIdx>:<varIdx>:<op>  (op = plus | minus | refresh)
  // buy:<prodIdx>:<varIdx>:<qty>
  // back:...
  try {
    if (!data) return bot.answerCallbackQuery(queryId, { text: "No data" });

    // var selection -> open variation detail + qty UI
    if (data.startsWith("var:")) {
      const [, prodStr, varStr] = data.split(":");
      const pIdx = Number(prodStr);
      const vIdx = Number(varStr);
      const product = products[pIdx - 1];
      if (!product) return bot.answerCallbackQuery(queryId, { text: "Produk tidak ditemukan." });
      const variation = (product.variasi || [])[vIdx - 1];
      if (!variation) return bot.answerCallbackQuery(queryId, { text: "Variasi tidak ditemukan." });

      // default qty 1
      const qty = 1;
      // save session
      sessions.set(chatId, { prodIndex: pIdx, varIndex: vIdx, qty });

      const text = buildVariationDetailText(product, variation, qty);
      const inline = buildQtyInline(pIdx, vIdx, qty);

      // answer callback and edit message (or send new)
      await bot.answerCallbackQuery(queryId);
      // Try editMessageText if possible, else send new message
      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: inline }
        });
      } catch (err) {
        // fallback send new message
        await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: inline }});
      }
      return;
    }

    // qty operations: plus/minus/refresh
    if (data.startsWith("qty:")) {
      // format qty:<prodIdx>:<varIdx>:<op> where op=plus|minus|refresh
      const [, prodStr, varStr, op] = data.split(":");
      const pIdx = Number(prodStr);
      const vIdx = Number(varStr);
      const product = products[pIdx - 1];
      const variation = (product?.variasi || [])[vIdx - 1];
      if (!product || !variation) return bot.answerCallbackQuery(queryId, { text: "Data tidak valid." });

      const key = chatId;
      const sess = sessions.get(key) || { prodIndex: pIdx, varIndex: vIdx, qty: 1 };
      // ensure session refers to same prod/var
      if (sess.prodIndex !== pIdx || sess.varIndex !== vIdx) {
        sess.prodIndex = pIdx; sess.varIndex = vIdx; sess.qty = 1;
      }

      if (op === "plus") {
        if (sess.qty < variation.stok) sess.qty++;
      } else if (op === "minus") {
        if (sess.qty > 1) sess.qty--;
      } else if (op === "refresh") {
        // nothing special
      }

      sessions.set(key, sess);
      const text = buildVariationDetailText(product, variation, sess.qty);
      const inline = buildQtyInline(pIdx, vIdx, sess.qty);

      await bot.answerCallbackQuery(queryId);
      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: inline }
        });
      } catch (err) {
        await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: inline }});
      }
      return;
    }

    // buy action: buy:<prodIdx>:<varIdx>
    if (data.startsWith("buy:")) {
      const [, prodStr, varStr] = data.split(":");
      const pIdx = Number(prodStr);
      const vIdx = Number(varStr);
      const product = products[pIdx - 1];
      const variation = (product?.variasi || [])[vIdx - 1];
      if (!product || !variation) return bot.answerCallbackQuery(queryId, { text: "Data tidak valid." });

      // get qty from session or default 1
      const sess = sessions.get(chatId) || { qty: 1 };
      const qty = sess.qty || 1;

      // prepare order summary
      const total = (variation.harga || 0) * qty;
      const orderText = [
        "tambahkan jumlah pembelian:",
        "╭───────────────",
        `┊・Produk : ${product.nama}`,
        `┊・Variasi : ${variation.nama}`,
        `┊・Kode : ${variation.kode}`,
        `┊・Sisa Produk : ${variation.stok}`,
        product.deskripsi ? `┊・Desk : ${product.deskripsi}` : "",
        `╰───────────────`,
        "╭───────────────",
        `┊・Jumlah : ${qty}`,
        `┊・Harga : Rp ${formatRupiah(variation.harga)}`,
        `┊・Total Harga : Rp ${formatRupiah(total)}`,
        "╰───────────────",
        `\nCurrent Date: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`
      ].filter(Boolean).join("\n");

      // ask for confirmation or phone number: we'll provide final inline confirm
      const inline = [
        [{ text: "✅ Konfirmasi & Kirim Nomor", callback_data: `confirm:${pIdx}:${vIdx}` }],
        [{ text: "◀️ Kembali", callback_data: `back:var:${pIdx}` }]
      ];

      await bot.answerCallbackQuery(queryId);
      await bot.sendMessage(chatId, orderText, { reply_markup: { inline_keyboard: inline }});
      return;
    }

    // confirm action: confirm:<prodIdx>:<varIdx> -> instruct to send nomor tujuan
    if (data.startsWith("confirm:")) {
      const [, prodStr, varStr] = data.split(":");
      const pIdx = Number(prodStr);
      const vIdx = Number(varStr);
      const product = products[pIdx - 1];
      const variation = (product?.variasi || [])[vIdx - 1];
      const sess = sessions.get(chatId) || { qty: 1 };
      const qty = sess.qty || 1;
      await bot.answerCallbackQuery(queryId);
      await bot.sendMessage(chatId, `Kamu akan membeli:\n- ${product.nama}\n- ${variation.nama}\nJumlah: ${qty}\n\nKirim nomor tujuan sekarang (contoh: 0812xxxxxxxx).`);
      // keep session so next text message can be treated as nomor tujuan
      return;
    }

    // back actions
    if (data.startsWith("back:")) {
      // back:list or back:var:<prodIdx>
      const parts = data.split(":");
      if (parts[1] === "list") {
        // send main menu again (client will request /menu normally) -> just answer
        await bot.answerCallbackQuery(queryId);
        await bot.sendMessage(chatId, "Kembali ke daftar produk. Ketik /menu atau tekan List Produk.");
        return;
      }
      if (parts[1] === "var") {
        // back to product variations: parts[2] = prodIdx
        const pIdx = Number(parts[2]);
        const product = products[pIdx - 1];
        if (!product) return bot.answerCallbackQuery(queryId, { text: "Produk tidak ditemukan." });
        const variations = product.variasi || [];
        const inline = variations.map((v, i) => [{ text: v.nama.length > 30 ? v.nama.slice(0,27)+"..." : v.nama, callback_data: `var:${pIdx}:${i+1}` }]);
        inline.push([{ text: "◀️ Kembali", callback_data: "back:list" }]);
        const text = `Pilih variasi untuk *${product.nama}*`;
        await bot.answerCallbackQuery(queryId);
        try {
          await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inline }
          });
        } catch (err) {
          await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: inline }});
        }
        return;
      }
    }

    // unknown
    return bot.answerCallbackQuery(queryId, { text: "Action tidak dikenali." });
  } catch (err) {
    console.error("handleCallback exception:", err);
    try { await bot.answerCallbackQuery(queryId, { text: "Terjadi error saat memproses." }); } catch(e){}
  }
}

// build variation detail text
function buildVariationDetailText(product, variation, qty) {
  const total = (variation.harga || 0) * qty;
  const lines = [];
  lines.push("tambahkan jumlah pembelian:");
  lines.push("╭───────────────");
  lines.push(`┊・Produk : ${product.nama}`);
  lines.push(`┊・Variasi : ${variation.nama}`);
  lines.push(`┊・Kode : ${variation.kode}`);
  lines.push(`┊・Sisa Produk : ${variation.stok}`);
  if (product.deskripsi) lines.push(`┊・Desk : ${product.deskripsi}`);
  lines.push("╰───────────────");
  lines.push("╭───────────────");
  lines.push(`┊・Jumlah : ${qty}`);
  lines.push(`┊・Harga : Rp ${formatRupiah(variation.harga)}`);
  lines.push(`┊・Total Harga : Rp ${formatRupiah(total)}`);
  lines.push("╰───────────────");
  lines.push(`\nCurrent Date: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}`);
  return lines.join("\n");
}

// build inline keyboard for qty control
function buildQtyInline(pIdx, vIdx, qty) {
  return [
    [
      { text: "➖", callback_data: `qty:${pIdx}:${vIdx}:minus` },
      { text: `Jumlah: ${qty}`, callback_data: `qty:${pIdx}:${vIdx}:refresh` },
      { text: "➕", callback_data: `qty:${pIdx}:${vIdx}:plus` }
    ],
    [
      { text: "🔄 Refresh", callback_data: `qty:${pIdx}:${vIdx}:refresh` },
      { text: "🛒 Beli", callback_data: `buy:${pIdx}:${vIdx}` }
    ],
    [
      { text: "◀️ Kembali", callback_data: `back:var:${pIdx}` }
    ]
  ];
}

function formatRupiah(num) {
  if (typeof num !== "number") num = Number(num) || 0;
  return num.toLocaleString("id-ID");
}
