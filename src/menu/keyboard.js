import fs from "fs/promises";
import path from "path";

/**
 * Load products file and return array of products.
 * products.json should be array of objects:
 * [
 *  { "id": 1, "name": "Genshin Pack", "description": "...", "items": ["Welkin", "Primogem"] },
 *  ...
 * ]
 */
export async function loadProducts(dataPath) {
  try {
    const txt = await fs.readFile(dataPath, "utf-8");
    const arr = JSON.parse(txt);
    // ensure id sequence and length reflect array order
    return arr.map((p, i) => ({ id: p.id ?? i+1, ...p }));
  } catch (err) {
    console.error("loadProducts error:", err);
    return [];
  }
}

/**
 * Build reply keyboard (array of rows). staticButtons remain on first row.
 * numbersCount: total products count -> create numeric buttons 1..numbersCount.
 */
export default function buildKeyboard(numbersCount = 6) {
  const staticRow = ["🏷 List Produk", "❓ Cara Order", "⚠️ Information"];
  // create numeric buttons as string labels
  const nums = [];
  for (let i = 1; i <= Math.max(0, numbersCount); i++) nums.push(String(i));

  // chunk numeric buttons into rows of up to 6
  const chunkSize = 6;
  const numRows = [];
  for (let i = 0; i < nums.length; i += chunkSize) {
    numRows.push(nums.slice(i, i + chunkSize));
  }

  // last row: deposit and maybe filler
  const lastRow = ["💰 Deposit", "📄 Laporan Stok"];

  return [staticRow, ...numRows, lastRow];
}
