/* ui/volume.js — 环形音量控件（拖拽 + 步进），含乐观更新、失败回滚与音量区联动 */
(function (global) {
  'use strict';

  var RING_LEN = 540.35;          // 2 * PI * 86
  var RING_R = 86;
  var wrap = document.getElementById('ringWrap');
  var ringFg = document.getElementById('ringFg');
  var ringHead = document.getElementById('ringHead');
  var ringGlow = document.getElementById('ringGlow');
  var volNum = document.getElementById('volNum');
  var stepsEl = document.querySelector('.steps');
  var btnUp = document.getElementById('volUp');
  var btnDown = document.getElementById('volDown');

  var state = null;
  var dragging = false;
  var dragMoved = false;
  var lastNum = null;
  var lastOffset = null;
  var lastFail = null;
  var lastBusy = false;
  var lastDragging = false;
  var lastDir = null;            // 'up' | 'down' | null
  var lastApplied = null;
  var dirTimer = null;

  /* ---------- 联动状态同步 ----------
   * 环、数字、± 键三处外观都从状态推导，避免互相覆盖 className。
   */
  function syncRingWrap() {
    var cls = 'ring-wrap';
    if (lastDragging) cls += ' is-dragging';
    // 拖动期间不叠加「写入中」虚线环：手在环上时只留一个焦点
    if (lastBusy && !lastDragging) cls += ' is-busy';
    if (wrap.className !== cls) wrap.className = cls;
  }

  function syncSteps() {
    if (!stepsEl) return;
    var cls = 'steps';
    if (lastDragging) cls += ' is-live';
    if (lastDir) cls += ' is-' + lastDir;
    if (stepsEl.className !== cls) stepsEl.className = cls;
  }

  function syncNumClass() {
    var cls = 'vol-num';
    if (lastNum === '--') cls += ' is-empty';
    if (lastDragging) cls += ' is-active';
    if (volNum.className !== cls) volNum.className = cls;
  }

  function setDragging(on) {
    if (on === lastDragging) return;
    lastDragging = on;
    if (!on) lastDir = null;
    syncRingWrap();
    syncSteps();
    syncNumClass();
  }

  function setDirection(dir) {
    if (!dir || dir === lastDir) return;
    lastDir = dir;
    syncSteps();
  }

  function clearDirection(delay) {
    if (dirTimer) clearTimeout(dirTimer);
    dirTimer = setTimeout(function () {
      dirTimer = null;
      lastDir = null;
      syncSteps();
    }, delay || 260);
  }

  function fireBtn(btn) {
    if (!btn) return;
    btn.classList.remove('is-fire');
    void btn.offsetWidth;
    btn.classList.add('is-fire');
    setTimeout(function () { btn.classList.remove('is-fire'); }, 280);
  }

  /* 末端光点跟随填充弧的头部 */
  function setHead(fraction) {
    if (!ringHead) return;
    var ang = (-90 + fraction * 360) * Math.PI / 180;
    var x = (100 + RING_R * Math.cos(ang)).toFixed(2);
    var y = (100 + RING_R * Math.sin(ang)).toFixed(2);
    ringHead.setAttribute('cx', x);
    ringHead.setAttribute('cy', y);
    if (ringGlow) {
      ringGlow.setAttribute('cx', x);
      ringGlow.setAttribute('cy', y);
    }
  }

  function setRing(fraction) {
    if (fraction < 0) fraction = 0;
    if (fraction > 1) fraction = 1;
    var offset = RING_LEN * (1 - fraction);
    offset = Math.round(offset * 100) / 100;
    if (offset === lastOffset) return;
    lastOffset = offset;
    ringFg.style.strokeDashoffset = String(offset);
    setHead(fraction);
  }

  function setNum(txt) {
    if (lastNum === txt) return;
    lastNum = txt;
    volNum.textContent = txt;
    syncNumClass();
  }

  function setFail(isFail, isPending) {
    if (isFail === lastFail) {
      if (!isFail) return;
    }
    lastFail = isFail;
    var cls = 'ring-fg';
    if (isFail) cls += ' is-fail';
    else if (isPending) cls += ' is-pending';
    // SVGElement.className 是只读的 SVGAnimatedString，必须走 setAttribute
    ringFg.setAttribute('class', cls);
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

    // 写入中：外圈虚线环旋转，让「正在等回读校验」可见
    var busy = !!active && s.volState === 'pending';
    if (busy !== lastBusy) {
      lastBusy = busy;
      syncRingWrap();
    }

    if (!active) {
      setDragging(false);
      setNum('--');
      setRing(0);
      setFail(false, false);
      btnUp.disabled = true;
      btnDown.disabled = true;
      return;
    }

    var v = s.pending !== null && s.pending !== undefined ? s.pending : s.volume.cur;
    setNum(v === null || v === undefined ? '--' : String(Math.round(v)));
    setRing(currentFraction());

    var fail = s.volState === 'fail';
    var pending = s.volState === 'pending';
    setFail(fail, pending);

    var canWrite = s.caps && s.caps.volume;
    btnUp.disabled = !canWrite;
    btnDown.disabled = !canWrite;
  }

  /* ---- 环形拖拽 ---- */
  function angleToFraction(clientX, clientY) {
    var rect = wrap.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dx = clientX - cx;
    var dy = clientY - cy;
    var a = global.Math.atan2(dx, -dy);   // 0 在正上方，顺时针为正
    if (a < 0) a += global.Math.PI * 2;
    return a / (global.Math.PI * 2);
  }

  function fractionToValue(f) {
    if (!state || !state.volume.max) return null;
    var v = Math.round(f * state.volume.max);
    if (v < 0) v = 0;
    if (v > state.volume.max) v = state.volume.max;
    return v;
  }

  function applyPointer(clientX, clientY) {
    var v = fractionToValue(angleToFraction(clientX, clientY));
    if (v === null) return;
    dragMoved = true;

    // 方向只用来点亮 ± 键，不参与取值
    if (lastApplied !== null && v !== lastApplied) {
      setDirection(v > lastApplied ? 'up' : 'down');
    }
    lastApplied = v;

    if (global.DacUI && global.DacUI.volumeApi) global.DacUI.volumeApi.requestVolume(v);
  }

  function onDown(e) {
    if (!state || !state.caps || !state.caps.volume) return;
    if (state.link !== 'connected' && state.link !== 'degraded') return;
    dragging = true;
    dragMoved = false;
    lastApplied = null;
    setDragging(true);
    var p = e.touches ? e.touches[0] : e;
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
    dragMoved = false;
    lastApplied = null;
    setDragging(false);
  }

  function step(delta) {
    if (!state || !state.caps || !state.caps.volume) return;
    var base = state.pending !== null && state.pending !== undefined ? state.pending : state.volume.cur;
    if (base === null || base === undefined) return;
    var v = base + delta;
    if (v < 0) v = 0;
    if (state.volume.max && v > state.volume.max) v = state.volume.max;

    fireBtn(delta > 0 ? btnUp : btnDown);
    setDirection(delta > 0 ? 'up' : 'down');
    clearDirection(260);

    if (global.DacUI && global.DacUI.volumeApi) global.DacUI.volumeApi.requestVolume(v);
  }

  btnUp.addEventListener('click', function () { step(1); }, false);
  btnDown.addEventListener('click', function () { step(-1); }, false);

  if (global.PointerEvent) {
    wrap.addEventListener('pointerdown', onDown, false);
    // 移动/松手绑在 window 上：旋转时手指划出环外也能继续跟随，不会卡住
    global.addEventListener('pointermove', onMove, false);
    global.addEventListener('pointerup', onUp, false);
    global.addEventListener('pointercancel', onUp, false);
  } else {
    wrap.addEventListener('touchstart', onDown, false);
    global.addEventListener('touchmove', onMove, false);
    global.addEventListener('touchend', onUp, false);
    global.addEventListener('touchcancel', onUp, false);
    wrap.addEventListener('mousedown', function (e) {
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
  global.DacUI.volume = { render: render, step: step };
})(window);
