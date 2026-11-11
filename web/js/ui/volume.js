/* ui/volume.js — 左侧竖直音量条 + 旋钮
 *
 * 交互按「流体界面」的原则做：
 *  · 按下即响应，拖动全程 1:1 跟手（拖动期间不做位置过渡）
 *  · 拖出轨道时给橡皮筋阻尼，不是硬停
 *  · 松手后等一次写入确认，成功则旋钮「落定」一下（commit 反馈）
 *  · 任何时刻都能被下一次按下打断，不锁输入
 *
 * 数据链路保持原样：乐观更新 → 设备写入 → 回读校验 → 失败回滚。
 */
(function (global) {
  'use strict';

  var RAIL_H = 176;               // 轨道高度（px，与 components.css 对齐）
  var KNOB = 28;                  // 旋钮直径
  var OVER_MAX = 8;               // 橡皮筋最大位移（px）

  var card = document.getElementById('volumeCard');
  var rail = document.getElementById('volRail');
  var fill = document.getElementById('volFill');
  var knob = document.getElementById('volKnob');
  var needle = document.getElementById('volNeedle');
  var volNum = document.getElementById('volNum');

  var state = null;
  var dragging = false;
  var lastNum = null;
  var lastPct = null;
  var lastBusy = false;
  var lastFail = false;
  var lastDragging = false;
  var lastOver = '0px';
  var knobBase = RAIL_H - KNOB;   // 音量 0 时旋钮的 y 偏移
  var overOffset = 0;             // 橡皮筋额外位移
  var awaitingCommit = false;
  var committed = false;
  var commitTimer = null;
  var awaitTimer = null;

  /* ---------- 外观全部由状态推导，避免互相覆盖 className ---------- */
  function syncCard() {
    var cls = 'card volume';
    if (lastDragging) cls += ' is-dragging';
    // 拖动期间不叠加「写入中」呼吸，手在条上时只留一个焦点
    if (lastBusy && !lastDragging) cls += ' is-busy';
    if (lastFail) cls += ' is-fail';
    if (committed) cls += ' is-committed';
    if (card.className !== cls) card.className = cls;
  }

  function syncNumClass() {
    var cls = 'vol-num';
    if (lastNum === '--') cls += ' is-empty';
    if (volNum.className !== cls) volNum.className = cls;
  }

  /* 触觉反馈：只在「抓住」和「落定」两个时刻各给一次极短振动。
   * 没有 VIBRATE 权限或设备不支持时静默失败。 */
  function haptic(ms) {
    try {
      if (global.navigator && global.navigator.vibrate) {
        global.navigator.vibrate(ms);
      }
    } catch (e) {
    }
  }

  function clearCommit() {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    if (committed) {
      committed = false;
      syncCard();
    }
  }

  /* 写入确认到达：旋钮落定一下。只在「松手之后的一次确认」触发，
   * 拖动过程中的每次成功都不触发——反馈多了就没有信号了。 */
  function commitPulse() {
    if (committed) return;
    committed = true;
    haptic(14);
    syncCard();
    commitTimer = setTimeout(function () {
      commitTimer = null;
      committed = false;
      syncCard();
    }, 360);
  }

  function setDragging(on) {
    if (on === lastDragging) return;
    lastDragging = on;
    if (on) clearCommit();        // 重新按下立刻接管，不等动画结束
    syncCard();
  }

  /* 橡皮筋位移合并进同一个 --knob-y：CSS 里不必写 calc(var()+var())，
   * 老内核（Chromium 51）也不会有兼容风险。 */
  function applyKnobY() {
    var y = knobBase + overOffset;
    knob.style.setProperty('--knob-y', y.toFixed(1) + 'px');
  }

  /* 橡皮筋：越界越远，位移渐近 OVER_MAX，不会无限跟出去 */
  function setOver(px) {
    var off = 0;
    if (px !== 0) {
      var a = px < 0 ? -px : px;
      off = (a * 40) / (40 + a);
      if (off > OVER_MAX) off = OVER_MAX;
      if (px < 0) off = -off;
    }
    var txt = off.toFixed(1) + 'px';
    if (txt === lastOver) return;
    lastOver = txt;
    overOffset = off;
    applyKnobY();
  }

  /* 条形填充高度 = 音量比例；旋钮中心对齐填充顶端。
   * 旋钮位置走 transform（--knob-y）而不是 top：拖动时每帧只触发合成，
   * 不做布局重排，低端机上更跟手。 */
  function setBar(fraction) {
    if (fraction < 0) fraction = 0;
    if (fraction > 1) fraction = 1;
    var pct = Math.round(fraction * 1000) / 10;
    if (pct === lastPct) return;
    lastPct = pct;

    fill.style.height = pct + '%';

    var center = RAIL_H * (1 - fraction);
    if (center < KNOB / 2) center = KNOB / 2;
    if (center > RAIL_H - KNOB / 2) center = RAIL_H - KNOB / 2;
    knobBase = center - KNOB / 2;
    applyKnobY();

    needle.style.transform = 'translateY(-1px) rotate(' + Math.round(fraction * 360) + 'deg)';
  }

  function setNum(txt) {
    if (lastNum === txt) return;
    lastNum = txt;
    volNum.textContent = txt;
    syncNumClass();
  }

  function currentFraction() {
    if (!state) return 0;
    var v = state.pending !== null && state.pending !== undefined ? state.pending : state.volume.cur;
    var max = state.volume.max;
    if (v === null || v === undefined || !max) return 0;
    return v / max;
  }

  function render(s) {
    state = s;
    var active = (s.link === 'connected' || s.link === 'degraded');

    var busy = !!active && s.volState === 'pending';
    var fail = !!active && s.volState === 'fail';
    if (busy !== lastBusy || fail !== lastFail) {
      lastBusy = busy;
      lastFail = fail;
      syncCard();
    }

    if (!active) {
      setDragging(false);
      setOver(0);
      setNum('--');
      setBar(0);
      awaitingCommit = false;
      return;
    }

    var v = s.pending !== null && s.pending !== undefined ? s.pending : s.volume.cur;
    setNum(v === null || v === undefined ? '--' : String(Math.round(v)));
    setBar(currentFraction());

    // 松手后的第一次确认 = commit
    if (awaitingCommit && !busy && !fail) {
      awaitingCommit = false;
      commitPulse();
    }
  }

  /* ---- 纵向拖拽 ---- */
  function sampleFromY(clientY) {
    var rect = rail.getBoundingClientRect();
    if (!rect.height) return { f: 0, over: 0 };
    var y = clientY - rect.top;
    var raw = 1 - y / rect.height;
    var over = 0;
    if (raw > 1) over = y - rect.height;      // 手指在轨道下方
    else if (raw < 0) over = y;               // 手指在轨道上方
    var f = raw < 0 ? 0 : (raw > 1 ? 1 : raw);
    return { f: f, over: over };
  }

  function fractionToValue(f) {
    if (!state || !state.volume.max) return null;
    var v = Math.round(f * state.volume.max);
    if (v < 0) v = 0;
    if (v > state.volume.max) v = state.volume.max;
    return v;
  }

  function applyPointer(clientY) {
    var p = sampleFromY(clientY);
    setOver(p.over);

    var v = fractionToValue(p.f);
    if (v === null) return;

    // 本地先画：不等 store 往返，逐帧直接更新，手感才跟得上手指
    setBar(p.f);
    if (lastNum !== String(v)) setNum(String(v));

    if (global.DacUI && global.DacUI.volumeApi) global.DacUI.volumeApi.requestVolume(v);
  }

  function onDown(e) {
    if (!state || !state.caps || !state.caps.volume) return;

    var p = e.touches ? e.touches[0] : e;
    // 热区扩展到整张卡，但垂直方向仍只认轨道范围：
    // 数字区域在轨道下方，若也算进来的话点数字会把音量直接点到 0。
    var rect = rail.getBoundingClientRect();
    if (p.clientY < rect.top - 10 || p.clientY > rect.bottom + 10) {
      return;
    }

    dragging = true;
    setDragging(true);
    haptic(8);
    applyPointer(p.clientY);
    if (e.preventDefault) e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    applyPointer(p.clientY);
    if (e.preventDefault) e.preventDefault();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    setDragging(false);
    setOver(0);

    // 松手即提交：写入若已确认就立刻给落定反馈；还在等就等一次确认。
    // 不能只依赖「下一次渲染」——数据稳定后可能根本没有下一次渲染。
    if (state && state.volState === 'ok') {
      commitPulse();
    } else {
      awaitingCommit = true;
      if (awaitTimer) clearTimeout(awaitTimer);
      awaitTimer = setTimeout(function () {
        awaitTimer = null;
        awaitingCommit = false;
      }, 1500);
    }
  }

  var hitArea = document.getElementById('volumeCard') || rail;

  if (global.PointerEvent) {
    hitArea.addEventListener('pointerdown', onDown, false);
    // 移动/松手绑在 window 上：手指划出条外也能继续跟随，不会卡住
    global.addEventListener('pointermove', onMove, false);
    global.addEventListener('pointerup', onUp, false);
    global.addEventListener('pointercancel', onUp, false);
  } else {
    hitArea.addEventListener('touchstart', onDown, false);
    // passive:false —— 拖动时要 preventDefault，避免系统把它当成滚动/下拉手势
    global.addEventListener('touchmove', onMove, { passive: false });
    global.addEventListener('touchend', onUp, false);
    global.addEventListener('touchcancel', onUp, false);
    hitArea.addEventListener('mousedown', function (e) {
      onDown(e);
      if (global.document.addEventListener) {
        global.document.addEventListener('mousemove', onMove, false);
        global.document.addEventListener('mouseup', onUpDoc, false);
      }
    }, false);
    function onUpDoc() {
      onUp();
      global.document.removeEventListener('mousemove', onMove, false);
      global.document.removeEventListener('mouseup', onUpDoc, false);
    }
  }

  global.DacUI = global.DacUI || {};
  global.DacUI.volume = { render: render };
})(window);
