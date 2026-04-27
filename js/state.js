/**
 * アプリケーションの状態管理
 */

const STORAGE_KEY = 'haisha_scheduler_state';

// 初期状態
const initialState = {
  places: [],
  times: [],
  drivers: [],
  riders: [],
  newPlaceInput: '',
  newTimeInput: '',
  result: null,
  activeTab: 'setup'
};

export const state = { ...initialState };

export const driverForm = {
  name: '',
  place: '',
  time: '',
  seats: 3 // 運転手を除いた、乗客が乗れる人数
};

export const riderForm = {
  name: '',
  place: '',
  time: '',
  priority: false
};

/**
 * 状態をLocalStorageから読み込む
 */
export function initState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // stateオブジェクトの中身を更新
      Object.assign(state, parsed);
      // 計算結果はリロード時にリセット（必要なら保存も可能）
      state.result = null;
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }
}

/**
 * 現在の状態をLocalStorageに保存する（設定のみ）
 */
export function saveState() {
  const toSave = {
    places: state.places,
    times: state.times
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

/**
 * 全てのデータを削除して初期化する
 */
export function clearAllData() {
  if (confirm('全てのデータを削除して初期化しますか？')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}
