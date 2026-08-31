/* ============================================================
   选型（三级钻取，需求2）

   场景 = 未知型号挑型号：
     第 1 层 读码器 / 智能相机（读码器支持 中性 / 原型）
     第 2 层 按系列分卡片（读码器 VS600/VS800/VS1000…，相机 VN2000/VN4000…）
     第 3 层 具体型号列表 → 点开右侧详情「规格参数优先，料号其次」
   类别映射完全由数据驱动（product_category），中性机=「中性读码器/VA中性」。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var UI = global.PFUI;
  var ICONS = global.PFIcons;

  var CONFIG_GROUPS = [
    { key: 'reader', label: '读码器', icon: 'scan', quality: true,
      // 读码器：中性机独立类别（中性读码器）
      match: function (m, q) {
        return m.product_category === (q === 'neutral' ? '中性读码器' : '固定式读码器');
      },
      hint: 'VS600 / VS800 / VS1000 / VS2000 等系列' },
    { key: 'camera', label: '智能相机', icon: 'camera', quality: true,
      // 智能相机：限「智能传感器」类别；中性判定用数据管道盖的 neutral 标记
      // （tools/extract_neutral.py 按选型表「以下为中性机型」区段+描述含中性提取）
      match: function (m, q) {
        if (m.product_category !== '智能传感器') return false;
        var neutral = m.neutral === true;
        return q === 'neutral' ? neutral : !neutral;
      },
      hint: 'VN2000 / VN4000 / VA / WIT 等系列' },
    { key: 'medical', label: '医疗系列', icon: 'medical', quality: false,
      match: function (m) { return m.product_category === '医疗系列'; },
      hint: 'VS680 一体机 / MED 系列医用读码器' },
  ];

  function state() { return global.PFStore.state; }

  function group() {
    var key = state().cfg.group;
    return CONFIG_GROUPS.filter(function (g) { return g.key === key; })[0] || null;
  }

  /** 当前质量档（原型/中性）下的物料过滤谓词。 */
  function matchFn() {
    var g = group();
    if (!g) return null;
    var q = state().cfg.quality === 'neutral' ? 'neutral' : 'original';
    return function (m) { return g.match(m, q); };
  }

  function qualityLabel() {
    return state().cfg.quality === 'neutral' ? '中性' : '原型';
  }

  /** 系列计数走 PFStore 缓存：类别层与系列层原本各自遍历全库，现共用同一次遍历。 */
  function seriesList() {
    return global.PFStore.seriesCounts(state().cfg.group, state().cfg.quality, matchFn());
  }

  function overviewCounts(g) {
    return global.PFStore.seriesCounts('overview', g.key, function (m) {
      return g.match(m, 'original') || g.match(m, 'neutral');
    });
  }

  function renderCategory(host) {
    host.innerHTML = '<div class="cat-grid">' + CONFIG_GROUPS.map(function (g, i) {
      var counts = overviewCounts(g);
      var total = counts.reduce(function (n, x) { return n + x.count; }, 0);
      var preview = counts.slice(0, 3).map(function (x) { return x.name; }).join(' · ') + ' 等';
      return '<button class="cat-card vf" data-cfg-group="' + g.key + '"' +
        ' role="button" aria-label="进入' + U.esc(g.label) + '系列选择">' +
        '<span class="cat-idx mono">0' + (i + 1) + '</span>' +
        '<span class="cat-icon">' + ICONS[g.icon] + '</span>' +
        '<span class="cat-label">' + U.esc(g.label) + '</span>' +
        '<span class="cat-count">' + total + ' 个型号</span>' +
        '<span class="cat-preview">' + U.esc(preview) + '</span>' +
        (g.quality
          ? '<span class="cat-tags"><i>原型</i><i>中性</i></span>'
          : '') +
        '</button>';
    }).join('') + '</div>';
  }

  function renderSeries(host) {
    var st = state();
    var g = group();
    var qualityUI = '';
    if (g.quality) {
      qualityUI = '<div class="seg cfg-quality">' +
        '<button class="' + (st.cfg.quality === 'original' ? 'on' : '') +
        '" data-cfg-quality="original">原型</button>' +
        '<button class="' + (st.cfg.quality === 'neutral' ? 'on' : '') +
        '" data-cfg-quality="neutral">中性</button>' +
        '</div>';
    }
    var list = seriesList();
    // 空档位原本会渲染一个空网格，用户看到的是"什么都没有"却无解释，补空态出口
    if (!list.length) {
      host.innerHTML = qualityUI +
        UI.empty(qualityLabel() + '档暂无可选系列', '切到另一档，或从上一层换个类别',
          { label: '返回类别', act: 'cfg-home' }, 'emptyBox');
      return;
    }
    var cards = list.map(function (x) {
      return '<button class="series-card" data-cfg-series="' + U.esc(x.name) + '"' +
        ' role="button" aria-label="进入' + U.esc(x.name) + '，共' + x.count + '个型号">' +
        '<span class="s-name mono">' + U.esc(x.name) + '</span>' +
        '<span class="s-count">' + x.count + ' 个型号</span>' +
        '<span class="chev">›</span></button>';
    }).join('');
    host.innerHTML = qualityUI +
      UI.meta(U.esc(qualityLabel() + '机型 · ' + list.length + ' 个系列')) +
      '<div class="series-grid">' + cards + '</div>';
  }

  function renderModels(host) {
    var st = state();
    var sk = st.cfg.series;
    var match = matchFn();
    var hideRetired = global.PFData.settings.get('hideRetired');
    var pool = (st.catalog ? st.catalog.materials : []).filter(function (m) {
      if (m.is_accessory === 1) return false;
      if (match && !match(m)) return false;
      if (global.PFSearch.seriesKey(m.product_series) !== sk) return false;
      if (hideRetired && m.status === '退市') return false;
      return true;
    });
    var slice = pool.slice(0, st.shown);
    var body = slice.length
      ? slice.map(function (m) { return UI.card(m); }).join('')
      : UI.empty('该系列暂无整机', '返回上一级换个系列', null, 'emptyBox');
    host.innerHTML = UI.meta(U.esc(sk) + ' · ' + pool.length + ' 个型号') +
      body + UI.moreBtn(pool.length > st.shown);
  }

  function render(host) {
    var level = state().cfg.level;
    if (level === 'series') return renderSeries(host);
    if (level === 'models') return renderModels(host);
    return renderCategory(host);
  }

  /** 返回类别层时重置钻取状态（与原实现逐字段一致）。 */
  function goBack(level) {
    var cfg = state().cfg;
    cfg.level = level;
    if (level === 'category') { cfg.group = ''; cfg.series = ''; }
    else cfg.series = '';
  }

  global.PFViewConfig = {
    render: render,
    group: group,
    matchFn: matchFn,
    qualityLabel: qualityLabel,
    seriesList: seriesList,
    goBack: goBack,
  };
})(window);
