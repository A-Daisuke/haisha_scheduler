import { calculateSchedule, formatResultAsText, moveRider, getDraggableItems, getDropZones } from './js/scheduler.js';
import { parseBulkRiders } from './js/import.js';

/**
 * 簡易テストランナー
 */
function assert(name, condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
  } else {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${message}`);
    process.exit(1);
  }
}

const suite = {
  // 1. 基本的な割り当て
  testBasic() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const res = calculateSchedule(state);
    assert('Basic', res.placements[0].riders.length === 1, '乗客が割り当てられていません');
  },

  // 2. 柔軟な運転手の配置
  testFlexibleDriver() {
    const state = {
      places: ['教会', '駅'], times: ['10:00'],
      drivers: [{ name: 'D_Any', place: 'どこでも', time: 'いつでも', seats: 2 }],
      riders: [{ name: 'R_Station', place: '駅', time: '10:00', priority: false }]
    };
    const res = calculateSchedule(state);
    const stationSlot = res.placements.find(p => p.slot.place === '駅');
    assert('Flexible Driver',       stationSlot && stationSlot.drivers.length === 1, 'どこでもOKな運転手が駅に割り当てられていません');
    assert('Flexible Driver Rider', stationSlot && stationSlot.riders.length === 1,  '駅の乗客が拾われていません');
  },

  // 3. 優先順位の確認
  testPriority() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 1 }],
      riders: [
        { name: 'Normal', place: '駅', time: '10:00', priority: false },
        { name: 'VIP',    place: '駅', time: '10:00', priority: true }
      ]
    };
    const res = calculateSchedule(state);
    assert('Priority',          res.placements[0].riders[0].name === 'VIP',    '優先乗客が先に割り当てられていません');
    assert('Priority Overflow', res.placements[0].overflow[0].name === 'Normal', '一般乗客が溢れに回っていません');
  },

  // 4. 特定場所指定の運転手優先
  testSpecificDriverFirst() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D_StationOnly', place: '駅',      time: '10:00',  seats: 2 },
        { name: 'D_Any',         place: 'どこでも', time: 'いつでも', seats: 2 }
      ],
      riders: [
        { name: 'R_Station', place: '駅',  time: '10:00', priority: false },
        { name: 'R_Park',    place: '公園', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const parkSlot    = res.placements.find(p => p.slot.place === '公園');
    const stationSlot = res.placements.find(p => p.slot.place === '駅');
    assert('Specific First (Park)',    parkSlot.drivers[0].name    === 'D_Any',         '公園にどこでもOKな運転手が割り当てられていません');
    assert('Specific First (Station)', stationSlot.drivers[0].name === 'D_StationOnly', '駅に専用の運転手が割り当てられていません');
  },

  // 5. 乗客がいない場合、運転手は待機（standby）になる
  testNoRiders() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: []
    };
    const res = calculateSchedule(state);
    assert('No Riders - No Placements', res.placements.length === 0,        '乗客がいなければプレースメントは作られない');
    assert('No Riders - Standby',       res.standbyDrivers.length === 1,    '乗客がいない運転者は待機になるべき');
  },

  // 6. 複数スロットの混在
  testMultipleSlots() {
    const state = {
      places: ['駅', '公園'], times: ['9:00', '10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '9:00',  seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '9:00',  priority: false },
        { name: 'R2', place: '公園', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    assert('Multiple Slots', res.placements.length === 2, '2つのスロットが作成されるべき');
  },

  // 7. 運転者が全くいない場合
  testNoDrivers() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const res = calculateSchedule(state);
    assert('No Drivers',          res.placements.length === 1 && res.placements[0].drivers.length === 0, '運転者なしでプレースメントが作成されるべき');
    assert('No Drivers Overflow', res.placements[0].overflow.length === 1,                               '運転者がいないので全員溢れるべき');
  },

  // 8. 座席数不足の最大活用
  testCapacityLimit() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false },
        { name: 'R3', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    assert('Capacity Limit Riding',   res.placements[0].riders.length === 2,  '2人だけ乗るべき');
    assert('Capacity Limit Overflow', res.placements[0].overflow.length === 1, '1人溢れるべき');
  },

  // 9. 複雑な柔軟性
  testComplexFlexibility() {
    const state = {
      places: ['A', 'B', 'C'], times: ['10:00'],
      drivers: [
        { name: 'D_AB',     place: 'どこでも', time: 'いつでも', seats: 2 },
        { name: 'D_A_Only', place: 'A',       time: '10:00',   seats: 2 }
      ],
      riders: [
        { name: 'R_A', place: 'A', time: '10:00', priority: false },
        { name: 'R_B', place: 'B', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const slotA = res.placements.find(p => p.slot.place === 'A');
    const slotB = res.placements.find(p => p.slot.place === 'B');
    assert('Complex Flex A', slotA.drivers[0].name === 'D_A_Only', 'AにはA限定の運転手が優先されるべき');
    assert('Complex Flex B', slotB.drivers[0].name === 'D_AB',     'Bには柔軟な運転手が回るべき');
  },

  // 10. 条件不一致の乗客は unmatchedRiders に入る
  testUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [{ name: 'R1', place: '宇宙', time: '00:00', priority: false }]
    };
    const res = calculateSchedule(state);
    assert('Unmatched Rider', res.unmatchedRiders.length === 1, '条件に合わない乗客はunmatchedRidersに入るべき');
  },

  // 11. テキスト出力フォーマットの確認
  testFormatText() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const result = calculateSchedule(state);
    const text = formatResultAsText(result);
    assert('FormatText Slot Header', text.includes('■ 駅 / 10:00'), 'スロットヘッダーが含まれるべき');
    assert('FormatText Driver',      text.includes('[車] D1'),       '運転者が含まれるべき');
    assert('FormatText Rider',       text.includes('R1'),            '乗客名が含まれるべき');
  },

  // 12. 座席がちょうど埋まる場合、溢れはゼロ
  testExactCapacity() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    assert('Exact Capacity Riding',      res.placements[0].riders.length === 2,  '全員乗れるべき');
    assert('Exact Capacity No Overflow', res.placements[0].overflow.length === 0, '溢れはないべき');
  },

  // 13. 余った運転者は standbyDrivers に入る
  testStandbyDriver() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',      time: '10:00',   seats: 3 },
        { name: 'D2', place: 'どこでも', time: 'いつでも', seats: 3 }
      ],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const res = calculateSchedule(state);
    assert('Standby Driver', res.standbyDrivers.length === 1, '余った運転手は待機になるべき');
  },

  // 14. moveRider: riders → 別スロット（両スロットに乗客がいる状態で検証）
  testMoveRiderToOtherSlot() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    assert('MoveRider Initial', result.placements[stIdx].riders.length === 2, '初期: 2人が駅に配置');
    moveRider(result, { type: 'rider', placementIndex: stIdx, riderIndex: 0 }, pkIdx);
    assert('MoveRider Source', result.placements[stIdx].riders.length === 1, '移動後: 駅は1人');
    assert('MoveRider Dest',   result.placements[pkIdx].riders.length === 2, '移動後: 公園は2人');
  },

  // 15. moveRider: overflow → 別スロットの riders
  testMoveRiderFromOverflow() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    assert('MoveFromOverflow Initial', result.placements[stIdx].overflow.length === 1, '初期: 1人が溢れ');
    moveRider(result, { type: 'overflow', placementIndex: stIdx, riderIndex: 0 }, pkIdx);
    assert('MoveFromOverflow Source', result.placements[stIdx].overflow.length === 0, '移動後: 溢れゼロ');
    assert('MoveFromOverflow Dest',   result.placements[pkIdx].riders.length === 2,   '移動後: 公園は2人に');
  },

  // 16. moveRider: unmatchedRiders → スロットの riders
  testMoveRiderFromUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'R_Match',     place: '駅',  time: '10:00', priority: false },
        { name: 'R_Unmatched', place: '宇宙', time: '00:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    assert('MoveFromUnmatched Initial',    result.unmatchedRiders.length === 1,       '初期: 1人が未配車');
    assert('MoveFromUnmatched Placements', result.placements.length === 1,            'プレースメントが1つあるべき');
    moveRider(result, { type: 'unmatched', riderIndex: 0 }, 0);
    assert('MoveFromUnmatched Source', result.unmatchedRiders.length === 0,           '移動後: 未配車ゼロ');
    assert('MoveFromUnmatched Dest',   result.placements[0].riders.length === 2,      '移動後: 2人に増える');
  },

  // 17. moveRider + rebalance: riders が減ったとき overflow が自動補充される（backfill）
  testMoveRiderBackfill() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false },
        { name: 'R3', place: '駅', time: '10:00', priority: false }, // 溢れる
        { name: 'R4', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    assert('Backfill Initial Riders',   result.placements[stIdx].riders.length === 2,  '初期: 駅に2人が乗車');
    assert('Backfill Initial Overflow', result.placements[stIdx].overflow.length === 1, '初期: 駅に1人が溢れ');

    // R1 を公園へ移動 → 駅の空席に R3 が自動補充されるはず
    moveRider(result, { type: 'rider', placementIndex: stIdx, riderIndex: 0 }, pkIdx);

    assert('Backfill After Riders',   result.placements[stIdx].riders.length === 2,  '移動後: 駅はまだ2人乗車（R3が補充）');
    assert('Backfill After Overflow', result.placements[stIdx].overflow.length === 0, '移動後: 駅の溢れはゼロ');
    assert('Backfill Dest',           result.placements[pkIdx].riders.length === 2,  '移動後: 公園は2人');
  },

  // 18. moveRider + rebalance: 満席の車に追加すると追加した人が overflow へ
  testMoveRiderOverCapacity() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false }, // 駅は満席
        { name: 'R3', place: '公園', time: '10:00', priority: false },
        { name: 'R4', place: '公園', time: '10:00', priority: false },
        { name: 'R5', place: '公園', time: '10:00', priority: false }  // 公園の溢れ
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    assert('OverCap Initial Riders',   result.placements[stIdx].riders.length === 2,  '初期: 駅は満席（2人）');
    assert('OverCap Initial Overflow', result.placements[stIdx].overflow.length === 0, '初期: 駅の溢れはゼロ');

    // R5（公園の溢れ）を満席の駅へドラッグ
    moveRider(result, { type: 'overflow', placementIndex: pkIdx, riderIndex: 0 }, stIdx);

    assert('OverCap Dest Riders',   result.placements[stIdx].riders.length === 2,  '移動後: 駅の乗車は2人のまま（満席）');
    assert('OverCap Dest Overflow', result.placements[stIdx].overflow.length === 1, '移動後: 追加した人が駅の溢れへ');
  },

  // 19. moveRider: 同スロット内の riders は no-op
  testMoveRiderSameSlot() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    moveRider(result, { type: 'rider', placementIndex: 0, riderIndex: 0 }, 0);
    assert('MoveRider SameSlot', result.placements[0].riders.length === 2, '同スロット移動は no-op であるべき');
  },

  // ─────────────────────────────────────────
  // calculateSchedule 追加カバレッジ
  // ─────────────────────────────────────────

  // 20. 全スロットで溢れが発生する
  testAllSlotsOverflow() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 1 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false },
        { name: 'R4', place: '公園', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const st = res.placements.find(p => p.slot.place === '駅');
    const pk = res.placements.find(p => p.slot.place === '公園');
    assert('AllSlotsOverflow St Riders',   st.riders.length === 1,  '駅: 1人乗車');
    assert('AllSlotsOverflow St Overflow', st.overflow.length === 1, '駅: 1人溢れ');
    assert('AllSlotsOverflow Pk Riders',   pk.riders.length === 1,  '公園: 1人乗車');
    assert('AllSlotsOverflow Pk Overflow', pk.overflow.length === 1, '公園: 1人溢れ');
    // 運転手ありスロットの overflow は unmatchedRiders から除外される（overflow バーで管理）
    assert('AllSlotsOverflow Total Unmatched', res.unmatchedRiders.length === 0, '運転手ありスロットの溢れはunmatchedRidersに入らない');
  },

  // 21. 同一スロットに複数の運転手が割り当てられる
  testMultipleDriversSameSlot() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅', time: '10:00', seats: 1 },
        { name: 'D2', place: '駅', time: '10:00', seats: 1 }
      ],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false },
        { name: 'R3', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    assert('MultiDriver Count',    res.placements.length === 1,                   'スロットは1つ');
    assert('MultiDriver Drivers',  res.placements[0].drivers.length === 2,        '2運転手が同スロットに');
    assert('MultiDriver Riders',   res.placements[0].riders.length === 2,         '合計2席分乗車');
    assert('MultiDriver Overflow', res.placements[0].overflow.length === 1,       '1人溢れ');
  },

  // 22. 優先乗客だけでも座席を超えれば overflow に入る
  testPriorityOverflow() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'P1', place: '駅', time: '10:00', priority: true },
        { name: 'P2', place: '駅', time: '10:00', priority: true },
        { name: 'P3', place: '駅', time: '10:00', priority: true }
      ]
    };
    const res = calculateSchedule(state);
    assert('PrioOverflow Riders Count',   res.placements[0].riders.length === 2,              '2人が乗車');
    assert('PrioOverflow All Riding Prio', res.placements[0].riders.every(r => r.priority),   '乗車は全員優先');
    assert('PrioOverflow Overflow Count', res.placements[0].overflow.length === 1,             '1人溢れ');
    assert('PrioOverflow Overflow Prio',  res.placements[0].overflow[0].priority === true,     '溢れた人も優先');
  },

  // 23. 条件が一致しない運転者は unmatchedDrivers に入る
  testUnmatchedDriver() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D_Lost', place: '宇宙', time: '99:99', seats: 2 }],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const res = calculateSchedule(state);
    assert('UnmatchedDriver Count',     res.unmatchedDrivers.length === 1,          '条件不一致の運転者は1人');
    assert('UnmatchedDriver Name',      res.unmatchedDrivers[0].name === 'D_Lost',  '名前が保持される');
    assert('UnmatchedDriver No Standby', res.standbyDrivers.length === 0,           '待機にはならない');
  },

  // 24. 同じ場所・異なる時間のスロットが独立している
  testSamePlaceDifferentTimes() {
    const state = {
      places: ['駅'], times: ['9:00', '10:00'],
      drivers: [
        { name: 'D_9',  place: '駅', time: '9:00',  seats: 2 },
        { name: 'D_10', place: '駅', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅', time: '9:00',  priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const slot9  = res.placements.find(p => p.slot.time === '9:00');
    const slot10 = res.placements.find(p => p.slot.time === '10:00');
    assert('SameplaceDiffTime Count',  res.placements.length === 2,      '2スロット独立');
    assert('SameplaceDiffTime 9h',     slot9.riders[0].name === 'R1',    '9:00 スロットにR1');
    assert('SameplaceDiffTime 10h',    slot10.riders[0].name === 'R2',   '10:00 スロットにR2');
    assert('SameplaceDiffTime D9',     slot9.drivers[0].name === 'D_9',  '9:00 はD_9が担当');
    assert('SameplaceDiffTime D10',    slot10.drivers[0].name === 'D_10','10:00 はD_10が担当');
  },

  // 25. 運転手なしスロットの overflow は unmatchedRiders にも現れる
  testNoDriverOverflowIsUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    assert('NoDrvOverflow Placement',  res.placements.length === 1,                   'プレースメントは存在する');
    assert('NoDrvOverflow Overflow',   res.placements[0].overflow.length === 2,        '全員がoverflowに');
    // 運転手なしスロットの overflow は draggable 手段が unmatched のみなので、引き続き unmatchedRiders に含む
    assert('NoDrvOverflow Unmatched',  res.unmatchedRiders.length === 2,               '運転手なしoverflowはunmatchedRidersに含まれる');
  },

  // 26. 優先と通常が混在し、座席数と等しい場合に全員乗車
  testMixedPriorityExactFit() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 3 }],
      riders: [
        { name: 'P1', place: '駅', time: '10:00', priority: true },
        { name: 'N1', place: '駅', time: '10:00', priority: false },
        { name: 'N2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    assert('MixedExactFit Riders',   res.placements[0].riders.length === 3,  '3人全員乗車');
    assert('MixedExactFit Overflow', res.placements[0].overflow.length === 0, '溢れゼロ');
    assert('MixedExactFit Unmatched', res.unmatchedRiders.length === 0,       '未割当ゼロ');
  },

  // 27. 「どこでも」運転手が複数スロットある場合に1スロットだけに割り当てられる
  testFlexibleDriverOnlyOneSlot() {
    const state = {
      places: ['A', 'B', 'C'], times: ['10:00'],
      drivers: [{ name: 'D_Any', place: 'どこでも', time: 'いつでも', seats: 2 }],
      riders: [
        { name: 'R1', place: 'A', time: '10:00', priority: false },
        { name: 'R2', place: 'B', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const assigned = res.placements.reduce((n, p) => n + p.drivers.length, 0);
    assert('FlexOneSlot Assigned Count', assigned === 1, 'どこでも運転手は1スロットにのみ配置');
  },

  // ─────────────────────────────────────────
  // moveRider 追加カバレッジ
  // ─────────────────────────────────────────

  // 28. overflow → 同スロットの riders へ昇格（空席がある場合）
  testMoveOverflowToSameSlot() {
    // seats=2 で riders=[R1], overflow=[R2] の状態を直接構築して検証
    const fakeResult = {
      placements: [{
        slot: { place: '駅', time: '10:00' },
        drivers: [{ name: 'D1', seats: 2 }],
        riders:   [{ name: 'R1', priority: false }],
        overflow: [{ name: 'R2', priority: false }]
      }],
      unmatchedRiders: [],
      standbyDrivers: [],
      unmatchedDrivers: []
    };
    moveRider(fakeResult, { type: 'overflow', placementIndex: 0, riderIndex: 0 }, 0);
    assert('OverflowSameSlot Riders',   fakeResult.placements[0].riders.length === 2,  '空席があれば overflow → riders に昇格');
    assert('OverflowSameSlot Overflow', fakeResult.placements[0].overflow.length === 0, '昇格後は overflow がゼロ');
  },

  // 29. 移動後も乗客の priority フラグと name が保持される
  testMoveRiderPreservesData() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: '田中', place: '駅',  time: '10:00', priority: true },
        { name: '鈴木', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    moveRider(result, { type: 'rider', placementIndex: stIdx, riderIndex: 0 }, pkIdx);
    const moved = result.placements[pkIdx].riders.find(r => r.name === '田中');
    assert('PreservesData Found',    moved !== undefined,        '移動後も名前で検索できる');
    assert('PreservesData Priority', moved.priority === true,    '移動後も priority フラグが保持');
  },

  // 30. 全スロット満席時に overflow → 別満席スロット → overflow に積まれる
  testMoveRiderAllOverflow() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 1 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false },
        { name: 'R4', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    assert('AllOverflow Init St', result.placements[stIdx].overflow.length === 1, '初期: 駅に1人溢れ');
    assert('AllOverflow Init Pk', result.placements[pkIdx].overflow.length === 1, '初期: 公園に1人溢れ');

    // 駅の溢れを満席の公園へドラッグ
    moveRider(result, { type: 'overflow', placementIndex: stIdx, riderIndex: 0 }, pkIdx);

    assert('AllOverflow After St Riders',   result.placements[stIdx].riders.length === 1,  '移動後: 駅の乗車は1人');
    assert('AllOverflow After St Overflow', result.placements[stIdx].overflow.length === 0, '移動後: 駅の溢れはゼロ');
    assert('AllOverflow After Pk Riders',   result.placements[pkIdx].riders.length === 1,  '移動後: 公園の乗車は1人（満席のまま）');
    assert('AllOverflow After Pk Overflow', result.placements[pkIdx].overflow.length === 2, '移動後: 公園の溢れが2人に');
  },

  // 31. 複数の溢れがある場合、1席分だけ補充される
  testMoveRiderPartialBackfill() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false },
        { name: 'R3', place: '駅', time: '10:00', priority: false },
        { name: 'R4', place: '駅', time: '10:00', priority: false },
        { name: 'R5', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');
    assert('PartialBackfill Init Riders',   result.placements[stIdx].riders.length === 2,  '初期: 駅2人乗車');
    assert('PartialBackfill Init Overflow', result.placements[stIdx].overflow.length === 2, '初期: 駅2人溢れ');

    // R1 を公園へ → 1席空く → overflow の1人だけ補充
    moveRider(result, { type: 'rider', placementIndex: stIdx, riderIndex: 0 }, pkIdx);

    assert('PartialBackfill After Riders',   result.placements[stIdx].riders.length === 2,  '移動後: 駅まだ2人（1人補充）');
    assert('PartialBackfill After Overflow', result.placements[stIdx].overflow.length === 1, '移動後: 駅の溢れは1人残る');
  },

  // ─────────────────────────────────────────
  // formatResultAsText 追加カバレッジ
  // ─────────────────────────────────────────

  // 32. 溢れがいる場合のテキスト出力
  testFormatTextWithOverflow() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 1 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const text = formatResultAsText(result);
    assert('FormatOverflow Section', text.includes('溢れ'), '溢れセクションが含まれる');
    assert('FormatOverflow Rider',   text.includes('R2'),   '溢れた乗客名が含まれる');
  },

  // 33. 未配車がいる場合のテキスト出力
  testFormatTextWithUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [{ name: 'R_Lost', place: '宇宙', time: '00:00', priority: false }]
    };
    const result = calculateSchedule(state);
    const text = formatResultAsText(result);
    assert('FormatUnmatched Section', text.includes('未配車'),   '未配車セクションが含まれる');
    assert('FormatUnmatched Rider',   text.includes('R_Lost'),   '未配車の名前が含まれる');
  },

  // 34. 待機運転者がいる場合のテキスト出力
  testFormatTextWithStandby() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',      time: '10:00',   seats: 3 },
        { name: 'D2', place: 'どこでも', time: 'いつでも', seats: 3 }
      ],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const result = calculateSchedule(state);
    const text = formatResultAsText(result);
    assert('FormatStandby Section', text.includes('空きの運転手'), '待機運転手セクションが含まれる');
    assert('FormatStandby Driver',  text.includes('D2'),           '待機運転手名が含まれる');
  },

  // ─────────────────────────────────────────
  // getDraggableItems / getDropZones 挙動テスト
  // ─────────────────────────────────────────

  // 36. riders は全員 srcType='rider' で draggable
  testDragSourceCoversAllRiders() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    const riderItems = items.filter(i => i.srcType === 'rider');
    assert('DragRiders Count',    riderItems.length === 3,                               '3人全員がrider drag sourceに');
    assert('DragRiders Names',    ['R1','R2','R3'].every(n => riderItems.some(i => i.rider.name === n)), '全名前が含まれる');
  },

  // 37. overflow は全員 srcType='overflow' で draggable
  testDragSourceCoversAllOverflow() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 1 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false },
        { name: 'R3', place: '駅', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    assert('DragOverflow Count', items.filter(i => i.srcType === 'overflow').length === 2, '溢れた2人がoverflow drag sourceに');
    assert('DragOverflow No Dup', result.unmatchedRiders.length === 0,                     '運転手ありoverflowはunmatchedRidersに出ない（重複なし）');
  },

  // 38. unmatchedRiders は全員 srcType='unmatched' で draggable
  testDragSourceCoversUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'R_OK',   place: '駅',  time: '10:00', priority: false },
        { name: 'R_Lost', place: '宇宙', time: '00:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    const unmItems = items.filter(i => i.srcType === 'unmatched');
    assert('DragUnmatched Count', unmItems.length === 1,                  '未配車1人がunmatched drag sourceに');
    assert('DragUnmatched Name',  unmItems[0].rider.name === 'R_Lost',    '正しい人が unmatched');
  },

  // 39. 運転手なしスロットの overflow は draggable にならない（unmatched 経由でのみ操作可）
  testDragSourceExcludesDriverlessOverflow() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [],
      riders: [{ name: 'R1', place: '駅', time: '10:00', priority: false }]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    assert('NoDriverDragOverflow None',    items.filter(i => i.srcType === 'overflow').length === 0, 'overflow drag sourceはゼロ（driver=0）');
    assert('NoDriverDragUnmatched Exists', items.filter(i => i.srcType === 'unmatched').length === 1, 'unmatched drag sourceで操作可能');
  },

  // 40. riderIndex は対象配列の正しいインデックスを指している
  testDragSourceIndexIntegrity() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 1 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);

    for (const item of items) {
      const { srcType, srcPlacement, riderIndex, rider } = item;
      let actual;
      if (srcType === 'rider')    actual = result.placements[srcPlacement].riders[riderIndex];
      if (srcType === 'overflow') actual = result.placements[srcPlacement].overflow[riderIndex];
      if (srcType === 'unmatched') actual = result.unmatchedRiders[riderIndex];
      assert(
        `IndexIntegrity ${srcType}[${riderIndex}]`,
        actual && actual.name === rider.name,
        `riderIndex ${riderIndex} が正しい人(${rider.name})を指していない`
      );
    }
  },

  // 41. getDraggableItems の合計数が正しい
  testDragSourceTotalCount() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false }, // overflow
        { name: 'R3', place: '公園', time: '10:00', priority: false },
        { name: 'R_Lost', place: '宇宙', time: '00:00', priority: false } // unmatched
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    // R1 riding, R2 overflow(駅), R3 riding(公園), R_Lost unmatched → total=4
    assert('DragTotalCount', items.length === 4, '全draggableは4人');
    assert('DragTotalRider',    items.filter(i => i.srcType === 'rider').length === 2,    'rider 2人');
    assert('DragTotalOverflow', items.filter(i => i.srcType === 'overflow').length === 1, 'overflow 1人');
    assert('DragTotalUnmatched',items.filter(i => i.srcType === 'unmatched').length === 1,'unmatched 1人');
  },

  // 42. getDropZones: 運転手ありスロットのみがドロップ先
  testDropZoneDriverSlotsOnly() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const zones = getDropZones(result);
    assert('DropZoneCount',      zones.length === 1,              '運転手ありスロットが1つ');
    assert('DropZoneSlot',       zones[0].slot.place === '駅',    '駅がドロップゾーン');
    assert('DropZoneNoDriverless', !zones.some(z => z.slot.place === '公園'), '公園（運転手なし）はドロップゾーンでない');
  },

  // 43. getDropZones: 全スロットに運転手がいる場合の数
  testDropZoneCountAllDrivers() {
    const state = {
      places: ['A', 'B', 'C'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: 'A', time: '10:00', seats: 1 },
        { name: 'D2', place: 'B', time: '10:00', seats: 1 },
        { name: 'D3', place: 'C', time: '10:00', seats: 1 }
      ],
      riders: [
        { name: 'R1', place: 'A', time: '10:00', priority: false },
        { name: 'R2', place: 'B', time: '10:00', priority: false },
        { name: 'R3', place: 'C', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const zones = getDropZones(result);
    assert('DropZoneAllCount', zones.length === 3, '3スロット全てがドロップゾーン');
  },

  // ─────────────────────────────────────────
  // 完全ドラッグフロー シミュレーション
  // ─────────────────────────────────────────

  // 44. drag source → moveRider の完全フロー（rider）
  testDragFlowRider() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    const zones  = getDropZones(result);

    // R1のdrag sourceを取得
    const r1Item = items.find(i => i.rider.name === 'R1');
    // 公園のdrop zoneを取得
    const pkZone = zones.find(z => z.slot.place === '公園');

    assert('DragFlowRider SourceFound', r1Item !== undefined,         'R1のdrag sourceが存在する');
    assert('DragFlowRider ZoneFound',   pkZone  !== undefined,         '公園のdrop zoneが存在する');
    assert('DragFlowRider SrcType',     r1Item.srcType === 'rider',   'R1はrider typeで draggable');

    // drag → drop をシミュレート
    moveRider(result, {
      type: r1Item.srcType,
      placementIndex: r1Item.srcPlacement,
      riderIndex: r1Item.riderIndex
    }, pkZone.destPlacement);

    const pkPlacement = result.placements[pkZone.destPlacement];
    assert('DragFlowRider Moved', pkPlacement.riders.some(r => r.name === 'R1'), 'R1が公園に移動');
  },

  // 45. drag source → moveRider の完全フロー（overflow）
  testDragFlowOverflow() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    const zones  = getDropZones(result);

    const overflowItem = items.find(i => i.srcType === 'overflow');
    const pkZone = zones.find(z => z.slot.place === '公園');

    assert('DragFlowOverflow ItemFound', overflowItem !== undefined, 'overflow drag sourceが存在する');
    assert('DragFlowOverflow ZoneFound', pkZone !== undefined,       '公園のdrop zoneが存在する');

    const overflowName = overflowItem.rider.name;

    moveRider(result, {
      type: overflowItem.srcType,
      placementIndex: overflowItem.srcPlacement,
      riderIndex: overflowItem.riderIndex
    }, pkZone.destPlacement);

    const pkPlacement = result.placements[pkZone.destPlacement];
    assert('DragFlowOverflow Moved', pkPlacement.riders.some(r => r.name === overflowName), '溢れた人が公園に移動');
  },

  // 46. drag source → moveRider の完全フロー（unmatched）
  testDragFlowUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 3 }],
      riders: [
        { name: 'R_OK',   place: '駅',  time: '10:00', priority: false },
        { name: 'R_Lost', place: '宇宙', time: '00:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    const zones  = getDropZones(result);

    const unmItem = items.find(i => i.srcType === 'unmatched');
    const stZone  = zones[0];

    assert('DragFlowUnmatched ItemFound', unmItem !== undefined,          'unmatched drag sourceが存在する');
    assert('DragFlowUnmatched ZoneFound', stZone  !== undefined,          '駅のdrop zoneが存在する');
    assert('DragFlowUnmatched Name',      unmItem.rider.name === 'R_Lost', 'R_LostがunmatchedのdragSource');

    moveRider(result, {
      type: unmItem.srcType,
      riderIndex: unmItem.riderIndex
    }, stZone.destPlacement);

    assert('DragFlowUnmatched Moved',    result.placements[stZone.destPlacement].riders.some(r => r.name === 'R_Lost'), 'R_Lostが駅に移動');
    assert('DragFlowUnmatched Removed',  result.unmatchedRiders.length === 0, 'unmatchedRidersから削除');
  },

  // 47. 連続ドラッグ: 複数回移動しても整合性が保たれる
  testDragFlowSequential() {
    const state = {
      places: ['A', 'B', 'C'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: 'A', time: '10:00', seats: 2 },
        { name: 'D2', place: 'B', time: '10:00', seats: 2 },
        { name: 'D3', place: 'C', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: 'A', time: '10:00', priority: false },
        { name: 'R2', place: 'A', time: '10:00', priority: false },
        { name: 'R3', place: 'A', time: '10:00', priority: false },
        { name: 'R4', place: 'B', time: '10:00', priority: false },
        { name: 'R5', place: 'C', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const aIdx = result.placements.findIndex(p => p.slot.place === 'A');
    const bIdx = result.placements.findIndex(p => p.slot.place === 'B');
    const cIdx = result.placements.findIndex(p => p.slot.place === 'C');

    assert('SeqDrag Init A Overflow', result.placements[aIdx].overflow.length === 1, '初期: Aに1人溢れ');

    // 1回目: Aの溢れ → B
    const items1 = getDraggableItems(result);
    const ov1 = items1.find(i => i.srcType === 'overflow' && i.srcPlacement === aIdx);
    moveRider(result, { type: 'overflow', placementIndex: aIdx, riderIndex: ov1.riderIndex }, bIdx);

    assert('SeqDrag After1 A', result.placements[aIdx].overflow.length === 0, '1回目後: Aの溢れゼロ');
    assert('SeqDrag After1 B', result.placements[bIdx].riders.length === 2,   '1回目後: Bに2人');

    // 2回目: Bからの誰かを → C
    const items2 = getDraggableItems(result);
    const rv2 = items2.find(i => i.srcType === 'rider' && i.srcPlacement === bIdx);
    moveRider(result, { type: 'rider', placementIndex: bIdx, riderIndex: rv2.riderIndex }, cIdx);

    assert('SeqDrag After2 B', result.placements[bIdx].riders.length === 1, '2回目後: Bに1人');
    assert('SeqDrag After2 C', result.placements[cIdx].riders.length === 2, '2回目後: Cに2人');

    // 全員がどこかに割り当てられている
    const allRiders = result.placements.flatMap(p => [...p.riders, ...p.overflow]);
    assert('SeqDrag TotalPeople', allRiders.length + result.unmatchedRiders.length === 5, '合計5人の整合性');
  },

  // 48. 全スロット満席でも drag source / drop zone は正しく返る
  testDragAvailableWhenAllFull() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 1 }
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false },
        { name: 'R3', place: '公園', time: '10:00', priority: false },
        { name: 'R4', place: '公園', time: '10:00', priority: false }
      ]
    };
    const result = calculateSchedule(state);
    const items = getDraggableItems(result);
    const zones  = getDropZones(result);

    assert('AllFull DragItems',    items.length === 4, '4人全員がdraggable（riders 2 + overflow 2）');
    assert('AllFull DropZones',    zones.length === 2,  '2つのdrop zoneが存在');
    assert('AllFull NoUnmatched',  result.unmatchedRiders.length === 0, 'unmatchedRidersはゼロ');
  },

  // 49. drag indexが変化した後（前のindexが無効に）getDraggableItems を再取得すると正しい
  testDragSourceRefreshAfterMove() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 1 }],
      riders: [
        { name: 'R1', place: '駅', time: '10:00', priority: false },
        { name: 'R2', place: '駅', time: '10:00', priority: false }
      ]
    };
    // 2スロット目 (公園) を追加してdropsを受け付けられるようにする
    state.places.push('公園');
    state.drivers.push({ name: 'D2', place: '公園', time: '10:00', seats: 2 });
    state.riders.push({ name: 'R3', place: '公園', time: '10:00', priority: false });

    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');

    // 移動前のdrag sourceを取得
    const beforeItems = getDraggableItems(result);
    const overflowBefore = beforeItems.filter(i => i.srcType === 'overflow');
    assert('Refresh Before Overflow', overflowBefore.length === 1, '移動前: overflow 1人');

    // overflow を公園へ移動
    moveRider(result, { type: 'overflow', placementIndex: stIdx, riderIndex: 0 }, pkIdx);

    // 移動後に drag source を再取得すると overflow がなくなっている
    const afterItems = getDraggableItems(result);
    const overflowAfter = afterItems.filter(i => i.srcType === 'overflow');
    assert('Refresh After Overflow', overflowAfter.length === 0,   '移動後: overflow drag source はゼロ');
    assert('Refresh After Riders',   afterItems.filter(i => i.srcType === 'rider').length === 3, '移動後: rider 3人');
  },

  // 50. 全スロット溢れの状態で、空席のある別スロットへ移動すると乗車できる
  testAllSlotsOverflowAfterMove() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D1', place: '駅',  time: '10:00', seats: 1 },
        { name: 'D2', place: '公園', time: '10:00', seats: 3 }  // 空席あり
      ],
      riders: [
        { name: 'R1', place: '駅',  time: '10:00', priority: false },
        { name: 'R2', place: '駅',  time: '10:00', priority: false }, // 溢れ
        { name: 'R3', place: '公園', time: '10:00', priority: false }  // 公園は2席余っている
      ]
    };
    const result = calculateSchedule(state);
    const stIdx = result.placements.findIndex(p => p.slot.place === '駅');
    const pkIdx = result.placements.findIndex(p => p.slot.place === '公園');

    assert('AllOvAfterMove Init StOv', result.placements[stIdx].overflow.length === 1, '初期: 駅1人溢れ');
    assert('AllOvAfterMove Init PkOv', result.placements[pkIdx].overflow.length === 0, '初期: 公園は溢れなし（空席あり）');

    // 駅の溢れを空席のある公園へドラッグ → 乗れるはず
    moveRider(result, { type: 'overflow', placementIndex: stIdx, riderIndex: 0 }, pkIdx);

    assert('AllOvAfterMove St Overflow', result.placements[stIdx].overflow.length === 0, '移動後: 駅の溢れゼロ');
    assert('AllOvAfterMove Pk Riders',   result.placements[pkIdx].riders.length === 2,   '移動後: 公園は2人乗車（R2が乗れた）');
    assert('AllOvAfterMove Pk Overflow', result.placements[pkIdx].overflow.length === 0, '移動後: 公園の溢れゼロ');
  }
};

// ─────────────────────────────────────────
// parseBulkRiders テスト
// ─────────────────────────────────────────

const bulkSuite = {
  // 51. 空文字列 → 空結果
  testBulkEmpty() {
    const { valid, errors } = parseBulkRiders('', ['駅'], ['10:00']);
    assert('Bulk Empty Valid',  valid.length  === 0, '空入力: valid は空');
    assert('Bulk Empty Errors', errors.length === 0, '空入力: errors も空');
  },

  // 52. 有効な1行（名前 + 場所 + 時間）
  testBulkValidFull() {
    const { valid, errors } = parseBulkRiders('田中, 駅前, 9:00', ['駅前'], ['9:00']);
    assert('BulkFull Valid Count',  valid.length === 1,        '1件登録');
    assert('BulkFull Name',         valid[0].name  === '田中', '名前が正しい');
    assert('BulkFull Place',        valid[0].place === '駅前', '場所が正しい');
    assert('BulkFull Time',         valid[0].time  === '9:00', '時間が正しい');
    assert('BulkFull Priority',     valid[0].priority === false, 'priorityはfalse');
    assert('BulkFull Errors',       errors.length === 0,       'エラーなし');
  },

  // 53. 時間省略 → times[0] を使用
  testBulkOmitTime() {
    const { valid, errors } = parseBulkRiders('鈴木, 公園', ['公園'], ['9:00', '10:00']);
    assert('BulkNoTime Valid',  valid.length === 1,         '1件登録');
    assert('BulkNoTime Time',   valid[0].time === '9:00',   '時間省略時は times[0] を使用');
    assert('BulkNoTime Errors', errors.length === 0,        'エラーなし');
  },

  // 54. 複数行まとめて登録
  testBulkMultipleLines() {
    const text = '田中, 駅前, 9:00\n鈴木, 公園\n佐藤, 駅前, 10:00';
    const { valid, errors } = parseBulkRiders(text, ['駅前', '公園'], ['9:00', '10:00']);
    assert('BulkMulti Count',   valid.length  === 3, '3件登録');
    assert('BulkMulti Errors',  errors.length === 0, 'エラーなし');
    assert('BulkMulti Names',   valid.map(r => r.name).join(',') === '田中,鈴木,佐藤', '順番が正しい');
  },

  // 55. 存在しない場所 → エラー
  testBulkInvalidPlace() {
    const { valid, errors } = parseBulkRiders('田中, 月面, 9:00', ['駅前'], ['9:00']);
    assert('BulkBadPlace Valid',  valid.length  === 0, 'valid は空');
    assert('BulkBadPlace Errors', errors.length === 1, 'エラー1件');
    assert('BulkBadPlace Reason', errors[0].reason.includes('月面'), '場所名がエラーメッセージに含まれる');
  },

  // 56. 存在しない時間 → エラー
  testBulkInvalidTime() {
    const { valid, errors } = parseBulkRiders('田中, 駅前, 25:00', ['駅前'], ['9:00']);
    assert('BulkBadTime Valid',  valid.length  === 0, 'valid は空');
    assert('BulkBadTime Errors', errors.length === 1, 'エラー1件');
    assert('BulkBadTime Reason', errors[0].reason.includes('25:00'), '時間がエラーメッセージに含まれる');
  },

  // 57. 名前が空の行 → エラー
  testBulkMissingName() {
    const { valid, errors } = parseBulkRiders(', 駅前, 9:00', ['駅前'], ['9:00']);
    assert('BulkNoName Valid',  valid.length  === 0, 'valid は空');
    assert('BulkNoName Errors', errors.length === 1, 'エラー1件');
    assert('BulkNoName Reason', errors[0].reason === '名前が空です', 'エラーメッセージが正しい');
  },

  // 58. 場所が指定されていない行（名前のみ） → エラー
  testBulkMissingPlace() {
    const { valid, errors } = parseBulkRiders('田中', ['駅前'], ['9:00']);
    assert('BulkNoPlace Valid',  valid.length  === 0, 'valid は空');
    assert('BulkNoPlace Errors', errors.length === 1, 'エラー1件');
    assert('BulkNoPlace Reason', errors[0].reason === '場所が指定されていません', 'エラーメッセージが正しい');
  },

  // 59. 時間省略 + 時間未設定 → エラー
  testBulkNoTimesConfigured() {
    const { valid, errors } = parseBulkRiders('田中, 駅前', ['駅前'], []);
    assert('BulkNoTimes Valid',  valid.length  === 0, 'valid は空');
    assert('BulkNoTimes Errors', errors.length === 1, 'エラー1件');
    assert('BulkNoTimes Reason', errors[0].reason === '集合時間が設定されていません', 'エラーメッセージが正しい');
  },

  // 60. 全角カンマ (、) も区切り文字として使える
  testBulkFullWidthComma() {
    const { valid, errors } = parseBulkRiders('田中、駅前、9:00', ['駅前'], ['9:00']);
    assert('BulkFullWidthComma Valid',  valid.length === 1,        '全角カンマで1件登録');
    assert('BulkFullWidthComma Name',   valid[0].name === '田中',  '名前が正しい');
    assert('BulkFullWidthComma Errors', errors.length === 0,       'エラーなし');
  },

  // 61. 半角・全角混在でも動作する
  testBulkMixedComma() {
    const { valid, errors } = parseBulkRiders('田中, 駅前、9:00', ['駅前'], ['9:00']);
    assert('BulkMixedComma Valid', valid.length === 1,  '混在カンマでも1件登録');
    assert('BulkMixedComma Time',  valid[0].time === '9:00', '時間が正しい');
  },

  // 62. 前後の余分な空白はトリムされる
  testBulkWhitespaceTrimmed() {
    const { valid, errors } = parseBulkRiders('  田中 ,  駅前 ,  9:00  ', ['駅前'], ['9:00']);
    assert('BulkTrim Valid', valid.length === 1,        '空白トリムで1件登録');
    assert('BulkTrim Name',  valid[0].name  === '田中', '名前のトリムが正しい');
    assert('BulkTrim Place', valid[0].place === '駅前', '場所のトリムが正しい');
    assert('BulkTrim Time',  valid[0].time  === '9:00', '時間のトリムが正しい');
  },

  // 63. 空行・空白のみの行はスキップ
  testBulkSkipBlankLines() {
    const text = '田中, 駅前, 9:00\n\n   \n鈴木, 駅前, 9:00';
    const { valid, errors } = parseBulkRiders(text, ['駅前'], ['9:00']);
    assert('BulkBlankLines Valid',  valid.length  === 2, '空行をスキップして2件登録');
    assert('BulkBlankLines Errors', errors.length === 0, 'エラーなし');
  },

  // 64. 4フィールド以上でも最初の3つだけ使用（余剰フィールドは無視）
  testBulkExtraFields() {
    const { valid, errors } = parseBulkRiders('田中, 駅前, 9:00, 余分な情報', ['駅前'], ['9:00']);
    assert('BulkExtraFields Valid',  valid.length === 1,        '余分フィールドを無視して1件登録');
    assert('BulkExtraFields Name',   valid[0].name  === '田中', '名前が正しい');
    assert('BulkExtraFields Errors', errors.length === 0,       'エラーなし');
  },

  // 65. 有効行と無効行が混在 → 有効分だけ登録
  testBulkMixedValidInvalid() {
    const text = [
      '田中, 駅前, 9:00',
      '鈴木, 月面, 9:00',  // 無効: 場所なし
      '佐藤, 駅前',         // 有効: 時間省略
      '花子, 駅前, 99:00'  // 無効: 時間なし
    ].join('\n');
    const { valid, errors } = parseBulkRiders(text, ['駅前'], ['9:00']);
    assert('BulkMixed Valid Count',  valid.length  === 2, '有効2件のみ登録');
    assert('BulkMixed Error Count',  errors.length === 2, 'エラー2件');
    assert('BulkMixed Valid Names',  valid.map(r => r.name).join(',') === '田中,佐藤', '田中と佐藤が登録');
  },

  // 66. 場所も時間も設定されていない状態で全行エラー
  testBulkNoConfigAtAll() {
    const text = '田中, 駅前, 9:00\n鈴木, 公園';
    const { valid, errors } = parseBulkRiders(text, [], []);
    assert('BulkNoConfig Valid',  valid.length  === 0, 'valid は空');
    assert('BulkNoConfig Errors', errors.length === 2, '全行エラー');
  }
};

console.log('🚀 Starting Validation Tests...');
Object.values(suite).forEach(test => test());
console.log('\n🚀 Starting Bulk Import Tests...');
Object.values(bulkSuite).forEach(test => test());
console.log('✨ All tests passed successfully!');
