import { calculateSchedule } from './js/scheduler.js';

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

  // 2. 柔軟な運転手の配置（重要：空車があるのに溢れる問題の修正確認）
  testFlexibleDriver() {
    const state = {
      places: ['教会', '駅'], times: ['10:00'],
      drivers: [{ name: 'D_Any', place: 'どこでも', time: 'いつでも', seats: 2 }],
      riders: [
        { name: 'R_Station', place: '駅', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const stationSlot = res.placements.find(p => p.slot.place === '駅');
    assert('Flexible Driver', stationSlot && stationSlot.drivers.length === 1, 'どこでもOKな運転手が駅に割り当てられていません');
    assert('Flexible Driver Rider', stationSlot && stationSlot.riders.length === 1, '駅の乗客が拾われていません');
  },

  // 3. 優先順位の確認
  testPriority() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 1 }],
      riders: [
        { name: 'Normal', place: '駅', time: '10:00', priority: false },
        { name: 'VIP', place: '駅', time: '10:00', priority: true }
      ]
    };
    const res = calculateSchedule(state);
    assert('Priority', res.placements[0].riders[0].name === 'VIP', '優先乗客が先に割り当てられていません');
    assert('Priority Overflow', res.placements[0].overflow[0].name === 'Normal', '一般乗客が溢れに回っていません');
  },

  // 4. 特定場所指定の運転手優先（希少リソースの保護）
  testSpecificDriverFirst() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [
        { name: 'D_StationOnly', place: '駅', time: '10:00', seats: 2 },
        { name: 'D_Any', place: 'どこでも', time: 'いつでも', seats: 2 }
      ],
      riders: [
        { name: 'R_Station', place: '駅', time: '10:00', priority: false },
        { name: 'R_Park', place: '公園', time: '10:00', priority: false }
      ]
    };
    const res = calculateSchedule(state);
    const parkSlot = res.placements.find(p => p.slot.place === '公園');
    const stationSlot = res.placements.find(p => p.slot.place === '駅');
    assert('Specific First (Park)', parkSlot.drivers[0].name === 'D_Any', '公園にどこでもOKな運転手が割り当てられていません');
    assert('Specific First (Station)', stationSlot.drivers[0].name === 'D_StationOnly', '駅に専用の運転手が割り当てられていません');
  },

  // 5. 需要がない場所への空車配置
  testEmptyCar() {
    const state = {
      places: ['駅', '公園'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: []
    };
    const res = calculateSchedule(state);
    assert('Empty Car', res.placements.length === 1 && res.placements[0].drivers.length === 1, '乗客がいなくても運転手は配置されるべき');
  },

  // 6. 複数スロットの混在
  testMultipleSlots() {
    const state = {
      places: ['駅', '公園'], times: ['9:00', '10:00'],
      drivers: [
        { name: 'D1', place: '駅', time: '9:00', seats: 2 },
        { name: 'D2', place: '公園', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R1', place: '駅', time: '9:00', priority: false },
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
    assert('No Drivers', res.placements.length === 1 && res.placements[0].drivers.length === 0, '運転者なしでプレースメントが作成されるべき');
    assert('No Drivers Overflow', res.placements[0].overflow.length === 1, '運転者がいないので全員溢れるべき');
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
    assert('Capacity Limit Riding', res.placements[0].riders.length === 2, '2人だけ乗るべき');
    assert('Capacity Limit Overflow', res.placements[0].overflow.length === 1, '1人溢れるべき');
  },

  // 9. 複雑な柔軟性（行ける場所が限定されている人から順に埋める）
  testComplexFlexibility() {
    const state = {
      places: ['A', 'B', 'C'], times: ['10:00'],
      drivers: [
        { name: 'D_AB', place: 'どこでも', time: 'いつでも', seats: 2 },
        { name: 'D_A_Only', place: 'A', time: '10:00', seats: 2 }
      ],
      riders: [
        { name: 'R_A', place: 'A', time: '10:00', priority: false },
        { name: 'R_B', place: 'B', time: '10:00', priority: false }
      ]
    };
    // 期待: D_A_OnlyがAに、D_ABがBに行くべき
    const res = calculateSchedule(state);
    const slotA = res.placements.find(p => p.slot.place === 'A');
    const slotB = res.placements.find(p => p.slot.place === 'B');
    assert('Complex Flex A', slotA.drivers[0].name === 'D_A_Only', 'AにはA限定の運転手が優先されるべき');
    assert('Complex Flex B', slotB.drivers[0].name === 'D_AB', 'Bには柔軟な運転手が回るべき');
  },

  // 10. 全く条件に合わない乗客（本来はUIで防ぐがロジックとして）
  testUnmatched() {
    const state = {
      places: ['駅'], times: ['10:00'],
      drivers: [{ name: 'D1', place: '駅', time: '10:00', seats: 2 }],
      riders: [{ name: 'R1', place: '宇宙', time: '00:00', priority: false }]
    };
    const res = calculateSchedule(state);
    assert('Unmatched Rider', res.unmatched.length === 1, '条件に合わない乗客はunmatchedに入るべき');
  }
};

console.log('🚀 Starting Validation Tests...');
Object.values(suite).forEach(test => test());
console.log('✨ All tests passed successfully!');
