/* sources/mock.js — 演示驱动：无 Android 桥时用它把界面跑起来 */
(function (global) {
  'use strict';

  var RATES = [44.1, 48, 88.2, 96, 176.4, 192, 352.8, 384];
  var FORMATS = ['FLAC', 'WAV', 'APE'];
  var BITS = [16, 24, 32];

  function MockSource(opts) {
    opts = opts || {};
    this.connected = opts.connected !== false;
    this.volume = 46;
    this.volumeMax = 100;
    this.rateIdx = 5;          // 192
    this.bits = 24;
    this.format = 'FLAC';
    this.kbps = 0;
    this.track = { title: '夜に浮かぶ', artist: 'Haruna' };
    this.sourceOverride = null;   // 'alsa' = 模拟 USB DAC 模式（无曲目元数据）
    this.listener = null;
    this.timer = null;
    this.started = false;
    this.recomputeKbps();
  }

  MockSource.prototype.recomputeKbps = function () {
    var r = RATES[this.rateIdx];
    // FLAC 平均压缩率约 0.68，贴近真实码率（192k/24bit ≈ 6276 kbps）
    this.kbps = Math.round(r * 1000 * this.bits * 2 * 0.68 / 1000);
  };

  MockSource.prototype.makeSnapshot = function () {
    var connected = this.connected;
    return {
      link: connected ? 'connected' : 'disconnected',
      plugged: connected,
      audioActive: connected,
      source: connected ? (this.sourceOverride || 'mock') : 'none',
      params: connected ? {
        rate: RATES[this.rateIdx],
        bits: this.bits,
        format: this.format,
        kbps: this.kbps,
        channels: 2
      } : { rate: null, bits: null, format: null, kbps: null, channels: null },
      volume: { cur: this.volume, max: this.volumeMax },
      track: connected ? this.track : null,
      caps: { alsa: false, a11y: false, volume: true },
      pending: null,
      volState: 'ok',
      hint: ''
    };
  };

  MockSource.prototype.emit = function () {
    if (this.listener) this.listener(this.makeSnapshot());
  };

  MockSource.prototype.start = function (onSnapshot) {
    if (this.started) return;
    this.started = true;
    this.listener = onSnapshot;
    var self = this;

    this.timer = setInterval(function () {
      if (!self.started) return;
      // 每 4s：连接态下有概率换一首歌（同时换采样率/位深），用于观察数值过渡。
      // DAC 模式（sourceOverride=alsa）不模拟换歌：那边参数由电脑端决定
      if (self.connected && !self.sourceOverride && Math.random() < 0.20) {
        self.rateIdx = Math.floor(Math.random() * RATES.length);
        self.bits = BITS[Math.floor(Math.random() * BITS.length)];
        self.format = FORMATS[Math.floor(Math.random() * FORMATS.length)];
        self.recomputeKbps();
      }
      self.emit();
    }, 4000);

    this.emit();
  };

  MockSource.prototype.stop = function () {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.listener = null;
  };

  MockSource.prototype.setVolume = function (v) {
    var self = this;
    var next = Math.round(v);
    if (next < 0) next = 0;
    if (next > this.volumeMax) next = this.volumeMax;
    this.volume = next;
    // 模拟设备回读延迟
    setTimeout(function () {
      if (self.started) self.emit();
    }, 120);
    return { ok: true, actual: this.volume };
  };

  MockSource.prototype.setConnected = function (v) {
    this.connected = !!v;
    this.emit();
  };

  MockSource.prototype.scenario = function (name) {
    if (name === 'disconnected') this.setConnected(false);
    else if (name === 'connected') {
      this.sourceOverride = null;
      this.track = { title: '夜に浮かぶ', artist: 'Haruna' };
      this.setConnected(true);
    } else if (name === 'dac') {
      // 模拟 USB DAC 模式：参数来自 ALSA，元数据不存在
      this.rateIdx = 1;          // 48
      this.bits = 24;
      this.format = 'PCM';
      this.kbps = 2304;          // 48k × 24bit × 2ch，未压缩
      this.track = null;
      this.sourceOverride = 'alsa';
      this.setConnected(true);
    } else if (name === 'hires') {
      this.setConnected(true);
      this.rateIdx = 7;    // 384
      this.bits = 32;
      this.format = 'FLAC';
      this.recomputeKbps();
      this.emit();
    } else if (name === 'dsd') {
      this.setConnected(true);
      this.rateIdx = 6;    // 352.8
      this.bits = 32;
      this.format = 'APE';
      this.recomputeKbps();
      this.emit();
    }
  };

  global.DacMockSource = MockSource;
})(window);
