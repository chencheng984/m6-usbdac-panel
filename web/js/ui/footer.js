/* ui/footer.js — 数据来源角标
 *
 * 曲目行已移除：DAC 模式下音频来自电脑、UAC 没有元数据通道，曲目信息客观不存在；
 * 本地播放时也只有山灵播放页在前台才读得到。与其长期显示「不可用」，不如不占位。
 * 这里只维护数据源角标与提示语——它是「当前数值来自哪里」的诚实标记，必须保留。
 */
(function (global) {
  'use strict';

  var elTag = document.getElementById('srcTag');
  var elHint = document.getElementById('hint');

  var lastTag = null;
  var lastCls = null;
  var lastHint = null;

  var TAG_TEXT = {
    alsa: '来源 · 内核 ALSA',
    a11y: '来源 · 山灵界面',
    mock: '来源 · 演示',
    none: '无数据源'
  };

  function render(s) {
    var src = s.source || 'none';
    var tagText = TAG_TEXT[src] || TAG_TEXT.none;
    var cls = 'src-tag src-tag--' + (src === 'none' ? 'none' : src);

    if (tagText !== lastTag) {
      elTag.textContent = tagText;
      lastTag = tagText;
    }
    if (cls !== lastCls) {
      elTag.className = cls;
      lastCls = cls;
    }

    var hint = s.hint || '';
    if (hint !== lastHint) {
      elHint.textContent = hint;
      lastHint = hint;
    }
  }

  global.DacUI = global.DacUI || {};
  global.DacUI.footer = { render: render };
})(window);
