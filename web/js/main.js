/* main.js — 装配：选源 / 状态机 / 音量闭环 / 缩放 / 遮罩 */
(function (global) {
  'use strict';

  var store = global.DacStore;
  var app = document.getElementById('app');
  var overlay = document.getElementById('overlay');
  var banner = document.getElementById('banner');
  var bannerText = document.getElementById('bannerText');
  var btnExit = document.getElementById('btnExit');
  var btnRecheck = document.getElementById('recheck');
  var stageEl = document.querySelector('.stage');

  var BASE_W = 640;
  var BASE_H = 360;

  var source = null;
  var isBridge = false;
  var volTimer = null;
  var volToken = 0;
  var ui = null;

  /* ---------- 诊断日志（出问题时可从外部读取） ---------- */
  var LOG = [];
  function log(msg, extra) {
    var line = msg + (extra !== undefined ? ' ' + safeStr(extra) : '');
    LOG.push(line);
    if (LOG.length > 60) LOG.shift();
  }
  function safeStr(v) {
    try {
      return typeof v === 'string' ? v : JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  }
  global.__dacLog = function () { return LOG.slice(); };

  /* ---------- URL 参数 ---------- */
  function parseQuery() {
    var out = {};
    var q = global.location.search;
    if (!q || q.length < 2) return out;
    q = q.substring(1).split('&');
    for (var i = 0; i < q.length; i++) {
      var kv = q[i].split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    }
    return out;
  }

  /* ---------- 音量闭环 ---------- */
  function reconcileVolume(vol) {
    var s = store.get();
    if (s.pending === null || s.pending === undefined) return;
    if (s.volState !== 'pending') return;
    if (!vol || vol.cur === null || vol.cur === undefined) return;
    if (Math.abs(vol.cur - s.pending) <= 1) {
      log('volume reconciled', vol.cur);
      store.patch({ pending: null, volState: 'ok' });
    }
  }

  function requestVolume(v) {
    var s = store.get();
    if (!s.caps || !s.caps.volume) return;
    // 不再要求 link 已连接：面板既然已经弹出，调音量就该生效

    volToken++;
    var token = volToken;
    store.patch({ pending: v, volState: 'pending' });
    log('volume request', v);

    if (volTimer) clearTimeout(volTimer);
    // 120ms 节流：界面本身每帧都跟手（volume.js 本地先画），
    // 真正写系统音量的频率降下来，避免系统音量条被反复刷新。
    volTimer = setTimeout(function () {
      volTimer = null;
      var res = null;
      try {
        res = source.setVolume(v);
      } catch (e) {
        res = { ok: false, reason: String(e) };
      }
      log('volume sent', safeStr(res));

      if (res && res.ok === false) {
        store.patch({ volState: 'fail' });
        global.setTimeout(function () {
          if (token === volToken) store.patch({ pending: null, volState: 'ok' });
        }, 900);
        return;
      }

      global.setTimeout(function () {
        if (token !== volToken) return;
        var cur = store.get();
        if (cur.volState === 'pending') {
          store.patch({ pending: null, volState: 'ok' });
          log('volume timeout fallback');
        }
      }, 1200);
    }, 120);
  }

  /* ---------- 快照应用 ---------- */
  function applySnapshot(d) {
    if (!d) return;
    log('snapshot in', d.link || (d.plugged ? 'plugged' : 'n/a'));

    var patch = {};

    if (d.plugged !== undefined) patch.plugged = !!d.plugged;
    if (d.audioActive !== undefined) patch.audioActive = !!d.audioActive;

    if (d.link) patch.link = d.link;
    else patch.link = patch.plugged ? 'connected' : 'disconnected';

    if (d.source) patch.source = d.source;
    if (d.caps) patch.caps = d.caps;
    if (d.volume) patch.volume = d.volume;
    if (d.track !== undefined) patch.track = d.track;
    if (d.banner !== undefined) patch.banner = d.banner;
    if (d.hint !== undefined) patch.hint = d.hint;

    if (d.params) {
      patch.params = d.params;
    } else if (patch.link === 'disconnected') {
      patch.params = { rate: null, bits: null, format: null, kbps: null, channels: null };
    }

    store.patch(patch);
    if (d.volume) reconcileVolume(d.volume);
  }

  /* ---------- 渲染（模块级容错，单个模块异常不影响其他） ---------- */
  function callSafe(name, fn, s) {
    try {
      fn(s);
    } catch (e) {
      log('render fail: ' + name, String(e && e.message || e));
    }
  }

  function renderAll(s) {
    if (!ui) {
      log('render skipped: ui null');
      return;
    }
    callSafe('topbar', function (st) { ui.topbar.render(st); }, s);
    callSafe('params', function (st) { ui.params.render(st); }, s);
    callSafe('volume', function (st) { ui.volume.render(st); }, s);
    callSafe('footer', function (st) { ui.footer.render(st); }, s);

    try {
      if (s.link === 'disconnected' || s.link === 'error') {
        overlay.className = 'overlay';
      } else {
        overlay.className = 'overlay hidden';
      }

      // 断开态由遮罩承担提示，横幅让位
      var showBanner = !(s.link === 'disconnected' || s.link === 'error') &&
        !!(s.banner && s.banner.text);

      if (showBanner) {
        bannerText.textContent = s.banner.text;
        banner.className = 'banner' + (s.banner.level === 'error' ? ' is-error' : '');
      } else {
        banner.className = 'banner hidden';
      }

      // 横幅出现时给内容让位，避免压住卡片
      if (stageEl) {
        stageEl.style.paddingTop = showBanner ? '41px' : '14px';
      }

      btnExit.className = isBridge ? 'btn-exit' : 'btn-exit hidden';
    } catch (e) {
      log('render chrome fail', String(e && e.message || e));
    }
  }

  /* ---------- 缩放与旋转适配 ----------
   * 竖屏坐标系（M6 物理 720×1280）里，把 640×360 的横屏内容整体旋转 90°，
   * 这样设备横拿时文字才是正立的（与山灵原生 DAC 界面一致）。
   */
  function fit() {
    var vw = global.innerWidth || 640;
    var vh = global.innerHeight || 360;
    var portrait = vh > vw;
    var s;
    var tf;

    if (portrait) {
      // 旋转后视觉宽高互换：内容宽对应视口高
      s = global.Math.min(vw / BASE_H, vh / BASE_W);
      tf = 'translate(-50%, -50%) rotate(90deg) scale(' + s + ')';
    } else {
      s = global.Math.min(vw / BASE_W, vh / BASE_H);
      tf = 'translate(-50%, -50%) scale(' + s + ')';
    }

    if (!isFinite(s) || s <= 0) {
      s = 1;
      tf = 'translate(-50%, -50%) scale(1)';
    }
    app.style.transform = tf;
    if (s < 0.985) app.className = 'app is-framed';
    else app.className = 'app';
  }

  /* ---------- 初始化 ---------- */
  function boot() {
    log('boot start');
    if (global.console && global.console.log) {
      global.console.log('viewport ' + global.innerWidth + 'x' + global.innerHeight +
        ' dpr=' + (global.devicePixelRatio || 1));
    }

    var qs = parseQuery();
    var bridge = new global.DacBridgeSource();
    var forceMock = (qs.src === 'mock');

    ui = global.DacUI;
    log('ui modules', ui ? Object.keys(ui) : null);

    if (!forceMock && bridge.available()) {
      isBridge = true;
      source = bridge;
      store.patch({ bridge: true });
      log('source = bridge');
    } else {
      isBridge = false;
      source = new global.DacMockSource({ connected: qs.state !== 'disconnected' });
      store.patch({
        bridge: false,
        banner: { text: '演示模式：数据为模拟值（未检测到设备桥）', level: 'warn' }
      });
      log('source = mock');
      if (qs.scenario) {
        source.scenario(qs.scenario);
        log('scenario', qs.scenario);
      }
      // 预览用：?nobanner=1 隐藏演示横幅，模拟有桥时的真机观感
      if (qs.nobanner === '1') {
        store.patch({ banner: null });
      }
    }

    global.DacUI.volumeApi = { requestVolume: requestVolume };

    store.subscribe(renderAll);
    log('subscribed');

    renderAll(store.get());
    log('initial render done');

    try {
      source.start(applySnapshot);
      log('source started');
    } catch (e) {
      log('source.start FAILED', String(e && e.message || e));
      store.patch({ banner: { text: '数据源启动失败：' + (e && e.message || e), level: 'error' } });
    }

    fit();
    global.addEventListener('resize', fit, false);

    // 入场序列：只在面板首次弹出时播一次，随后移除类回到常态。
    // 样式全部挂在 body.is-entering 上，类不在时界面完全正常（不会白屏）。
    try {
      document.body.className = 'is-entering';
      global.setTimeout(function () {
        document.body.className = '';
      }, 1150);
    } catch (eEnter) {
      log('enter anim skip', String(eEnter));
    }
    global.addEventListener('orientationchange', function () {
      global.setTimeout(fit, 120);
    }, false);

    btnRecheck.addEventListener('click', function () {
      log('recheck clicked');
      if (isBridge) {
        source.forceCheck();
      } else {
        source.setConnected(true);
      }
    }, false);

    // 诊断：触摸事件是否真的到达页面（排查「拖不动」时看 logcat 即可）
    document.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      if (!t) return;
      var el = e.target || {};
      var tag = el.id || el.className || el.tagName || '?';
      if (global.console && global.console.log) {
        global.console.log('touch ' + global.Math.round(t.clientX) + ',' +
          global.Math.round(t.clientY) + ' on ' + tag);
      }
    }, true);

    btnExit.addEventListener('click', function () {
      if (isBridge) source.exitApp();
    }, false);

    global.onerror = function (msg, url, line) {
      log('window.onerror', msg + ' @' + line);
      store.patch({ banner: { text: '界面异常：' + msg + '（第 ' + line + ' 行）', level: 'error' } });
      return true;
    };

    log('boot end');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})(window);
