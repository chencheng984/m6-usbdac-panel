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
  var probe = document.getElementById('volProbe');
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

  /* 条形填充高度 = 音量比例；旋钮中心严格落在填充顶端。
   * 旋钮位置走 transform（--knob-y）而不是 top：拖动时每帧只触发合成，
   * 不做布局重排，低端机上更跟手。 */
  function setBar(fraction) {
    if (fraction < 0) fraction = 0;
    if (fraction > 1) fraction = 1;
    var pct = Math.round(fraction * 1000) / 10;
    if (pct === lastPct) return;
    lastPct = pct;

    fill.style.height = pct + '%';

    // 不做 clamp：0% 时旋钮中心在轨道底部、100% 时在顶部，各自半悬在外。
    // 之前 clamp 到 KNOB/2，两端各差 14px —— 就是「旋钮不跟条」的来源。
    // 商用滑条（iOS 音量 HUD / Material Slider）都是 thumb 中心 = 填充末端。
    var center = RAIL_H * (1 - fraction);
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

  /* ---- 沿轨道拖拽 ----
   * 竖屏时整页会被 rotate(90deg) 渲染，所以「视觉上下」并不等于页面坐标的 Y 轴。
   * 这里不改旋转策略，而是用轨道「音量 100」端的探针实测方向，把手势
   * 投影到轨道的长轴上——旋转多少度、缩放多少都成立。
   */
  function railAxis() {
    var r = rail.getBoundingClientRect();
    var p = probe.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var dx = (p.left + p.width / 2) - cx;
    var dy = (p.top + p.height / 2) - cy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0.5)) {
      // 探针测不到时退化为「竖直向上」的保守方向
      dx = 0;
      dy = -1;
      len = (r.height / 2) || 1;
    }
    return { cx: cx, cy: cy, dx: dx / len, dy: dy / len, half: len };
  }

  function sampleFromPointer(clientX, clientY) {
    var a = railAxis();
    // t = +1 在音量 100 端，t = -1 在 0 端
    var t = ((clientX - a.cx) * a.dx + (clientY - a.cy) * a.dy) / a.half;

    var over = 0;
    if (t > 1) over = -(t - 1) * a.half;        // 越过 100 端：旋钮往 100 方向拉一点
    else if (t < -1) over = (-1 - t) * a.half;  // 越过 0 端

    var f = (t + 1) / 2;
    if (f < 0) f = 0;
    if (f > 1) f = 1;
    return { f: f, over: over, t: t };
  }

  function fractionToValue(f) {
    if (!state || !state.volume.max) return null;
    var v = Math.round(f * state.volume.max);
    if (v < 0) v = 0;
    if (v > state.volume.max) v = state.volume.max;
    return v;
  }

  function applyPointer(clientX, clientY) {
    var s = sampleFromPointer(clientX, clientY);
    setOver(s.over);

    var v = fractionToValue(s.f);
    if (v === null) return;

    // 视觉直接吸附到「整数音量」的位置：系统回读的是整数，这样松手后
    // 条和旋钮不会被回读值拽一下（商用滑条的 snap-to-step 做法）。
    var shown = state.volume.max ? (v / state.volume.max) : s.f;
    setBar(shown);
    if (lastNum !== String(v)) setNum(String(v));

    if (global.DacUI && global.DacUI.volumeApi) global.DacUI.volumeApi.requestVolume(v);
  }

  function onDown(e) {
    if (!state || !state.caps || !state.caps.volume) return;

    var p = e.touches ? e.touches[0] : e;
    var s = sampleFromPointer(p.clientX, p.clientY);
    // 热区扩到整张卡，但只接受沿轨道方向落在轨道附近的手势：
    // 数字区域在轨道外侧，若也算进来，点数字会把音量直接打到 0。
    if (s.t > 1.15 || s.t < -1.15) {
      return;
    }

    dragging = true;
    setDragging(true);
    haptic(8);
    applyPointer(p.clientX, p.clientY);
    if (e.preventDefault) e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    applyPointer(p.clientX, p.clientY);
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
