/**
 * UIレンダリングとインタラクション
 */
import { state, driverForm, riderForm, saveState, clearAllData } from './state.js';
import { calculateSchedule, formatResultAsText, moveRider } from './scheduler.js';
import { parseBulkRiders } from './import.js';

// 編集モード用UI状態
let driverEditIndex = -1;
let riderEditIndex = -1;
let driverFormError = '';
let riderFormError = '';

// ドラッグ&ドロップ用
let dragSource = null;

// 一括入力用
let bulkInputText = '';
let bulkResult = null; // { message: string, hasError: boolean }

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * タブを切り替える
 */
export function switchTab(tabId) {
  state.activeTab = tabId;
  const tabs = ['setup', 'drivers', 'riders', 'result'];

  tabs.forEach((t, i) => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === tabId ? 'block' : 'none';

    const tabBtn = document.querySelectorAll('.tab')[i];
    if (tabBtn) tabBtn.classList.toggle('active', t === tabId);
  });

  render();
}

/**
 * 現在のタブを再描画する
 */
export function render() {
  switch (state.activeTab) {
    case 'setup':   renderSetup();   break;
    case 'drivers': renderDrivers(); break;
    case 'riders':  renderRiders();  break;
    case 'result':  renderResult();  break;
  }
}

function getInitials(name) {
  return name ? name.slice(0, 2) : '??';
}

function showToast(message, isError = false) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = isError ? 'error' : '';
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// --- Setup Tab ---

function renderSetup() {
  const container = document.getElementById('tab-setup');
  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <div class="section-label">集合場所</div>
      <div class="tag-wrap">
        ${state.places.map((p, i) => `
          <span class="tag">
            ${p}
            <button class="tag-del" data-index="${i}" data-type="place">×</button>
          </span>
        `).join('') || '<span style="font-size:13px;color:#bbb">未設定</span>'}
      </div>
      <div class="input-row">
        <input type="text" id="input-place" placeholder="例：駅前、公園..." value="${state.newPlaceInput}">
        <button class="btn btn-primary" id="btn-add-place">追加</button>
      </div>
    </div>
    <div class="card">
      <div class="section-label">集合時間</div>
      <div class="tag-wrap">
        ${state.times.map((t, i) => `
          <span class="tag">
            ${t}
            <button class="tag-del" data-index="${i}" data-type="time">×</button>
          </span>
        `).join('') || '<span style="font-size:13px;color:#bbb">未設定</span>'}
      </div>
      <div class="input-row">
        <input type="text" id="input-time" placeholder="例：9:00、10:30..." value="${state.newTimeInput}">
        <button class="btn btn-primary" id="btn-add-time">追加</button>
      </div>
    </div>
    <div class="summary-row">
      <div class="stat">
        <div class="stat-label">運転者</div>
        <div class="stat-val">${state.drivers.length}<span class="stat-unit"> 人</span></div>
      </div>
      <div class="stat">
        <div class="stat-label">乗る人</div>
        <div class="stat-val">${state.riders.length}<span class="stat-unit"> 人</span></div>
      </div>
    </div>
    <div style="margin-top: 20px; text-align: center;">
      <button class="btn btn-danger" id="btn-clear-all" style="opacity: 0.6; font-size: 11px; padding: 4px 12px;">履歴をすべてリセットする</button>
    </div>
  `;

  const inputPlace = container.querySelector('#input-place');
  const inputTime  = container.querySelector('#input-time');

  container.querySelector('#btn-add-place').onclick = () => addPlace(inputPlace.value);
  container.querySelector('#btn-add-time').onclick  = () => addTime(inputTime.value);
  inputPlace.onkeydown = (e) => { if (e.key === 'Enter') addPlace(inputPlace.value); };
  inputTime.onkeydown  = (e) => { if (e.key === 'Enter') addTime(inputTime.value); };

  container.querySelectorAll('.tag-del').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.index);
      if (btn.dataset.type === 'place') state.places.splice(idx, 1);
      else state.times.splice(idx, 1);
      saveState();
      renderSetup();
    };
  });

  container.querySelector('#btn-clear-all').onclick = clearAllData;
}

function addPlace(val) {
  const v = val.trim();
  if (v && !state.places.includes(v)) {
    state.places.push(v);
    state.newPlaceInput = '';
    saveState();
    renderSetup();
  }
}

function addTime(val) {
  const v = val.trim();
  if (v && !state.times.includes(v)) {
    state.times.push(v);
    state.newTimeInput = '';
    saveState();
    renderSetup();
  }
}

// --- Drivers Tab ---

function renderDrivers() {
  const container = document.getElementById('tab-drivers');
  if (!container) return;

  if (!driverForm.place && state.places.length) driverForm.place = 'どこでも';
  if (!driverForm.time  && state.times.length)  driverForm.time  = 'いつでも';

  const placeOptions = ['どこでも', ...state.places].map(p =>
    `<option value="${p}" ${driverForm.place === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  const timeOptions = ['いつでも', ...state.times].map(t =>
    `<option value="${t}" ${driverForm.time === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  const isEditing = driverEditIndex >= 0;

  container.innerHTML = `
    <div class="card">
      <div class="section-label">${isEditing ? '運転者を編集' : '運転者を追加'}</div>
      <div class="field">
        <label>名前</label>
        <input type="text" id="d-name" placeholder="名前を入力" value="${driverForm.name}">
      </div>
      <div class="field">
        <label>集合場所</label>
        <select id="d-place">${state.places.length ? placeOptions : '<option>先に場所を設定してください</option>'}</select>
      </div>
      <div class="field">
        <label>集合時間</label>
        <select id="d-time">${state.times.length ? timeOptions : '<option>先に時間を設定してください</option>'}</select>
      </div>
      <div class="field">
        <label>乗せられる人数（運転手除く）</label>
        <div class="counter-row">
          <button class="cbtn" id="d-minus">−</button>
          <span class="cval">${driverForm.seats}</span>
          <button class="cbtn" id="d-plus">+</button>
          <span style="font-size:13px;color:#888">人</span>
        </div>
      </div>
      ${driverFormError ? `<div class="form-error">${driverFormError}</div>` : ''}
      <button class="btn btn-primary btn-full" id="btn-add-driver">${isEditing ? '更新する' : '登録する'}</button>
      ${isEditing ? `<button class="btn btn-full" id="btn-cancel-driver" style="margin-top:6px">キャンセル</button>` : ''}
    </div>
    <div class="card">
      <div class="list-header">
        <span class="list-header-title">登録済み運転者</span>
        <span class="count-badge">${state.drivers.length}人</span>
      </div>
      ${state.drivers.length === 0 ? '<div class="empty">まだ登録されていません</div>' :
        state.drivers.map((d, i) => `
          <div class="person-item ${i === driverEditIndex ? 'item-editing' : ''}">
            <div class="avatar av-driver">${getInitials(d.name)}</div>
            <div class="person-info">
              <div class="person-name">${d.name}<span class="badge bd-driver">運転者</span></div>
              <div class="person-meta">${d.place}・${d.time}・${d.seats}名まで</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-edit btn-edit-driver" data-index="${i}">編集</button>
              <button class="btn btn-danger btn-del-driver" data-index="${i}">削除</button>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;

  const inputName = container.querySelector('#d-name');
  container.querySelector('#d-place').onchange = (e) => { driverForm.place = e.target.value; };
  container.querySelector('#d-time').onchange  = (e) => { driverForm.time  = e.target.value; };
  container.querySelector('#d-minus').onclick = () => {
    driverForm.seats = Math.max(1, driverForm.seats - 1);
    renderDrivers();
  };
  container.querySelector('#d-plus').onclick = () => {
    driverForm.seats = Math.min(15, driverForm.seats + 1);
    renderDrivers();
  };
  container.querySelector('#btn-add-driver').onclick = () => addDriver(inputName.value);
  inputName.onkeydown = (e) => { if (e.key === 'Enter') addDriver(inputName.value); };

  if (isEditing) {
    container.querySelector('#btn-cancel-driver').onclick = () => {
      driverEditIndex = -1;
      driverFormError = '';
      driverForm.name = '';
      renderDrivers();
    };
  }

  container.querySelectorAll('.btn-edit-driver').forEach(btn => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.index);
      const d = state.drivers[i];
      driverEditIndex = i;
      driverFormError = '';
      driverForm.name  = d.name;
      driverForm.place = d.place;
      driverForm.time  = d.time;
      driverForm.seats = d.seats;
      renderDrivers();
      container.querySelector('#d-name').focus();
    };
  });

  container.querySelectorAll('.btn-del-driver').forEach(btn => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.index);
      if (driverEditIndex === i) {
        driverEditIndex = -1;
        driverFormError = '';
        driverForm.name = '';
      }
      state.drivers.splice(i, 1);
      renderDrivers();
    };
  });
}

function addDriver(val) {
  const name = val.trim();
  if (!name) {
    driverFormError = '名前を入力してください';
    renderDrivers();
    return;
  }
  if (!state.places.length) {
    driverFormError = '先に集合場所を設定してください';
    renderDrivers();
    return;
  }
  if (!state.times.length) {
    driverFormError = '先に集合時間を設定してください';
    renderDrivers();
    return;
  }

  driverFormError = '';
  const entry = { ...driverForm, name };
  if (driverEditIndex >= 0) {
    state.drivers[driverEditIndex] = entry;
    driverEditIndex = -1;
  } else {
    state.drivers.push(entry);
  }
  driverForm.name = '';
  renderDrivers();
}

// --- Riders Tab ---

function renderRiders() {
  const container = document.getElementById('tab-riders');
  if (!container) return;

  if (!riderForm.place && state.places.length) riderForm.place = state.places[0];
  if (!riderForm.time  && state.times.length)  riderForm.time  = state.times[0];

  const placeOptions = state.places.map(p =>
    `<option value="${p}" ${riderForm.place === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  const timeOptions = state.times.map(t =>
    `<option value="${t}" ${riderForm.time === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  const isEditing = riderEditIndex >= 0;

  container.innerHTML = `
    <div class="card">
      <div class="section-label">${isEditing ? '乗る人を編集' : '乗る人を追加'}</div>
      <div class="field">
        <label>名前</label>
        <input type="text" id="r-name" placeholder="名前を入力" value="${riderForm.name}">
      </div>
      <div class="field">
        <label>集合場所</label>
        <select id="r-place">${state.places.length ? placeOptions : '<option>先に場所を設定してください</option>'}</select>
      </div>
      <div class="field">
        <label>集合時間</label>
        <select id="r-time">${state.times.length ? timeOptions : '<option>先に時間を設定してください</option>'}</select>
      </div>
      <div class="field">
        <label>グループ</label>
        <div class="toggle-pair">
          <div class="tog ${!riderForm.priority ? 'on-normal' : ''}" id="r-tog-normal">通常</div>
          <div class="tog ${riderForm.priority ? 'on-priority' : ''}" id="r-tog-priority">優先</div>
        </div>
      </div>
      ${riderFormError ? `<div class="form-error">${riderFormError}</div>` : ''}
      <button class="btn btn-primary btn-full" id="btn-add-rider">${isEditing ? '更新する' : '登録する'}</button>
      ${isEditing ? `<button class="btn btn-full" id="btn-cancel-rider" style="margin-top:6px">キャンセル</button>` : ''}
    </div>
    <div class="card">
      <div class="section-label">一括入力</div>
      <div style="font-size:12px;color:#888;margin-bottom:8px">名前, 場所, 時間（時間は省略可）を1行1人で入力</div>
      <textarea id="bulk-input" rows="5" placeholder="例：&#10;田中, 駅前, 9:00&#10;鈴木, 公園&#10;佐藤, 駅前, 10:30"></textarea>
      ${bulkResult ? `<div class="${bulkResult.hasError ? 'bulk-result-error' : 'bulk-result-ok'}">${escHtml(bulkResult.message)}</div>` : ''}
      <button class="btn btn-primary btn-full" id="btn-bulk-add" style="margin-top:8px">まとめて登録</button>
    </div>
    <div class="card">
      <div class="list-header">
        <span class="list-header-title">登録済みの乗る人</span>
        <span class="count-badge">${state.riders.length}人</span>
      </div>
      ${state.riders.length === 0 ? '<div class="empty">まだ登録されていません</div>' :
        state.riders.map((r, i) => `
          <div class="person-item ${i === riderEditIndex ? 'item-editing' : ''}">
            <div class="avatar ${r.priority ? 'av-priority' : 'av-normal'}">${getInitials(r.name)}</div>
            <div class="person-info">
              <div class="person-name">${r.name}<span class="badge ${r.priority ? 'bd-priority' : 'bd-normal'}">${r.priority ? '優先' : '通常'}</span></div>
              <div class="person-meta">${r.place}・${r.time}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-edit btn-edit-rider" data-index="${i}">編集</button>
              <button class="btn btn-danger btn-del-rider" data-index="${i}">削除</button>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;

  const inputName = container.querySelector('#r-name');
  container.querySelector('#r-place').onchange = (e) => { riderForm.place = e.target.value; };
  container.querySelector('#r-time').onchange  = (e) => { riderForm.time  = e.target.value; };
  container.querySelector('#r-tog-normal').onclick   = () => { riderForm.priority = false; renderRiders(); };
  container.querySelector('#r-tog-priority').onclick = () => { riderForm.priority = true;  renderRiders(); };
  container.querySelector('#btn-add-rider').onclick = () => addRider(inputName.value);
  inputName.onkeydown = (e) => { if (e.key === 'Enter') addRider(inputName.value); };

  if (isEditing) {
    container.querySelector('#btn-cancel-rider').onclick = () => {
      riderEditIndex = -1;
      riderFormError = '';
      riderForm.name = '';
      renderRiders();
    };
  }

  container.querySelectorAll('.btn-edit-rider').forEach(btn => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.index);
      const r = state.riders[i];
      riderEditIndex = i;
      riderFormError = '';
      riderForm.name     = r.name;
      riderForm.place    = r.place;
      riderForm.time     = r.time;
      riderForm.priority = r.priority;
      renderRiders();
      container.querySelector('#r-name').focus();
    };
  });

  container.querySelectorAll('.btn-del-rider').forEach(btn => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.index);
      if (riderEditIndex === i) {
        riderEditIndex = -1;
        riderFormError = '';
        riderForm.name = '';
      }
      state.riders.splice(i, 1);
      renderRiders();
    };
  });

  // 一括入力
  const bulkTextarea = container.querySelector('#bulk-input');
  if (bulkTextarea) {
    bulkTextarea.value = bulkInputText;
    bulkTextarea.oninput = (e) => { bulkInputText = e.target.value; };
  }
  container.querySelector('#btn-bulk-add').onclick = handleBulkAdd;
}

function handleBulkAdd() {
  if (!bulkInputText.trim()) return;

  const { valid, errors } = parseBulkRiders(bulkInputText, state.places, state.times);

  if (valid.length > 0) {
    state.riders.push(...valid);
    bulkInputText = '';
  }

  if (errors.length === 0) {
    bulkResult = { message: `${valid.length}人を登録しました`, hasError: false };
  } else {
    const skipped = errors.map(e => `「${e.line}」→ ${e.reason}`).join(' / ');
    bulkResult = {
      message: `${valid.length}人を登録 / ${errors.length}行スキップ: ${skipped}`,
      hasError: true
    };
  }

  // 次のレンダリングでメッセージを消すタイマー
  clearTimeout(handleBulkAdd._timer);
  handleBulkAdd._timer = setTimeout(() => { bulkResult = null; renderRiders(); }, 4000);

  renderRiders();
}

function addRider(val) {
  const name = val.trim();
  if (!name) {
    riderFormError = '名前を入力してください';
    renderRiders();
    return;
  }
  if (!state.places.length) {
    riderFormError = '先に集合場所を設定してください';
    renderRiders();
    return;
  }
  if (!state.times.length) {
    riderFormError = '先に集合時間を設定してください';
    renderRiders();
    return;
  }

  riderFormError = '';
  const entry = { ...riderForm, name };
  if (riderEditIndex >= 0) {
    state.riders[riderEditIndex] = entry;
    riderEditIndex = -1;
  } else {
    state.riders.push(entry);
  }
  riderForm.name = '';
  renderRiders();
}

// --- Result Tab ---

function renderResult() {
  const container = document.getElementById('tab-result');
  if (!container) return;

  if (!state.result) {
    container.innerHTML = `
      <div class="card">
        <div class="section-label">配車結果</div>
        <div class="empty" style="padding:36px 0">運転者と乗る人を登録してから<br>計算してください</div>
      </div>
      <button class="btn btn-primary btn-full" id="btn-calc">配車を計算する</button>
    `;
    container.querySelector('#btn-calc').onclick = doCalc;
    return;
  }

  const { placements, unmatchedRiders, unmatchedDrivers, standbyDrivers } = state.result;
  let html = '';

  placements.forEach((p, pIdx) => {
    const totalSeats = p.drivers.reduce((s, d) => s + d.seats, 0);
    const filledSeats = p.riders.length;
    const isFull = totalSeats > 0 && filledSeats >= totalSeats;

    html += `
      <div class="result-slot">
        <div class="result-slot-head">
          <span class="slot-pill">${p.slot.place}</span>
          <span class="slot-pill">${p.slot.time}</span>
          ${totalSeats > 0 ? `<span class="seat-fill ${isFull ? 'fill-full' : 'fill-partial'}">${filledSeats}/${totalSeats}席</span>` : ''}
        </div>
        ${p.drivers.length === 0 ? '<div class="no-driver-slot">運転者なし</div>' : `
          <div class="result-slot-body">
            ${p.drivers.map(d => `
              <div class="driver-line">
                <div class="car-icon">🚗</div>
                <span class="driver-name">${d.name}</span>
                <span class="driver-seats">${d.seats}名まで</span>
              </div>
            `).join('')}
            <div class="passenger-area drop-zone" data-dest-placement="${pIdx}">
              ${p.riders.length ? `
                <div class="passenger-wrap">
                  ${p.riders.map((r, rIdx) => `
                    <span class="pax-chip ${r.priority ? 'prio' : ''} draggable-rider"
                          draggable="true"
                          data-src-placement="${pIdx}"
                          data-src-type="rider"
                          data-rider-idx="${rIdx}">
                      ${r.name}${r.priority ? ' ★' : ''}
                    </span>
                  `).join('')}
                </div>
              ` : '<div class="no-riders-hint" data-idle="乗る人はいません" data-drag="ここにドロップ"></div>'}
            </div>
          </div>
          ${p.overflow.length ? `
            <div class="overflow-bar">
              <div class="overflow-label">乗り切れない人（${p.overflow.length}人）—— 別の車にドラッグして移動できます</div>
              <div class="overflow-chips">
                ${p.overflow.map((r, rIdx) => `
                  <span class="overflow-chip draggable-rider"
                        draggable="true"
                        data-src-placement="${pIdx}"
                        data-src-type="overflow"
                        data-rider-idx="${rIdx}">
                    ${r.name}
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
        `}
      </div>
    `;
  });

  if (unmatchedRiders && unmatchedRiders.length) {
    html += `
      <div class="unmatched-card">
        <div class="unmatched-head">未配車（条件不一致の乗る人：${unmatchedRiders.length}人）—— ドラッグして車に追加できます</div>
        <div class="unmatched-body">
          ${unmatchedRiders.map((r, rIdx) => `
            <span class="overflow-chip draggable-rider"
                  draggable="true"
                  data-src-placement="-1"
                  data-src-type="unmatched"
                  data-rider-idx="${rIdx}">
              ${r.name}（${r.place}・${r.time}）
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (standbyDrivers && standbyDrivers.length) {
    html += `
      <div class="unmatched-card" style="border-left-color: #3498db">
        <div class="unmatched-head" style="color: #2980b9">空きの運転者：${standbyDrivers.length}人</div>
        <div class="unmatched-body">
          ${standbyDrivers.map(d => `<span class="overflow-chip" style="background:#ebf5fb;color:#2980b9;border:1px solid #aed6f1">${d.name}（${d.place}・${d.time}）</span>`).join('')}
        </div>
      </div>
    `;
  }

  if (unmatchedDrivers && unmatchedDrivers.length) {
    html += `
      <div class="unmatched-card" style="border-left-color: #f39c12">
        <div class="unmatched-head" style="color: #d35400">未配置（条件不一致の運転者：${unmatchedDrivers.length}人）</div>
        <div class="unmatched-body">
          ${unmatchedDrivers.map(d => `<span class="overflow-chip" style="background:#fef5e7;color:#d35400;border:1px solid #f8c471">${d.name}（${d.place}・${d.time}）</span>`).join('')}
        </div>
      </div>
    `;
  }

  if (!html) html = '<div class="empty">全員配車済みです</div>';

  container.innerHTML = html + `
    <div class="action-row">
      <button class="btn btn-success" id="btn-recalc" style="flex:1;justify-content:center">再計算</button>
      <button class="btn" id="btn-copy" style="flex:1;justify-content:center">コピー</button>
    </div>
  `;

  container.querySelector('#btn-recalc').onclick = doCalc;
  container.querySelector('#btn-copy').onclick   = copyResult;

  // ドラッグ&ドロップ
  container.querySelectorAll('.draggable-rider').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragSource = {
        placementIndex: parseInt(el.dataset.srcPlacement),
        type:           el.dataset.srcType,
        riderIndex:     parseInt(el.dataset.riderIdx)
      };
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      document.body.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.body.classList.remove('is-dragging');
      container.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
    });
  });

  container.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      document.body.classList.remove('is-dragging');
      if (!dragSource) return;
      const destIdx = parseInt(zone.dataset.destPlacement);
      moveRider(state.result, dragSource, destIdx);
      dragSource = null;
      renderResult();
    });
  });
}

function doCalc() {
  if (!state.drivers.length) {
    showToast('運転者を登録してください', true);
    return;
  }
  if (!state.riders.length) {
    showToast('乗る人を登録してください', true);
    return;
  }
  state.result = calculateSchedule(state);
  switchTab('result');
}

function copyResult() {
  if (!state.result) return;
  const text = formatResultAsText(state.result);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('コピーしました'));
  }
}
