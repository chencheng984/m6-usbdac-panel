/* store.js — 单一状态源。所有 UI 只读这里，任何变化只能通过 patch() */
(function (global) {
  'use strict';

  var LINK = {
    DISCONNECTED: 'disconnected',
    DETECTING: 'detecting',
    CONNECTED: 'connected',
    DEGRADED: 'degraded',
    ERROR: 'error'
  };

  function initialState() {
    return {
      link: LINK.DISCONNECTED,
      plugged: false,
      audioActive: false,
      bridge: false,
      source: 'none',            // 'alsa' | 'a11y' | 'mock' | 'none'
      params: { rate: null, bits: null, format: null, kbps: null, channels: null },
      volume: { cur: null, max: null },
      pending: null,             // 乐观音量值（拖动中）
      volState: 'ok',            // 'ok' | 'pending' | 'fail'
      track: null,               // { title, artist }
      caps: { alsa: false, a11y: false, volume: false },
      banner: null,              // { text, level }
      hint: ''
    };
  }

  var state = initialState();
  var listeners = [];

  function get() {
    return state;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](state);
      } catch (e) {
        if (global.console && console.error) console.error('[store] listener failed', e);
      }
    }
  }

  function shallowMerge(target, src) {
    var out = {};
    var k;
    for (k in target) {
      if (Object.prototype.hasOwnProperty.call(target, k)) out[k] = target[k];
    }
    for (k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
    }
    return out;
  }

  /* 浅合并 patch；params / volume / caps 做一层深合并 */
  function patch(partial) {
    if (!partial) return;
    for (var k in partial) {
      if (!Object.prototype.hasOwnProperty.call(partial, k)) continue;
      if (k === 'params' || k === 'volume' || k === 'caps') {
        state[k] = shallowMerge(state[k] || {}, partial[k] || {});
      } else {
        state[k] = partial[k];
      }
    }
    emit();
  }

  function reset() {
    state = initialState();
    emit();
  }

  global.DacStore = {
    LINK: LINK,
    get: get,
    patch: patch,
    subscribe: subscribe,
    reset: reset
  };
})(window);
