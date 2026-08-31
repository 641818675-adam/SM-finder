/* ============================================================
   搜索结果页

   本页承担两条互相冲突的承诺，实现上分别处理：
     1. 快 —— 打开即出结果，无关键词时按全库排序铺开
     2. 诚实 —— 库内总量远大于检索上限时，不能把截断后的条数报成全库条数
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var UI = global.PFUI;

  function state() { return global.PFStore.state; }

  /**
   * 空状态必须区分成因，否则会给出错误引导：
   * 筛选条件过窄时提示"试试型号片段"毫无意义，应直接给出"清除筛选"出口。
   */
  function emptyCopy() {
    var st = state();
    var filters = [];
    if (st.category) filters.push('类别「' + st.category + '」');
    if (st.status) filters.push('状态「' + st.status + '」');
    if (global.PFData.settings.get('hideRetired')) filters.push('隐藏退市');
    var q = (st.query || '').trim();

    if (filters.length) {
      return ['当前条件下没有物料',
        filters.join(' + ') + (q ? '，加上关键词「' + q + '」' : '') + ' 过滤掉了全部结果',
        { label: '清除全部筛选', act: 'clear-filters' }, 'emptySearch'];
    }
    if (!q) return ['没有可显示的物料', '数据可能未加载完成，请重启应用重试'];

    var hint = '试试更短的型号片段，例如 VS1000、VS2000、VN4000';
    if (/\s/.test(q)) hint = '空格会拆成多个关键词分别匹配，直接输入连在一起的型号片段更准';
    else if (q.length < 2) hint = '关键词太短，请至少输入 2 个字符';
    return ['没有找到「' + q + '」', hint, { label: '清空关键词', act: 'clear-query' }, 'emptySearch'];
  }

  function groupedHTML(list) {
    var groups = {};
    var order = [];
    list.forEach(function (m) {
      var k = global.PFSearch.seriesKey(m.product_series) || '未分类';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(m);
    });
    return order.map(function (k) {
      return UI.groupTitle(k, groups[k].length) +
        groups[k].map(function (m) { return UI.card(m); }).join('');
    }).join('');
  }

  function render(host) {
    var st = state();
    if (!st.catalog) {
      host.innerHTML = UI.empty('物料库尚未就绪', '数据载入失败，请重启应用重试', null, 'emptyBox');
      return;
    }

    var total = st.results.length;
    var slice = st.results.slice(0, st.shown);

    // 无关键词时库内总量远大于检索上限（1213 vs 600），
    // 直接报 results.length 会让用户误以为全库只有这么多条。
    var libCount = st.catalog.count;
    var truncated = !st.query && libCount > total;
    var metaHTML = UI.meta(
      (st.query
        ? '“' + U.esc(st.query) + '” 找到 ' + total + ' 条'
        : (truncated
            ? '共 ' + libCount + ' 条 · 列出前 ' + total + ' 条'
            : '共 ' + total + ' 条')),
      total > st.shown ? '已显示 ' + slice.length : ''
    );

    if (!total) {
      host.innerHTML = UI.empty.apply(UI, emptyCopy());
      return;
    }

    // 关键词里仍有空格时是「多关键词并集」，结果往往远超预期，需明确告知
    var spaceHint = (/\s/.test(st.query) && total > 12)
      ? UI.hint('空格按多关键词并集匹配，共 ' + total + ' 条。' +
          '若这是完整型号，请去掉空格，或' +
          '<button class="link" data-act="despace">按去空格重查</button>')
      : '';

    // 触顶指引：结果已全部列出但库内还有更多时，必须给"怎么看全"的出口
    // （R1-03：之前用户翻到上限后按钮直接消失，没有任何解释）
    var capHint = (libCount > total && total <= st.shown)
      ? UI.hint('已列出前 ' + total + ' 条。要看更全，请输入更精确的型号，' +
          '或用类别/状态筛选缩小范围。')
      : '';

    var grouped = global.PFData.settings.get('groupBySeries');
    // 分组浏览同样需要加载更多（R1-03 修复中发现：此前分组路径
    // 从未渲染 more 按钮，默认设置下无关键词浏览只能看到前 30 条）
    var body = (grouped && !st.query) ? groupedHTML(slice)
      : slice.map(function (m) { return UI.card(m); }).join('');

    host.innerHTML = metaHTML + capHint +
      (grouped && !st.query ? '' : spaceHint) +
      body + UI.moreBtn(total > st.shown);
  }

  global.PFViewResults = {
    render: render,
    emptyCopy: emptyCopy,
  };
})(window);
