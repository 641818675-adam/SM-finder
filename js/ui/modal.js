/* ============================================================
   模态层 —— 底部弹层的开合与层叠状态上报

   层叠状态必须上报给原生：硬件返回键据此逐层退出（先弹层、再详情 sheet）
   而不是直接结束应用（R2-01）。单页应用 webView.canGoBack() 恒为 false，
   不能依赖历史栈。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;

  function host_() {
    return document.getElementById('modal');
  }

  /** 浏览器环境无原生桥接，静默跳过。 */
  function reportOverlay(open) {
    try {
      if (global.Android && global.Android.reportOverlay) {
        global.Android.reportOverlay(open);
      }
    } catch (e) { /* 忽略 */ }
  }

  function open(inner) {
    var host = host_();
    if (!host) return;
    host.innerHTML = '<div class="modal-mask" data-modal-close="1"></div>' +
      '<div class="modal" role="dialog" aria-modal="true">' + inner + '</div>';
    host.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    reportOverlay(true);
  }

  function close() {
    var host = host_();
    if (!host) return;
    host.style.display = 'none';
    host.innerHTML = '';
    reportOverlay(false);
    var sheet = document.getElementById('sheet');
    if (!sheet || sheet.style.display !== 'flex') {
      document.body.style.overflow = '';
    }
  }

  function isOpen() {
    var host = host_();
    return !!(host && host.style.display === 'flex');
  }

  function html() {
    var host = host_();
    return host ? host.innerHTML : '';
  }

  /**
   * 桌面版 QMessageBox.question 的移动端等效：底部确认弹层，默认动作是取消。
   * 主动作由 data-modal-ok 触发，具体语义（删客户等）由调用方在 app 层处理。
   */
  function confirm(opts) {
    open(
      '<div class="modal-title">' + U.esc(opts.title) + '</div>' +
      '<div class="modal-body">' + U.esc(opts.body) + '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn" data-modal-close="1">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-modal-ok="1">' +
        U.esc(opts.confirmLabel || '确定') + '</button>' +
      '</div>');
  }

  global.PFModal = {
    open: open,
    close: close,
    isOpen: isOpen,
    html: html,
    confirm: confirm,
    reportOverlay: reportOverlay,
  };
})(window);
