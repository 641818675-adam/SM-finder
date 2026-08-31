/* ============================================================
   收藏页 —— 收藏夹 / 最近查看 / 体验反馈 / 偏好设置 / 版本信息

   收藏夹与最近查看存的是料号，不是物料快照。换数据包后可能查不到对应物料，
   原实现会静默把卡片吞掉；这里改为显式计数提示，不谎报"什么都没有"。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var UI = global.PFUI;
  var ICONS = global.PFIcons;

  function state() { return global.PFStore.state; }

  /** 料号 → 卡片，查不到的记一笔，最后统一提示。 */
  function cardsFor(nos) {
    var html = '';
    var missing = 0;
    nos.forEach(function (no) {
      var m = global.PFStore.byNo(no);
      if (m) html += UI.card(m);
      else missing += 1;
    });
    return { html: html, missing: missing };
  }

  function render(host) {
    var st = state();
    var favs = global.PFStore.allFav();
    var recents = global.PFData.recent.all();
    var html = '';

    html += '<div class="sec-head flush">收藏夹</div>';
    if (!favs.length) {
      html += '<div class="empty compact"><div class="big">' + ICONS.emptyStar + '</div>' +
        '<div class="msg">还没有收藏</div>' +
        '<div class="hint">在搜索结果点星标，常用料号会留在这里</div></div>';
    } else {
      var favBlock = cardsFor(favs);
      html += favBlock.html;
      if (favBlock.missing) {
        html += '<div class="result-hint">有 ' + favBlock.missing +
          ' 个收藏料号不在当前物料库中（可能已停用或换过数据包），如需清理请长按星标取消。</div>';
      }
    }

    if (recents.length) {
      html += '<div class="sec-head flush">最近查看</div>' +
        cardsFor(recents.slice(0, 12)).html;
    }

    var count = st.catalog ? st.catalog.count : 0;
    var version = st.catalog ? U.esc(st.catalog.version) : '—';
    var exportedAt = st.catalog ? String(st.catalog.exportedAt || '').slice(0, 10) : '—';

    html += '<div class="sec-head flush">体验反馈</div>' +
      '<div class="section">' +
      '<button class="row-item" data-fb-open="1" >' +
        '<div class="label">提交反馈<div class="sub">打分 + 问题类型，驱动灰度迭代</div></div>' +
        '<span class="val chev">›</span></button>' +
      '</div>' +
      '<div class="sec-head flush">偏好设置</div>' +
      '<div class="section">' +
      UI.switchRow('hideRetired', '隐藏退市型号', '搜索与选型中不显示已退市物料') +
      UI.switchRow('includeAccessory', '包含配件', '关闭后只显示整机与主机') +
      UI.switchRow('groupBySeries', '按系列分组', '无关键词浏览时按系列归类') +
      '</div>' +
      '<div class="sec-head flush">数据迁移</div>' +
      '<div class="section">' +
      '<button class="row-item" data-bk-export="1">' +
        '<div class="label">导出备份<div class="sub">收藏 · 客户 · 最近查看 · 偏好，换机搬数据用</div></div>' +
        '<span class="val chev">›</span></button>' +
      '<button class="row-item" data-bk-import="1">' +
        '<div class="label">恢复备份<div class="sub">粘贴备份文本，覆盖本机同名数据</div></div>' +
        '<span class="val chev">›</span></button>' +
      '</div>' +
      '<div class="section">' +
      '<div class="row-item"><div class="label">产品数据<div class="sub">共 ' +
        count + ' 条 · ' + version + '</div></div>' +
        '<div class="val">' + U.esc(exportedAt) + '</div></div>' +
      '<div class="row-item"><div class="label">客户端版本</div>' +
        '<div class="val">v' + global.PFStore.APP_VERSION + '</div></div>' +
      '</div>';

    host.innerHTML = html;
  }

  global.PFViewSaved = { render: render };
})(window);
