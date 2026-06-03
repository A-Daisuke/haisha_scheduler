/**
 * 配車スケジュールの計算エンジン
 */

/**
 * 現在の状態に基づいて最適な配車結果を算出する
 * 
 * @param {Object} state - アプリケーションの状態
 * @returns {Object} { placements, unmatchedRiders, standbyDrivers, unmatchedDrivers }
 */
export function calculateSchedule(state) {
  const assignedRiders = new Set();
  const assignedDrivers = new Set();
  const placements = [];

  // 全てのスロット（場所 x 時間）
  const allSlots = [];
  for (const place of state.places) {
    for (const time of state.times) {
      allSlots.push({ place, time });
    }
  }

  // --- STEP 1: スロットの状態初期化 ---
  const slotData = allSlots.map(slot => ({
    slot,
    riders: state.riders.filter(r => r.place === slot.place && r.time === slot.time),
    drivers: [],
    totalSeats: 0
  }));

  // --- STEP 2: 運転手の準備と柔軟性によるソート ---
  const driverMatches = state.drivers.map(d => ({
    driver: d,
    slots: allSlots.filter(s => 
      (d.place === 'どこでも' || d.place === s.place) && 
      (d.time === 'いつでも' || d.time === s.time)
    )
  }));

  // 再計算ごとに結果が変わるよう、まずランダムにシャッフルする
  // これにより、同じ柔軟性・同じ座席数の運転手の中で公平に選出されるようになる
  shuffleArray(driverMatches);

  // 行ける場所が少ない運転手を優先的に処理する
  driverMatches.sort((a, b) => a.slots.length - b.slots.length || b.driver.seats - a.driver.seats);

  // --- STEP 3: 需要（乗客）があるスロットへの優先割り当て ---
  // 既に座席が足りているスロットには追加しない
  for (const dm of driverMatches) {
    const d = dm.driver;
    const bestSlot = dm.slots
      .map(s => slotData.find(sd => sd.slot.place === s.place && sd.slot.time === s.time))
      .filter(sd => sd && sd.riders.length > sd.totalSeats)
      .sort((a, b) => (b.riders.length - b.totalSeats) - (a.riders.length - a.totalSeats))[0];

    if (bestSlot) {
      bestSlot.drivers.push(d);
      bestSlot.totalSeats += d.seats;
      assignedDrivers.add(d.id || d.name);
    }
  }

  // --- STEP 4: 余った運転手の処理（非効率な重複を避ける） ---
  for (const dm of driverMatches) {
    const d = dm.driver;
    if (assignedDrivers.has(d.id || d.name)) continue;

    // 乗客はいるが、まだ車が1台もいないスロットがあれば配置
    const emptySlotWithRiders = dm.slots
      .map(s => slotData.find(sd => sd.slot.place === s.place && sd.slot.time === s.time))
      .filter(sd => sd && sd.riders.length > 0 && sd.drivers.length === 0)
      .sort((a, b) => b.riders.length - a.riders.length)[0];

    if (emptySlotWithRiders) {
      emptySlotWithRiders.drivers.push(d);
      emptySlotWithRiders.totalSeats += d.seats;
      assignedDrivers.add(d.id || d.name);
    }
    // 既に誰かが乗っているスロットで座席も足りている場合は、無理に追加せず「待機」とする
  }

  // --- STEP 5: 各スロットでの乗客の振り分け ---
  for (const sd of slotData) {
    if (sd.drivers.length === 0 && sd.riders.length === 0) continue;

    const priorityRiders = sd.riders.filter(r => r.priority);
    const normalRiders = sd.riders.filter(r => !r.priority);
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
        overflow.push(r);
      }
    }

    placements.push({
      slot: sd.slot,
      drivers: sd.drivers,
      riders: riding,
      overflow: overflow
    });
  }

  placements.sort((a, b) => {
    const placeIdxA = state.places.indexOf(a.slot.place);
    const placeIdxB = state.places.indexOf(b.slot.place);
    if (placeIdxA !== placeIdxB) return placeIdxA - placeIdxB;
    return state.times.indexOf(a.slot.time) - state.times.indexOf(b.slot.time);
  });

  // 未配置の運転手を「条件不一致」と「余剰（待機）」に分ける
  const unassigned = state.drivers.filter(d => !assignedDrivers.has(d.id || d.name));
  const unmatchedDrivers = [];
  const standbyDrivers = [];

  for (const d of unassigned) {
    const hasPossibleSlot = allSlots.some(s => 
      (d.place === 'どこでも' || d.place === s.place) && 
      (d.time === 'いつでも' || d.time === s.time)
    );
    if (hasPossibleSlot) {
      standbyDrivers.push(d);
    } else {
      unmatchedDrivers.push(d);
    }
  }

  // 運転手ありスロットの overflow は overflow バーに表示されるため unmatchedRiders から除外する
  // (driverless スロットの overflow は unmatched として唯一の draggable 手段なので残す)
  const driverSlotOverflowKeys = new Set();
  placements.forEach(p => {
    if (p.drivers.length > 0) {
      p.overflow.forEach(r => driverSlotOverflowKeys.add(r.id || r.name));
    }
  });

  return {
    placements,
    unmatchedRiders: state.riders.filter(r => {
      const key = r.id || r.name;
      return !assignedRiders.has(key) && !driverSlotOverflowKeys.has(key);
    }),
    unmatchedDrivers,
    standbyDrivers
  };
}

/**
 * 配車結果からドラッグ可能なアイテムのリストを返す
 * UIの data-src-* 属性と 1:1 で対応する
 * @returns {{ srcType: 'rider'|'overflow'|'unmatched', srcPlacement: number, riderIndex: number, rider: Object }[]}
 */
export function getDraggableItems(result) {
  const items = [];
  result.placements.forEach((p, pIdx) => {
    if (p.drivers.length === 0) return; // 運転手なしスロットは overflow バーも表示されない
    p.riders.forEach((r, rIdx) => {
      items.push({ srcType: 'rider',    srcPlacement: pIdx, riderIndex: rIdx, rider: r });
    });
    p.overflow.forEach((r, rIdx) => {
      items.push({ srcType: 'overflow', srcPlacement: pIdx, riderIndex: rIdx, rider: r });
    });
  });
  result.unmatchedRiders.forEach((r, rIdx) => {
    items.push({ srcType: 'unmatched', srcPlacement: -1, riderIndex: rIdx, rider: r });
  });
  return items;
}

/**
 * 配車結果から有効なドロップゾーン（運転手がいるスロット）のリストを返す
 * @returns {{ destPlacement: number, slot: Object }[]}
 */
export function getDropZones(result) {
  return result.placements.flatMap((p, pIdx) =>
    p.drivers.length > 0 ? [{ destPlacement: pIdx, slot: p.slot }] : []
  );
}

/**
 * 乗客の割り当てを座席数に合わせて再整理する（内部用）
 * - riders が座席数を超えていれば末尾を overflow へ
 * - riders に空きがあり overflow がいれば overflow から先頭を riders へ昇格
 */
function rebalancePlacement(placement) {
  const totalSeats = placement.drivers.reduce((s, d) => s + d.seats, 0);
  const all = [...placement.riders, ...placement.overflow];
  placement.riders   = all.slice(0, totalSeats);
  placement.overflow = all.slice(totalSeats);
}

/**
 * 計算結果内で乗客を別のスロットへ手動移動する
 * 移動後、移動元・移動先の両スロットで座席数に応じた再整理を行う
 * @param {Object} result - calculateSchedule の戻り値（直接変更される）
 * @param {{ type: 'rider'|'overflow'|'unmatched', placementIndex: number, riderIndex: number }} source
 * @param {number} destPlacementIndex
 */
export function moveRider(result, source, destPlacementIndex) {
  const { placements, unmatchedRiders } = result;

  // 同じスロットの riders 間は移動しても意味がない
  if (source.type === 'rider' && source.placementIndex === destPlacementIndex) return result;

  let rider;
  if (source.type === 'unmatched') {
    rider = unmatchedRiders.splice(source.riderIndex, 1)[0];
  } else if (source.type === 'rider') {
    rider = placements[source.placementIndex].riders.splice(source.riderIndex, 1)[0];
  } else if (source.type === 'overflow') {
    rider = placements[source.placementIndex].overflow.splice(source.riderIndex, 1)[0];
  }

  if (rider !== undefined) {
    placements[destPlacementIndex].riders.push(rider);
  }

  // 移動元を再整理（riders が減った場合、overflow から補充される）
  if (source.type !== 'unmatched' && source.placementIndex !== destPlacementIndex) {
    rebalancePlacement(placements[source.placementIndex]);
  }
  // 移動先を再整理（座席超過の場合、末尾が overflow へ）
  rebalancePlacement(placements[destPlacementIndex]);

  return result;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * テキスト形式の出力
 */
export function formatResultAsText(result) {
  if (!result) return '';
  const { placements, unmatchedRiders, unmatchedDrivers, standbyDrivers } = result;
  let lines = [];

  for (const p of placements) {
    lines.push(`■ ${p.slot.place} / ${p.slot.time}`);
    
    if (p.drivers.length > 0) {
      for (const d of p.drivers) {
        lines.push(`  [車] ${d.name}（${d.seats}名まで）`);
      }
    } else {
      lines.push('  [車] なし');
    }

    const riderList = p.riders.length 
      ? p.riders.map(r => r.name + (r.priority ? '' : '')).join('、')
      : 'なし';
    lines.push(`  乗る人：${riderList}`);

    if (p.overflow.length > 0) {
      lines.push(`  ※溢れ：${p.overflow.map(r => r.name).join('、')}`);
    }
    lines.push('');
  }

  if (unmatchedRiders.length > 0) {
    lines.push('■ 未配車（条件不一致の乗る人）');
    lines.push(unmatchedRiders.map(r => `  ${r.name}（${r.place}・${r.time}）`).join('\n'));
    lines.push('');
  }

  if (standbyDrivers.length > 0) {
    lines.push('■ 空きの運転手');
    lines.push(standbyDrivers.map(d => `  ${d.name}（${d.place}・${d.time}）`).join('\n'));
    lines.push('');
  }

  if (unmatchedDrivers.length > 0) {
    lines.push('■ 未配置（条件不一致の運転者）');
    lines.push(unmatchedDrivers.map(d => `  ${d.name}（${d.place}・${d.time}）`).join('\n'));
  }

  return lines.join('\n');
}
