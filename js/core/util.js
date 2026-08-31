/* ============================================================
   核心工具层 —— 无状态纯函数 + 两个宿主能力（Toast / 剪贴板）

   规则：本层不持有业务状态，不直接读写 state；
   只做「输入 → 输出」转换与两个需要 DOM 的副作用。
   PFIcons 在调用时按名查找，因此不要求加载顺序。
   ============================================================ */

(function (global) {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 物料生命周期 → 徽章色语义。未知状态一律落到最低档，不静默变透明。 */
  function statusClass(s) {
    if (s === '可售') return 'active';
    if (s === '待上市') return 'pending';
    if (s === '准备下架') return 'phasing';
    return 'retired';
  }

  /** 列表与详情的第一准则：销售记住的是机型型号，型号缺失才退回名称/料号。 */
  function displayCode(m) {
    return m.material_code || m.material_name || m.material_no;
  }

  /** 双栏断点。与 CSS 的 600px 媒体查询保持同一数值来源语义。 */
  function isWide() {
    return global.matchMedia('(min-width: 600px)').matches;
  }

  /**
   * 库内部分字段以裸值存储（pixel="5" 实为 500 万，focal_length="8" 实为 8mm），
   * 展示时补回单位，避免销售现场误读规格。
   */
  function fmtSpec(key, value) {
    if (value === null || value === undefined) return '';
    var s = String(value).trim();
    if (!s) return '';
    switch (key) {
      case 'pixel': return /MP/i.test(s) ? s : s + 'MP';
      case 'focal_length': return /mm/i.test(s) ? s : s + 'mm';
      case 'light_source': return /光$/.test(s) ? s : s + '光';
      case 'focus_method': return /调焦$/.test(s) ? s : s + '调焦';
      case 'polarization': return /偏振$/.test(s) ? s : s + '偏振';
      default: return s;
    }
  }

  /**
   * 型号归一化。
   * 从 Excel / PDF / 微信复制型号时常带排版空格（如 "VS1000P - 111 - 022"），
   * 直接检索会被按多关键词拆成并集，得到上百条结果。这里先把连字符两侧的
   * 空格收拢，使其还原为可精确命中的完整型号。
   */
  function normalizeQuery(q) {
    return String(q || '')
      .replace(/\s*-\s*/g, '-')   // 连字符两侧空格收拢
      .replace(/\s{2,}/g, ' ')    // 连续空格压缩
      .trim();
  }

  var toastTimer = null;

  function toast(msg, icon) {
    var el = $('#toast');
    if (!el) return;
    var svg = icon && global.PFIcons && global.PFIcons[icon]
      ? '<span class="t-icon">' + global.PFIcons[icon] + '</span>' : '';
    el.innerHTML = svg + esc(msg);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1700);
  }

  /**
   * 复制优先走原生桥接（file:// 不是安全上下文，JS 剪贴板不可用）；
   * 浏览器/测试环境回退到 execCommand，失败仍要给出可读反馈而不是静默。
   */
  function legacyCopy(text, msg, icon) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(msg || '已复制', icon);
    } catch (e) {
      toast('复制失败');
    }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  }

  function copyText(text, msg, icon) {
    if (!text) return;
    buzz(12);
    if (global.Android && global.Android.copy) {
      try {
        global.Android.copy(text);
        toast(msg || '已复制', icon);
        return;
      } catch (e) { /* 桥接异常时继续走 DOM 回退 */ }
    }
    // iOS PWA / 浏览器：优先异步剪贴板 API（HTTPS 安全上下文），失败回退 execCommand
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(function () {
        toast(msg || '已复制', icon);
      }, function () {
        legacyCopy(text, msg, icon);
      });
      return;
    }
    legacyCopy(text, msg, icon);
  }

  /** View Transitions 包装：支持且未开启"减少动态"时走原生转场，否则直接执行。 */
  function vt(fn) {
    if (global.document && document.startViewTransition &&
        !(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      document.startViewTransition(fn);
    } else {
      fn();
    }
  }

  /** 轻触觉反馈：Android 桥存在时触发短振动，回退 navigator.vibrate，均静默容错。 */
  function buzz(ms) {
    var d = ms || 12;
    if (global.Android && global.Android.vibrate) { try { global.Android.vibrate(d); } catch (e) {} }
    else if (global.navigator && global.navigator.vibrate) { try { global.navigator.vibrate(d); } catch (e) {} }
  }

  global.PFUtil = {
    $: $,
    esc: esc,
    statusClass: statusClass,
    displayCode: displayCode,
    isWide: isWide,
    fmtSpec: fmtSpec,
    normalizeQuery: normalizeQuery,
    toast: toast,
    copyText: copyText,
    vt: vt,
    buzz: buzz,
  };
})(window);
