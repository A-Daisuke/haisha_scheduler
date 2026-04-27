/**
 * UIレンダリングとインタラクション
 */
import { state, driverForm, riderForm, saveState, clearAllData } from './state.js';
import { calculateSchedule, formatResultAsText } from './scheduler.js';

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
    case 'setup':
      renderSetup();
      break;
    case 'drivers':
      renderDrivers();
      break;
    case 'riders':
      renderRiders();
      break;
    case 'result':
      renderResult();
      break;
  }
}

/**
 * 名前からイニシャルを取得
 */
function getInitials(name) {
  return name ? name.slice(0, 2) : '??';
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
        <div class="stat-label">乗客</div>
        <div class="stat-val">${state.riders.length}<span class="stat-unit"> 人</span></div>
      </div>
    </div>
    <div style="margin-top: 20px; text-align: center;">
      <button class="btn btn-danger" id="btn-clear-all" style="opacity: 0.6; font-size: 11px; padding: 4px 12px;">履歴をすべてリセットする</button>
    </div>
  `;

  // イベントリスナーの紐付け
  container.querySelector('#btn-add-place').onclick = addPlace;
  container.querySelector('#btn-add-time').onclick = addTime;
  container.querySelector('#input-place').oninput = (e) => state.newPlaceInput = e.target.value;
  container.querySelector('#input-time').oninput = (e) => state.newTimeInput = e.target.value;
  container.querySelector('#input-place').onkeydown = (e) => e.key === 'Enter' && addPlace();
  container.querySelector('#input-time').onkeydown = (e) => e.key === 'Enter' && addTime();
  
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

function addPlace() {
  const v = state.newPlaceInput.trim();
  if (v && !state.places.includes(v)) {
    state.places.push(v);
    state.newPlaceInput = '';
    saveState();
    renderSetup();
  }
}

function addTime() {
  const v = state.newTimeInput.trim();
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
  if (!driverForm.time && state.times.length) driverForm.time = 'いつでも';

  const placeOptions = ['どこでも', ...state.places].map(p => 
    `<option value="${p}" ${driverForm.place === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  const timeOptions = ['いつでも', ...state.times].map(t => 
    `<option value="${t}" ${driverForm.time === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  container.innerHTML = `
    <div class="card">
      <div class="section-label">運転者を追加</div>
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
      <button class="btn btn-primary btn-full" id="btn-add-driver">登録する</button>
    </div>
    <div class="card">
      <div class="list-header">
        <span class="list-header-title">登録済み運転者</span>
        <span class="count-badge">${state.drivers.length}人</span>
      </div>
      ${state.drivers.length === 0 ? '<div class="empty">まだ登録されていません</div>' : 
        state.drivers.map((d, i) => `
          <div class="person-item">
            <div class="avatar av-driver">${getInitials(d.name)}</div>
            <div class="person-info">
              <div class="person-name">${d.name}<span class="badge bd-driver">運転者</span></div>
              <div class="person-meta">${d.place}・${d.time}・乗客${d.seats}名</div>
            </div>
            <button class="btn btn-danger btn-del-driver" data-index="${i}">削除</button>
          </div>
        `).join('')
      }
    </div>
  `;

  // イベントリスナー
  container.querySelector('#d-name').oninput = (e) => driverForm.name = e.target.value;
  container.querySelector('#d-place').onchange = (e) => driverForm.place = e.target.value;
  container.querySelector('#d-time').onchange = (e) => driverForm.time = e.target.value;
  container.querySelector('#d-minus').onclick = () => {
    driverForm.seats = Math.max(1, driverForm.seats - 1);
    renderDrivers();
  };
  container.querySelector('#d-plus').onclick = () => {
    driverForm.seats = Math.min(15, driverForm.seats + 1);
    renderDrivers();
  };
  container.querySelector('#btn-add-driver').onclick = addDriver;
  container.querySelectorAll('.btn-del-driver').forEach(btn => {
    btn.onclick = () => {
      state.drivers.splice(parseInt(btn.dataset.index), 1);
      renderDrivers();
    };
  });
}

function addDriver() {
  if (!driverForm.name.trim()) { alert('名前を入力してください'); return; }
  if (!state.places.length) { alert('先に集合場所を設定してください'); return; }
  if (!state.times.length) { alert('先に集合時間を設定してください'); return; }
  
  state.drivers.push({ ...driverForm, name: driverForm.name.trim() });
  driverForm.name = '';
  renderDrivers();
}

// --- Riders Tab ---

function renderRiders() {
  const container = document.getElementById('tab-riders');
  if (!container) return;

  if (!riderForm.place && state.places.length) riderForm.place = state.places[0];
  if (!riderForm.time && state.times.length) riderForm.time = state.times[0];

  const placeOptions = state.places.map(p => 
    `<option value="${p}" ${riderForm.place === p ? 'selected' : ''}>${p}</option>`
  ).join('');

  const timeOptions = state.times.map(t => 
    `<option value="${t}" ${riderForm.time === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  container.innerHTML = `
    <div class="card">
      <div class="section-label">乗客を追加</div>
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
      <button class="btn btn-primary btn-full" id="btn-add-rider">登録する</button>
    </div>
    <div class="card">
      <div class="list-header">
        <span class="list-header-title">登録済み乗客</span>
        <span class="count-badge">${state.riders.length}人</span>
      </div>
      ${state.riders.length === 0 ? '<div class="empty">まだ登録されていません</div>' : 
        state.riders.map((r, i) => `
          <div class="person-item">
            <div class="avatar ${r.priority ? 'av-priority' : 'av-normal'}">${getInitials(r.name)}</div>
            <div class="person-info">
              <div class="person-name">${r.name}<span class="badge ${r.priority ? 'bd-priority' : 'bd-normal'}">${r.priority ? '優先' : '通常'}</span></div>
              <div class="person-meta">${r.place}・${r.time}</div>
            </div>
            <button class="btn btn-danger btn-del-rider" data-index="${i}">削除</button>
          </div>
        `).join('')
      }
    </div>
  `;

  // イベントリスナー
  container.querySelector('#r-name').oninput = (e) => riderForm.name = e.target.value;
  container.querySelector('#r-place').onchange = (e) => riderForm.place = e.target.value;
  container.querySelector('#r-time').onchange = (e) => riderForm.time = e.target.value;
  container.querySelector('#r-tog-normal').onclick = () => { riderForm.priority = false; renderRiders(); };
  container.querySelector('#r-tog-priority').onclick = () => { riderForm.priority = true; renderRiders(); };
  container.querySelector('#btn-add-rider').onclick = addRider;
  container.querySelectorAll('.btn-del-rider').forEach(btn => {
    btn.onclick = () => {
      state.riders.splice(parseInt(btn.dataset.index), 1);
      renderRiders();
    };
  });
}

function addRider() {
  if (!riderForm.name.trim()) { alert('名前を入力してください'); return; }
  if (!state.places.length) { alert('先に集合場所を設定してください'); return; }
  if (!state.times.length) { alert('先に集合時間を設定してください'); return; }
  
  state.riders.push({ ...riderForm, name: riderForm.name.trim() });
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
        <div class="empty" style="padding:36px 0">運転者と乗客を登録してから<br>計算してください</div>
      </div>
      <button class="btn btn-primary btn-full" id="btn-calc">配車を計算する</button>
    `;
    container.querySelector('#btn-calc').onclick = doCalc;
    return;
  }

  const { placements, unmatchedRiders, unmatchedDrivers, standbyDrivers } = state.result;
  let html = '';

  placements.forEach(p => {
    html += `
      <div class="result-slot">
        <div class="result-slot-head">
          <span class="slot-pill">${p.slot.place}</span>
          <span class="slot-pill">${p.slot.time}</span>
        </div>
        ${p.drivers.length === 0 ? '<div class="no-driver-slot">運転者なし</div>' : `
          <div class="result-slot-body">
            ${p.drivers.map(d => `
              <div class="driver-line">
                <div class="car-icon">🚗</div>
                <span class="driver-name">${d.name}</span>
                <span class="driver-seats">乗客${d.seats}名まで</span>
              </div>
            `).join('')}
            ${p.riders.length ? `
              <div class="passenger-wrap">
                ${p.riders.map(r => `<span class="pax-chip ${r.priority ? 'prio' : ''}">${r.name}${r.priority ? ' ★' : ''}</span>`).join('')}
              </div>
            ` : '<div style="font-size:13px;color:#bbb;margin-top:6px">乗客なし</div>'}
          </div>
          ${p.overflow.length ? `
            <div class="overflow-bar">
              <div class="overflow-label">乗り切れない（${p.overflow.length}人）</div>
              <div class="overflow-chips">
                ${p.overflow.map(r => `<span class="overflow-chip">${r.name}</span>`).join('')}
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
        <div class="unmatched-head">未配車（条件不一致の乗客：${unmatchedRiders.length}人）</div>
        <div class="unmatched-body">
          ${unmatchedRiders.map(r => `<span class="overflow-chip">${r.name}（${r.place}・${r.time}）</span>`).join('')}
        </div>
      </div>
    `;
  }

  if (standbyDrivers && standbyDrivers.length) {
    html += `
      <div class="unmatched-card" style="border-left-color: #3498db">
        <div class="unmatched-head" style="color: #2980b9">待機中（余剰の運転者：${standbyDrivers.length}人）</div>
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
    <div id="copy-area" style="display:none">
      <textarea id="result-text" rows="10" readonly></textarea>
    </div>
  `;

  // イベントリスナー
  container.querySelector('#btn-recalc').onclick = doCalc;
  container.querySelector('#btn-copy').onclick = (e) => copyResult(e.target);
}

function doCalc() {
  if (!state.drivers.length) { alert('運転者を登録してください'); return; }
  if (!state.riders.length) { alert('乗客を登録してください'); return; }
  
  state.result = calculateSchedule(state);
  renderResult();
}

function copyResult(btn) {
  if (!state.result) return;
  
  const text = formatResultAsText(state.result);
  const area = document.getElementById('copy-area');
  const ta = document.getElementById('result-text');
  
  if (area && ta) {
    area.style.display = 'block';
    ta.value = text;
    ta.select();
  }
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = btn.textContent;
      btn.textContent = 'コピー完了';
      setTimeout(() => btn.textContent = originalText, 2000);
    });
  }
}
