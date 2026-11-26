import { query } from '@/storage/database';

/**
 * The order the lullabies are listed and played in, chosen by dragging them on the Lullabies page and shared by every phone. Kept as file names, so a lullaby the order does not mention yet — a new recording — goes after the ones it does, and one that has since been deleted is simply skipped.
 */

export async function getLullabyOrder(): Promise<string[]> {
  const [row] = (await query('SELECT lullaby_order FROM settings WHERE id = 1')).rows;
  const stored = row?.lullaby_order;
  const parsed = stored === null || stored === undefined ? [] : (JSON.parse(String(stored)) as unknown);

  return Array.isArray(parsed) ? parsed.map(String) : [];
}

export async function saveLullabyOrder(fileNames: string[]) {
  await query('UPDATE settings SET lullaby_order = ? WHERE id = 1', [JSON.stringify(fileNames)]);
}

/**
 * Puts the files in the stored order, keeping the default order for the ones it does not mention.
 */
export function applyLullabyOrder(fileNames: string[], order: string[]): string[] {
  const ordered = order.filter((fileName) => fileNames.includes(fileName));

  return [...ordered, ...fileNames.filter((fileName) => !ordered.includes(fileName))];
}

/**
 * A rename changes the file name, and the lullaby keeps its place under the new one.
 */
export async function renameInLullabyOrder(fileName: string, newFileName: string) {
  const order = await getLullabyOrder();

  if (order.includes(fileName)) {
    await saveLullabyOrder(order.map((candidate) => (candidate === fileName ? newFileName : candidate)));
  }
}
