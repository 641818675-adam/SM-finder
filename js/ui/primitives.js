/* ============================================================
   UI 元件层 —— 全站复用的最小渲染原语

   约定：
     - 入参为「已转义或已确定安全」的 HTML 片段；需要转义的动态文本由调用方 esc()。
       这样原语之间可自由组合（例如 meta 右侧可能是带链接的提示）。
     - 输出结构与重构前逐字节一致，DOM 断言（tools/test_ui.js）不受影响。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;

  function icon(name) {
    return global.PFIcons[name] || global.PFIcons.search;
  }

  /** 空状态：语境化图形 + 主文案 + 说明 + 单一出口。 */
  function empty(msg, hint, action, iconName) {
    return '<div class="empty"><div class="big">' + icon(iconName) + '</div>' +
      '<div class="msg">' + U.esc(msg) + '</div>' +
      (hint ? '<div class="hint">' + U.esc(hint) + '</div>' : '') +
      (action
        ? ' <button class="btn empty-cta" data-act="' + U.esc(action.act) + '">' +
          U.esc(action.label) + '</button>'
        : '') + '</div>';
  }

  /** 结果计数条：左为主信息，右为可选补充。 */
  function meta(left, right) {
    return '<div class="result-meta"><span>' + left + '</span>' +
      (right ? '<span>' + right + '</span>' : '') + '</div>';
  }

  /** 结果集上方的解释性提示（多关键词并集、触顶指引等）。 */
  function hint(html) {
    return '<div class="result-hint">' + html + '</div>';
  }

  function moreBtn(show) {
    return show ? '<button class="more" data-more="1">加载更多</button>' : '';
  }

  function groupTitle(name, count) {
    return '<div class="group-title">' + U.esc(name) + ' · ' + count + '</div>';
  }

  function section(title, body, opts) {
    opts = opts || {};
    return '<div class="section' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      (title ? '<div class="sec-head">' + title + '</div>' : '') +
      body + '</div>';
  }

  /**
   * 键值行：规格表、套包清单、同款长度三种形态共用。
   * @param {string} k        键（需已转义）
   * @param {string} v        值 HTML
   * @param {Object} opts     { vCls, trailing }
   */
  function kv(k, v, opts) {
    opts = opts || {};
    return '<div class="kv">' +
      '<div class="k">' + k + '</div>' +
      '<div class="v' + (opts.vCls ? ' ' + opts.vCls : '') + '">' + v + '</div>' +
      (opts.trailing || '') +
      '</div>';
  }

  /** 逐项复制按钮：只复制该项料号，提示「复制成功」（需求2）。 */
  function partCopyBtn(no, label) {
    return '<button class="mini-copy" data-copy-part="' + U.esc(no) + '"' +
      ' aria-label="复制' + U.esc(label || '料号') + '">' + global.PFIcons.copy + '</button>';
  }

  /** 规格芯片组：读码器关键参数一眼扫完。 */
  function specChips(m) {
    var out = [];
    ['pixel', 'resolution', 'light_source', 'polarization', 'focal_length', 'focus_method']
      .forEach(function (k) {
        var v = U.fmtSpec(k, m[k]);
        if (v) out.push('<span class="spec">' + U.esc(v) + '</span>');
      });
    if (m.is_accessory === 1) out.push('<span class="spec">配件</span>');
    return out.join('');
  }

  /**
   * 结果卡片。型号为第一准则（销售记住的是机型型号），
   * 第一行型号、第二行料号；收藏星标在右上角。
   */
  function card(m, opts) {
    opts = opts || {};
    var fav = global.PFStore.hasFav(m.material_no);
    var st = global.PFStore.state;
    var sel = st.selected && st.selected.material_no === m.material_no ? ' sel' : '';
    var code = U.displayCode(m);
    var head =
      '<div class="fill-col">' +
        '<div class="card-title">' + U.esc(code) + '</div>' +
        '<div class="card-no">' + U.esc(m.material_no) +
          (m.price ? '<span class="price-tag">· ¥' + U.esc(m.price) + '</span>' : '') +
        '</div>' +
      '</div>';
    var chips = specChips(m);
    return '<article class="card' + sel + '" data-no="' + U.esc(m.material_no) + '"' +
      ' role="button" tabindex="0"' +
      ' aria-label="' + U.esc(code + '，料号 ' + m.material_no +
        (m.status ? '，' + m.status : '')) + '">' +
      '<div class="card-head">' +
        head +
        '<span class="badge ' + U.statusClass(m.status) + '">' + U.esc(m.status || '未知') + '</span>' +
        (opts.hideStar ? '' :
          '<button class="star' + (fav ? ' on' : '') + '" data-fav="' + U.esc(m.material_no) + '"' +
            ' aria-pressed="' + (fav ? 'true' : 'false') + '"' +
            ' aria-label="' + (fav ? '取消收藏' : '收藏') + ' ' + U.esc(code) + '">' +
            (fav ? global.PFIcons.starOn : global.PFIcons.star) + '</button>') +
      '</div>' +
      (chips ? '<div class="card-specs">' + chips + '</div>' : '') +
      '</article>';
  }

  /** 偏好设置开关行。 */
  function switchRow(key, label, sub) {
    var on = global.PFData.settings.get(key);
    return '<button class="row-item fill" data-toggle="' + key + '" >' +
      '<div class="label">' + U.esc(label) + '<div class="sub">' + U.esc(sub) + '</div></div>' +
      '<span class="switch' + (on ? ' on' : '') + '"></span></button>';
  }

  /**
   * 画像网格：竞品品牌 / 行业洞察共用同一套「标签-值」排版，
   * 此前两处各自写了一遍 map，合并为单一实现（消除重复）。
   */
  function profileGrid(fields) {
    return fields.map(function (f) {
      return f[1]
        ? '<div class="profile-item"><div class="pk">' + f[0] +
          '</div><div class="pv">' + U.esc(f[1]) + '</div></div>'
        : '';
    }).join('');
  }

  global.PFUI = {
    empty: empty,
    meta: meta,
    hint: hint,
    moreBtn: moreBtn,
    groupTitle: groupTitle,
    section: section,
    kv: kv,
    partCopyBtn: partCopyBtn,
    specChips: specChips,
    card: card,
    switchRow: switchRow,
    profileGrid: profileGrid,
  };
})(window);
