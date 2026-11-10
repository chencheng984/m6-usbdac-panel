/* ui/params.js — 采样率 / 位深 / 格式 / 码率 */
(function (global) {
  'use strict';

  var elRate = document.getElementById('rateNum');
  var elBits = document.getElementById('bitsVal');
  var elFormat = document.getElementById('formatVal');
  var elKbps = document.getElementById('kbpsVal');
  var elCard = document.getElementById('paramsCard');

  var cache = { rate: null, bits: null, format: null, kbps: null };
  var lastSig = null;
  var pulseTimer = null;

  /* 数值真的变了才闪一次（400ms 刷新时数值不变不闪） */
  function firePulse() {
    if (!elCard) return;
    elCard.className = 'card params is-pulse';
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(function () {
      elCard.className = 'card params';
    }, 680);
  }

  function setRate(txt) {
    if (cache.rate === txt) return;
    cache.rate = txt;
    elRate.textContent = txt;

    var cls = 'rate-num';
    if (txt === '--') cls += ' is-empty';
    // 采样率字符数不固定（96 / 44.1 / 2822.4），长文本降字号避免撑出卡片
    else if (txt.length >= 7) cls += ' is-xlong';
    else if (txt.length >= 5) cls += ' is-long';
    if (elRate.className !== cls) elRate.className = cls;
  }

  function setPlain(el, key, txt) {
    if (cache[key] === txt) return;
    cache[key] = txt;
    el.textContent = txt;
  }

  /* 44.1 / 88.2 / 176.4 / 352.8 保留一位小数，整数不带小数点 */
  function fmtRate(v) {
    if (v === null || v === undefined || isNaN(v)) return '--';
    var n = Number(v);
    if (Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n));
    return n.toFixed(1);
  }

  function render(s) {
    var active = (s.link === 'connected' || s.link === 'degraded');
    var p = s.params || {};

    if (!active) {
      setRate('--');
      setPlain(elBits, 'bits', '--');
      setPlain(elFormat, 'format', '--');
      setPlain(elKbps, 'kbps', '--');
      lastSig = null;
      return;
    }

    setRate(fmtRate(p.rate));

    if (p.bits) setPlain(elBits, 'bits', p.bits + ' bit');
    else setPlain(elBits, 'bits', '--');

    setPlain(elFormat, 'format', p.format || '--');

    if (p.kbps) setPlain(elKbps, 'kbps', String(p.kbps));
    else setPlain(elKbps, 'kbps', '--');

    var sig = [p.rate === null || p.rate === undefined ? '' : p.rate,
      p.bits || '', p.format || '', p.kbps || ''].join('|');
    if (lastSig !== null && sig !== lastSig) firePulse();
    lastSig = sig;
  }

  global.DacUI = global.DacUI || {};
  global.DacUI.params = { render: render };
})(window);
