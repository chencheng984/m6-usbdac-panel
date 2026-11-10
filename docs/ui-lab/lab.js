/* ============================================================
   docs/ui-lab/lab.js — 实验室交互
   刻意使用 ES5 写法（var / function），与 web/js 现有代码风格一致，
   顺便验证在 Android 7.1.1 WebView（Chromium 51）上可直接运行。
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     1 · Split-Flap 翻牌
     ============================================================ */
  var FLAP_MS = 240;

  function buildFlap() {
    var ids = ['fd0', 'fd1', 'fd2'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      el.innerHTML =
        '<div class="half top"><span class="g"></span></div>' +
        '<div class="half bottom"><span class="g"></span></div>' +
        '<div class="leaf leaf-t"><span class="g"></span></div>' +
        '<div class="leaf leaf-b"><span class="g"></span></div>';
      el._v = '';
    }
  }

  function glyphOf(digitEl, cls) {
    var node = digitEl.querySelector('.' + cls + ' .g');
    return node || null;
  }

  function clearDigit(digitEl) {
    var all = digitEl.querySelectorAll('.g');
    for (var i = 0; i < all.length; i++) all[i].textContent = '';
    digitEl._v = ' ';
  }

  function setDigit(digitEl, ch, delay) {
    if (digitEl._v === ch) return;
    var old = digitEl._v;
    digitEl._v = ch;

    digitEl.classList.remove('is-empty');

    var ht = glyphOf(digitEl, 'top');
    var hb = glyphOf(digitEl, 'bottom');
    var lt = glyphOf(digitEl, 'leaf-t');
    var lb = glyphOf(digitEl, 'leaf-b');

    if (old === '') {                     // 首次出现：直接落位
      ht.textContent = ch;
      hb.textContent = ch;
      return;
    }

    setTimeout(function () {
      if (old === ' ') {                  // 从空牌翻出来：先落位再翻
        ht.textContent = ch;
        hb.textContent = ch;
      }
      lt.textContent = ch;
      lb.textContent = old === ' ' ? '' : old;

      lt.parentNode.style.opacity = '1';
      lb.parentNode.style.opacity = '1';
      digitEl.classList.remove('flipping');
      lt.parentNode.style.transition = 'none';
      lb.parentNode.style.transition = 'none';
      lt.parentNode.style.transform = 'rotateX(90deg)';
      lb.parentNode.style.transform = 'rotateX(0deg)';

      void digitEl.offsetWidth;           // 强制 reflow

      digitEl.classList.add('flipping');
      lt.parentNode.style.transition = '';
      lb.parentNode.style.transition = '';
      lt.parentNode.style.transform = 'rotateX(0deg)';
      lb.parentNode.style.transform = 'rotateX(-90deg)';

      setTimeout(function () {
        digitEl.classList.remove('flipping');
        ht.textContent = ch;
        hb.textContent = ch;
        lt.parentNode.style.opacity = '0';
        lb.parentNode.style.opacity = '0';
        lt.parentNode.style.transform = 'rotateX(90deg)';
        lb.parentNode.style.transform = 'rotateX(0deg)';
      }, FLAP_MS + 30);
    }, delay || 0);
  }

  function setFlapValue(val) {
    var s = String(val);
    while (s.length < 3) s = ' ' + s;
    for (var i = 0; i < 3; i++) {
      var el = document.getElementById('fd' + i);
      if (!el) continue;
      var ch = s.charAt(i);
      if (ch === ' ') {
        if (el._v !== ' ') {
          el.classList.add('is-empty');
          clearDigit(el);
        }
      } else {
        setDigit(el, ch, i * 55);
      }
    }
  }

  buildFlap();
  setFlapValue(96);

  var flapBtns = document.querySelectorAll('[data-flap]');
  for (var f = 0; f < flapBtns.length; f++) {
    flapBtns[f].addEventListener('click', function () {
      setFlapValue(this.getAttribute('data-flap'));
    }, false);
  }

  /* ============================================================
     2 · Comet Dial
     ============================================================ */
  var RING = 540.35;                      // 2 * PI * 86
  var dialFrac = 0.42;
  var dialArc = document.getElementById('dialArc');
  var dialTail = document.getElementById('dialTail');
  var dialHead = document.getElementById('dialHead');
  var dialGlow = document.getElementById('dialGlow');
  var dialNum = document.getElementById('dialNum');
  var dialWrap = document.getElementById('dialWrap');

  function renderDial() {
    var p = dialFrac < 0 ? 0 : (dialFrac > 1 ? 1 : dialFrac);
    var filled = RING * p;

    dialArc.style.strokeDashoffset = String(RING - filled);
    dialTail.style.strokeDashoffset = String(74 - filled);

    var ang = (-90 + p * 360) * Math.PI / 180;
    var x = (100 + 86 * Math.cos(ang)).toFixed(2);
    var y = (100 + 86 * Math.sin(ang)).toFixed(2);
    dialHead.setAttribute('cx', x);
    dialHead.setAttribute('cy', y);
    dialGlow.setAttribute('cx', x);
    dialGlow.setAttribute('cy', y);

    dialNum.textContent = String(Math.round(p * 100));
  }

  function dialFromPoint(clientX, clientY) {
    var rect = dialWrap.getBoundingClientRect();
    var dx = clientX - (rect.left + rect.width / 2);
    var dy = clientY - (rect.top + rect.height / 2);
    var a = Math.atan2(dx, -dy);
    if (a < 0) a += Math.PI * 2;
    dialFrac = a / (Math.PI * 2);
    renderDial();
  }

  var dialDrag = false;
  function dialDown(e) {
    dialDrag = true;
    var pt = e.touches ? e.touches[0] : e;
    dialFromPoint(pt.clientX, pt.clientY);
    if (e.preventDefault) e.preventDefault();
  }
  function dialMove(e) {
    if (!dialDrag) return;
    var pt = e.touches ? e.touches[0] : e;
    dialFromPoint(pt.clientX, pt.clientY);
    if (e.preventDefault) e.preventDefault();
  }
  function dialUp() { dialDrag = false; }

  if (dialWrap) {
    if (window.PointerEvent) {
      dialWrap.addEventListener('pointerdown', dialDown, false);
      window.addEventListener('pointermove', dialMove, false);
      window.addEventListener('pointerup', dialUp, false);
    } else {
      dialWrap.addEventListener('mousedown', dialDown, false);
      window.addEventListener('mousemove', dialMove, false);
      window.addEventListener('mouseup', dialUp, false);
      dialWrap.addEventListener('touchstart', dialDown, false);
      window.addEventListener('touchmove', dialMove, false);
      window.addEventListener('touchend', dialUp, false);
    }
    renderDial();
  }

  var dialBtns = document.querySelectorAll('[data-dial]');
  for (var d = 0; d < dialBtns.length; d++) {
    dialBtns[d].addEventListener('click', function () {
      var dv = parseInt(this.getAttribute('data-dial'), 10);
      if (dv === 0) dialFrac = 0;
      else dialFrac = Math.max(0, Math.min(1, dialFrac + dv / 100));
      renderDial();
    }, false);
  }

  /* ============================================================
     3 · Odometer
     ============================================================ */
  var odoVal = 42;

  function buildOdo() {
    for (var i = 0; i < 3; i++) {
      var el = document.getElementById('oc' + i);
      if (!el) continue;
      var html = '<div class="odo-strip">';
      for (var n = 0; n <= 9; n++) html += '<span>' + n + '</span>';
      html += '</div>';
      el.innerHTML = html;
    }
  }

  function renderOdo(v) {
    var s = String(v);
    while (s.length < 3) s = ' ' + s;
    for (var i = 0; i < 3; i++) {
      var el = document.getElementById('oc' + i);
      if (!el) continue;
      var ch = s.charAt(i);
      if (ch === ' ') {
        el.className = 'odo-col is-off';
      } else {
        el.className = 'odo-col';
        el.querySelector('.odo-strip').style.transform =
          'translateY(-' + (parseInt(ch, 10) * 50) + 'px)';
      }
    }
  }

  buildOdo();
  renderOdo(odoVal);

  var odoBtns = document.querySelectorAll('[data-odo]');
  for (var o = 0; o < odoBtns.length; o++) {
    odoBtns[o].addEventListener('click', function () {
      var dv = parseInt(this.getAttribute('data-odo'), 10);
      odoVal = Math.max(0, Math.min(100, odoVal + dv));
      renderOdo(odoVal);
    }, false);
  }

  var odoTimer = null;
  var odoAuto = document.getElementById('odoAuto');
  if (odoAuto) {
    odoAuto.addEventListener('click', function () {
      if (odoTimer) {
        clearInterval(odoTimer);
        odoTimer = null;
        odoAuto.textContent = '自动演示';
        return;
      }
      odoAuto.textContent = '停止演示';
      odoTimer = setInterval(function () {
        odoVal = odoVal >= 100 ? 22 : odoVal + 3;
        renderOdo(odoVal);
      }, 520);
    }, false);
  }

  /* ============================================================
     4 · 流光描边 暂停
     ============================================================ */
  var mbRun = document.getElementById('mbRun');
  var mbToggle = document.getElementById('mbToggle');
  var mbPlaying = true;
  if (mbToggle && mbRun) {
    mbToggle.addEventListener('click', function () {
      mbPlaying = !mbPlaying;
      mbRun.style.animationPlayState = mbPlaying ? 'running' : 'paused';
      mbToggle.textContent = mbPlaying ? '暂停 / 播放' : '继续播放';
    }, false);
  }

  /* ============================================================
     5 · 按压聚光
     ============================================================ */
  var spotCard = document.getElementById('spotCard');
  var spot = document.getElementById('spot');
  var spotRim = document.getElementById('spotRim');

  function spotMove(clientX, clientY) {
    var rect = spotCard.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    spot.style.left = x + 'px';
    spot.style.top = y + 'px';
    spotRim.style.left = x + 'px';
    spotRim.style.top = y + 'px';
  }
  function spotShow() {
    spot.style.opacity = '1';
    spotRim.style.opacity = '1';
  }
  function spotHide() {
    spot.style.opacity = '0';
    spotRim.style.opacity = '0';
  }

  if (spotCard) {
    spotCard.addEventListener('mousedown', function (e) { spotShow(); spotMove(e.clientX, e.clientY); }, false);
    spotCard.addEventListener('mousemove', function (e) {
      if (spot.style.opacity === '1') spotMove(e.clientX, e.clientY);
    }, false);
    spotCard.addEventListener('mouseup', spotHide, false);
    spotCard.addEventListener('mouseleave', spotHide, false);
    spotCard.addEventListener('touchstart', function (e) {
      var pt = e.touches[0];
      spotShow();
      spotMove(pt.clientX, pt.clientY);
      if (e.preventDefault) e.preventDefault();
    }, false);
    spotCard.addEventListener('touchmove', function (e) {
      var pt = e.touches[0];
      spotMove(pt.clientX, pt.clientY);
      if (e.preventDefault) e.preventDefault();
    }, false);
    spotCard.addEventListener('touchend', spotHide, false);
  }

  var spotDemo = document.getElementById('spotDemo');
  if (spotDemo && spotCard) {
    spotDemo.addEventListener('click', function () {
      var rect = spotCard.getBoundingClientRect();
      spotMove(rect.left + rect.width * 0.62, rect.top + rect.height * 0.42);
      spotShow();
      setTimeout(spotHide, 400);
    }, false);
  }

  /* ============================================================
     6 · 状态胶囊高亮轮转
     ============================================================ */
  var pillNodes = document.querySelectorAll('#pills .pill');
  var pillBtn = document.getElementById('pillBtn');
  var pillIdx = 0;
  if (pillBtn && pillNodes.length) {
    pillBtn.addEventListener('click', function () {
      for (var i = 0; i < pillNodes.length; i++) pillNodes[i].classList.remove('is-cur');
      pillIdx = (pillIdx + 1) % pillNodes.length;
      pillNodes[pillIdx].classList.add('is-cur');
    }, false);
  }

  /* ============================================================
     7 · 入场序列
     ============================================================ */
  function playEnter(dev) {
    if (!dev) return;
    dev.classList.remove('play');
    void dev.offsetWidth;
    dev.classList.add('play');
  }

  var device = document.getElementById('device');
  var miniDevice = document.getElementById('miniDevice');

  var enterReplay = document.getElementById('enterReplay');
  if (enterReplay) {
    enterReplay.addEventListener('click', function () { playEnter(device); }, false);
  }
  var enterBurst = document.getElementById('enterBurst');
  var burstTimer = null;
  if (enterBurst) {
    enterBurst.addEventListener('click', function () {
      if (burstTimer) {
        clearInterval(burstTimer);
        burstTimer = null;
        enterBurst.textContent = '每 3 秒循环';
        return;
      }
      enterBurst.textContent = '停止循环';
      playEnter(device);
      burstTimer = setInterval(function () { playEnter(device); }, 3000);
    }, false);
  }
  var miniReplay = document.getElementById('miniReplay');
  if (miniReplay) {
    miniReplay.addEventListener('click', function () { playEnter(miniDevice); }, false);
  }

  /* ============================================================
     8 · 数据刷新脉冲
     ============================================================ */
  var pulseCard = document.getElementById('pulseCard');
  var pulseVal = document.getElementById('pulseVal');
  var pulseBtn = document.getElementById('pulseBtn');
  var pulseSeq = 0;
  var pulseValues = [96, 48, 192, 44, 96];

  if (pulseBtn && pulseCard) {
    pulseBtn.addEventListener('click', function () {
      pulseSeq = (pulseSeq + 1) % pulseValues.length;
      pulseVal.innerHTML = pulseValues[pulseSeq] +
        '<span style="font-size:13px;color:#8A8F98"> kHz</span>';
      pulseCard.classList.remove('is-pulse');
      void pulseCard.offsetWidth;
      pulseCard.classList.add('is-pulse');
      setTimeout(function () { pulseCard.classList.remove('is-pulse'); }, 660);
    }, false);
  }

  /* ============================================================
     9 · 跑马灯
     ============================================================ */
  var marqInner = document.querySelector('.marq-inner');
  var marqToggle = document.getElementById('marqToggle');
  var marqPlaying = true;
  if (marqInner && marqToggle) {
    marqToggle.addEventListener('click', function () {
      marqPlaying = !marqPlaying;
      marqInner.style.animationPlayState = marqPlaying ? 'running' : 'paused';
      marqToggle.textContent = marqPlaying ? '暂停 / 播放' : '继续播放';
    }, false);
  }

  /* ============================================================
     10 · 待机遮罩 动画暂停
     ============================================================ */
  var usbToggle = document.getElementById('usbToggle');
  var usbPlaying = true;
  if (usbToggle) {
    usbToggle.addEventListener('click', function () {
      usbPlaying = !usbPlaying;
      var nodes = document.querySelectorAll('.usb-float, .usb-flow');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].style.animationPlayState = usbPlaying ? 'running' : 'paused';
      }
      usbToggle.textContent = usbPlaying ? '暂停 / 播放' : '继续播放';
    }, false);
  }

  /* ============================================================
     11 · 按钮 ripple
     ============================================================ */
  function rippleAt(btn, clientX, clientY) {
    var rect = btn.getBoundingClientRect();
    var x = clientX ? clientX - rect.left : rect.width / 2;
    var y = clientY ? clientY - rect.top : rect.height / 2;
    var size = Math.max(rect.width, rect.height) * 1.2;

    var span = document.createElement('span');
    span.className = 'rp';
    span.style.left = x + 'px';
    span.style.top = y + 'px';
    span.style.width = size + 'px';
    span.style.height = size + 'px';
    btn.appendChild(span);

    setTimeout(function () { span.className = 'rp go'; }, 0);
    setTimeout(function () {
      if (span.parentNode) span.parentNode.removeChild(span);
    }, 460);
  }

  var ripDown = document.getElementById('ripDown');
  var ripUp = document.getElementById('ripUp');
  function bindRipple(btn) {
    if (!btn) return;
    btn.addEventListener('mousedown', function (e) { rippleAt(btn, e.clientX, e.clientY); }, false);
    btn.addEventListener('touchstart', function (e) {
      var pt = e.touches[0];
      rippleAt(btn, pt.clientX, pt.clientY);
    }, false);
    btn.addEventListener('click', function () {
      if (window.PointerEvent) return;         // PointerEvent 下 mousedown 已触发
      rippleAt(btn, 0, 0);
    }, false);
  }
  bindRipple(ripDown);
  bindRipple(ripUp);

  var ripDemo = document.getElementById('ripDemo');
  if (ripDemo) {
    ripDemo.addEventListener('click', function () {
      if (ripDown) rippleAt(ripDown, 0, 0);
      setTimeout(function () { if (ripUp) rippleAt(ripUp, 0, 0); }, 140);
    }, false);
  }

  /* ============================================================
     12 · 写入中状态环
     ============================================================ */
  var pendWrap = document.getElementById('pendWrap');
  var pendTimer = null;

  function pendEnd() {
    if (!pendWrap) return;
    pendWrap.classList.remove('is-busy');
    pendWrap.classList.remove('is-fail');
  }

  var pendBtn = document.getElementById('pendBtn');
  if (pendBtn && pendWrap) {
    pendBtn.addEventListener('click', function () {
      if (pendTimer) clearTimeout(pendTimer);
      pendWrap.classList.remove('is-fail');
      pendWrap.classList.add('is-busy');
      pendTimer = setTimeout(pendEnd, 1200);
    }, false);
  }

  var pendFail = document.getElementById('pendFail');
  if (pendFail && pendWrap) {
    pendFail.addEventListener('click', function () {
      if (pendTimer) clearTimeout(pendTimer);
      pendWrap.classList.add('is-busy');
      pendWrap.classList.add('is-fail');
      pendTimer = setTimeout(pendEnd, 1600);
    }, false);
  }

  /* ============================================================
     首次加载：自动播一次入场序列
     ============================================================ */
  setTimeout(function () { playEnter(device); }, 320);
  setTimeout(function () { playEnter(miniDevice); }, 680);

})();
