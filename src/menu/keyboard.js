import fs from "fs/promises";
import dayjs from "dayjs";

/**
 * loadProducts(path) => array
 */
export async function loadProducts(dataPath) {
  try {
    const txt = await fs.readFile(dataPath, "utf-8");
    const arr = JSON.parse(txt);
    return arr.map((p, i) => ({ id: p.id ?? i+1, ...p }));
  } catch (err) {
    console.error("loadProducts error:", err);
    return [];
  }
}

/**
 * buildReplyKeyboard(products, page = 1, pageSize = 10)
 * - static row always present
 * - numeric rows created from products of current page
 * - last row contains Prev / Next and Deposit
 */
export default function buildReplyKeyboard(products = [], page = 1, pageSize = 10) {
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(Math.max(1, page), totalPages);

  const start = (page - 1) * pageSize;
  const pageItems = products.slice(start, start + pageSize);

  // static top row
  const staticRow = ["🏷 List Produk", "❓ Cara Order", "⚠️ Information"];

  // format numeric buttons chunked by 5 per row
  const nums = pageItems.map((p, idx) => String(start + idx + 1));
  const chunkSize = 5;
  const numRows = [];
  for (let i = 0; i < nums.length; i += chunkSize) {
    numRows.push(nums.slice(i, i + chunkSize));
  }

  const navRow = [];
  if (page > 1) navRow.push("◀️ Prev");
  navRow.push(`📄 Halaman ${page} / ${totalPages}`);
  if (page < totalPages) navRow.push("Next ▶️");

  const lastRow = ["💰 Deposit", "📄 Laporan Stok"];

  return [staticRow, ...numRows, navRow, lastRow];
}

/**
 * helper to format a text list of products (for List Produk)
 */
export function buildProductsListText(products = [], page = 1, pageSize = 10) {
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(Math.max(1, page), totalPages);

  const start = (page - 1) * pageSize;
  const pageItems = products.slice(start, start + pageSize);

  const lines = pageItems.map((p, idx) => {
    const no = start + idx + 1;
    const sold = p.terjual ?? 0;
    return `[${no}]. ${p.nama} ( ${sold} )`;
  });

  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const header = `Daftar Produk\n\n${lines.join("\n")}\n\n📄 Halaman ${page} / ${totalPages}\n📆 ${now}\n`;
  return header;
}
