/**
 * アプリケーションの状態管理
 */

export const state = {
  places: [],
  times: [],
  drivers: [],
  riders: [],
  newPlaceInput: '',
  newTimeInput: '',
  result: null,
  activeTab: 'setup'
};

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
 * 状態を初期化またはLocalStorageから読み込む（拡張用）
 */
export function initState() {
  // 必要に応じてLocalStorageからの復元をここに実装
}
