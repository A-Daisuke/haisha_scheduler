/**
 * 配車スケジュールの計算エンジン
 */

/**
 * 現在の状態に基づいて最適な配車結果を算出する
 * 
 * 【アルゴリズムの概要】
 * 1. 各運転手の「行ける場所の数（柔軟性）」を計算し、希少なリソース（限定的な運転手）を優先する
 * 2. 需要（乗客）がある場所に対し、最適な運転手を順次割り当てる
 * 3. 余った運転手を空車として配置する
 * 4. 確定した座席数に基づき、乗客を優先度順に振り分ける
 * 
 * @param {Object} state - アプリケーションの状態（場所、時間、運転手、乗客）
 * @returns {Object} { placements: 配車結果リスト, unmatched: 条件不一致の乗客 }
 */
export function calculateSchedule(state) {
  const assignedRiders = new Set();  // 割り当て済みの乗客ID/名前
  const assignedDrivers = new Set(); // 割り当て済みの運転手ID/名前
  const placements = [];             // 最終的な配車結果（スロット単位）

  // 全ての「場所 × 時間」の組み合わせ（スロット）を作成
  const allSlots = [];
  for (const place of state.places) {
    for (const time of state.times) {
      allSlots.push({ place, time });
    }
  }

  // --- STEP 1: 各スロットの状態を初期化 ---
  const slotData = allSlots.map(slot => ({
    slot,
    riders: state.riders.filter(r => r.place === slot.place && r.time === slot.time),
    drivers: [],
    totalSeats: 0
  }));

  // --- STEP 2: 運転手の準備と「柔軟性」によるソート ---
  // 行ける場所が少ない運転手ほど、先に割り当てないと「どこにも行けない」状態になるため
  const driverMatches = state.drivers.map(d => ({
    driver: d,
    slots: allSlots.filter(s => 
      (d.place === 'どこでも' || d.place === s.place) && 
      (d.time === 'いつでも' || d.time === s.time)
    )
  }));

  driverMatches.sort((a, b) => {
    // 1. 行けるスロットの数が少ない順（希少性）
    if (a.slots.length !== b.slots.length) {
      return a.slots.length - b.slots.length;
    }
    // 2. 同じ柔軟性なら、一度に多く運べる人を優先
    return b.driver.seats - a.driver.seats;
  });

  // --- STEP 3: 需要（乗客）があるスロットへの運転手割り当て ---
  for (const dm of driverMatches) {
    const d = dm.driver;
    
    // その運転手が行けるスロットの中で、最も「座席が不足している」スロットを探す
    const bestSlot = dm.slots
      .map(s => slotData.find(sd => sd.slot.place === s.place && sd.slot.time === s.time))
      .filter(sd => sd && sd.riders.length > sd.totalSeats) // 乗客 > 現在の座席数
      .sort((a, b) => (b.riders.length - b.totalSeats) - (a.riders.length - a.totalSeats))[0];

    if (bestSlot) {
      bestSlot.drivers.push(d);
      bestSlot.totalSeats += d.seats;
      assignedDrivers.add(d.id || d.name);
    }
  }

  // --- STEP 4: 余った運転手の配置（空車として表示するため） ---
  for (const dm of driverMatches) {
    const d = dm.driver;
    if (assignedDrivers.has(d.id || d.name)) continue;

    // 自分の希望に合う最初のスロットに配置
    const targetSlot = dm.slots[0] || allSlots[0];
    const sd = slotData.find(sd => sd && sd.slot.place === targetSlot.place && sd.slot.time === targetSlot.time);
    if (sd) {
      sd.drivers.push(d);
      sd.totalSeats += d.seats;
      assignedDrivers.add(d.id || d.name);
    }
  }

  // --- STEP 5: 各スロットでの乗客の振り分け（優先度を考慮） ---
  for (const sd of slotData) {
    // 運転手も乗客もいないスロットは表示しない
    if (sd.drivers.length === 0 && sd.riders.length === 0) continue;

    // 乗客を振り分ける（優先フラグあり -> なしの順）
    const priorityRiders = sd.riders.filter(r => r.priority);
    const normalRiders = sd.riders.filter(r => !r.priority);
    
    // 同一優先度内での公平性のためにランダムシャッフル
    shuffleArray(priorityRiders);
    shuffleArray(normalRiders);

    const orderedRiders = [...priorityRiders, ...normalRiders];
    const riding = [];
    const overflow = [];

    for (const r of orderedRiders) {
      if (riding.length < sd.totalSeats) {
        riding.push(r);
        assignedRiders.add(r.id || r.name);
      } else {
        overflow.push(r); // 座席不足で乗り切れない
      }
    }

    placements.push({
      slot: sd.slot,
      drivers: sd.drivers,
      riders: riding,
      overflow: overflow
    });
  }

  // 表示順を整理（場所・時間の定義順に並べる）
  placements.sort((a, b) => {
    const placeIdxA = state.places.indexOf(a.slot.place);
    const placeIdxB = state.places.indexOf(b.slot.place);
    if (placeIdxA !== placeIdxB) return placeIdxA - placeIdxB;
    return state.times.indexOf(a.slot.time) - state.times.indexOf(b.slot.time);
  });

  return {
    placements,
    // 入力データに不備があり、どのスロットにも該当しなかった乗客
    unmatched: state.riders.filter(r => !assignedRiders.has(r.id || r.name))
  };
}

/**
 * 配列をランダムにシャッフルする（Fisher-Yatesアルゴリズム）
 * 元の配列を直接変更します。
 * @param {Array} array 
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * 配車結果をテキスト形式に変換する（クリップボードコピー用）
 * @param {Object} result - calculateSchedule の戻り値
 * @returns {string} 
 */
export function formatResultAsText(result) {
  if (!result) return '';

  const { placements, unmatched } = result;
  let lines = ['【配車結果】', ''];

  for (const p of placements) {
    if (p.drivers.length === 0 && p.riders.length === 0) continue;
    
    lines.push(`■ ${p.slot.place} / ${p.slot.time}`);
    
    if (p.drivers.length > 0) {
      for (const d of p.drivers) {
        lines.push(`  [車] ${d.name}（${d.seats}人乗り）`);
      }
    } else {
      lines.push('  [車] なし');
    }

    const riderList = p.riders.length 
      ? p.riders.map(r => r.name + (r.priority ? '（優先）' : '')).join('、')
      : 'なし';
    lines.push(`  乗客：${riderList}`);

    if (p.overflow.length > 0) {
      lines.push(`  ※溢れ：${p.overflow.map(r => r.name).join('、')}`);
    }
    lines.push('');
  }

  // 条件に合わなかった人（設定ミスなど）の表示
  if (unmatched.length > 0) {
    lines.push('■ 未配車（条件不一致）');
    lines.push(unmatched.map(r => `  ${r.name}（${r.place}・${r.time}）`).join('\n'));
  }

  return lines.join('\n');
}
