/* ui/topbar.js — 顶栏状态胶囊
 * 正常/断开状态不再占用右上角（断开有全屏遮罩），只在「检测中 / 通信中断 / 异常」
 * 这类需要用户注意的状态下才出现。
 */
(function (global) {
  'use strict';

  var pill = document.getElementById('linkPill');
  var text = document.getElementById('linkText');
  var lastClass = '';
  var lastText = '';

  function render(s) {
    var cls = 'pill';
    var label = '';

    if (s.link === 'connected') {
      // DAC 正常工作时右上角留空：状态由音量区与底部数据源角标表达
      cls = 'pill hidden';
    } else if (s.link === 'disconnected') {
      // 断开由全屏遮罩承担提示，胶囊让位
      cls = 'pill hidden';
    } else if (s.link === 'detecting') {
      cls += ' pill--busy';
      label = '检测中';
    } else if (s.link === 'degraded') {
      cls += ' pill--warn';
      label = '通信中断';
    } else if (s.link === 'error') {
      cls += ' pill--warn';
      label = '异常';
    }

    if (cls !== lastClass) {
      pill.className = cls;
      lastClass = cls;
    }
    if (label !== lastText) {
      text.textContent = label;
      lastText = label;
    }
  }

  global.DacUI = global.DacUI || {};
  global.DacUI.topbar = { render: render };
})(window);
