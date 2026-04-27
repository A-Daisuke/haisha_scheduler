/**
 * アプリケーションのエントリーポイント
 */
import { initState } from './state.js';
import { switchTab, render } from './ui.js';

// グローバルスコープにswitchTabを公開（HTMLのonclick属性から呼び出すため）
// 本来はaddEventListenerを使うのが良いが、既存のHTML構造を活かす
window.switchTab = switchTab;

document.addEventListener('DOMContentLoaded', () => {
  initState();
  render();
});
