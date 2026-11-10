/* sources/bridge.js — Android WebView 桥：壳每 400ms 推送快照，Web 侧 1.5s 轮询兜底 */
(function (global) {
  'use strict';

  function BridgeSource() {
    this.listener = null;
    this.pollTimer = null;
    this.lastPushAt = 0;
    this.started = false;
    this.pushCount = 0;
  }

  BridgeSource.prototype.available = function () {
    return !!(global.DacBridge &&
      typeof global.DacBridge.getSnapshot === 'function');
  };

  BridgeSource.prototype.handle = function (raw) {
    var data = null;
    if (raw === null || raw === undefined || raw === '') return;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return;
      }
    } else {
      data = raw;
    }
    if (data && this.listener) this.listener(data);
  };

  BridgeSource.prototype.pull = function () {
    if (!this.available()) return false;
    try {
      this.handle(global.DacBridge.getSnapshot());
      return true;
    } catch (e) {
      if (this.listener) {
        this.listener({
          link: 'degraded',
          banner: {
            text: '读取设备状态失败：' + ((e && e.message) || e),
            level: 'error'
          }
        });
      }
      return false;
    }
  };

  BridgeSource.prototype.start = function (onSnapshot) {
    if (this.started) return;
    this.started = true;
    this.listener = onSnapshot;
    var self = this;

    // 壳通过 evaluateJavascript 调用
    global.__dacPush = function (json) {
      self.lastPushAt = Date.now();
      self.pushCount++;
      self.handle(json);
    };

    // 兜底轮询：5s 收不到推送就每 1.5s 主动拉
    this.pollTimer = setInterval(function () {
      if (!self.started) return;
      if (Date.now() - self.lastPushAt > 5000) self.pull();
    }, 1500);

    this.pull();
  };

  BridgeSource.prototype.stop = function () {
    this.started = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.listener = null;
  };

  BridgeSource.prototype.setVolume = function (v) {
    if (!this.available() || typeof global.DacBridge.setVolume !== 'function') {
      return null;
    }
    try {
      var res = global.DacBridge.setVolume(Math.round(v));
      if (typeof res === 'string') {
        try { return JSON.parse(res); } catch (e) { return null; }
      }
      return res || null;
    } catch (e) {
      return { ok: false, reason: 'bridge-error' };
    }
  };

  BridgeSource.prototype.forceCheck = function () {
    if (this.available() && typeof global.DacBridge.forceCheck === 'function') {
      try { global.DacBridge.forceCheck(); } catch (e) { /* ignore */ }
    }
    this.pull();
  };

  BridgeSource.prototype.exitApp = function () {
    if (this.available() && typeof global.DacBridge.exitApp === 'function') {
      try { global.DacBridge.exitApp(); } catch (e) { /* ignore */ }
    }
  };

  global.DacBridgeSource = BridgeSource;
})(window);
