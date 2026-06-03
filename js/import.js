/**
 * 乗る人の一括入力テキストを解析する
 * 書式: 名前, 場所[, 集合時間]（1行1人）
 * 区切り文字: 半角カンマ(,) または 全角カンマ(、)
 * 集合時間を省略した場合は times[0] を使用する
 *
 * @param {string} text
 * @param {string[]} places - 設定済みの集合場所
 * @param {string[]} times  - 設定済みの集合時間
 * @returns {{ valid: Object[], errors: {line: string, reason: string}[] }}
 */
export function parseBulkRiders(text, places, times) {
  const valid = [];
  const errors = [];

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const parts = line.split(/[,、]/).map(p => p.trim());
    const name  = parts[0] || '';
    const place = parts[1] || '';
    const time  = parts[2] || '';

    if (!name) {
      errors.push({ line, reason: '名前が空です' });
      continue;
    }
    if (!place) {
      errors.push({ line, reason: '場所が指定されていません' });
      continue;
    }
    if (!places.includes(place)) {
      errors.push({ line, reason: `場所「${place}」は設定されていません` });
      continue;
    }
    if (time && !times.includes(time)) {
      errors.push({ line, reason: `時間「${time}」は設定されていません` });
      continue;
    }

    const resolvedTime = time || (times.length > 0 ? times[0] : null);
    if (!resolvedTime) {
      errors.push({ line, reason: '集合時間が設定されていません' });
      continue;
    }

    valid.push({ name, place, time: resolvedTime, priority: false });
  }

  return { valid, errors };
}
