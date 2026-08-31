/* ============================================================
   外框层 —— 顶部栏与底部导航

   顶栏随页签变形：搜索页给搜索框 + 筛选 chips，选型页给面包屑，
   竞品页给搜索框 + 分段控件，客户页给选中态提示，收藏页只给标题。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var ICONS = global.PFIcons;

  var TABS = [
    { key: 'search', label: '搜索', icon: 'search' },
    { key: 'config', label: '选型', icon: 'grid' },
    { key: 'rival', label: '竞品', icon: 'rival' },
    { key: 'customers', label: '客户', icon: 'users' },
    { key: 'saved', label: '收藏', icon: 'star' },
  ];

  var RIVAL_SUB = {
    match: '输入竞品型号查我方对标',
    brand: '竞品定位、优势与可打击点',
    objection: '客户异议与应对话术',
    industry: '行业需求与赢单论点',
  };

  /** 搜索框带清空按钮：有输入时才能清，避免空状态下的死按钮（R1-01）。 */
  function searchBox(placeholder, extraCls) {
    var st = global.PFStore.state;
    return '<div class="searchbox' + (extraCls ? ' ' + extraCls : '') + '">' + ICONS.search +
      '<input id="q" type="search" placeholder="' + U.esc(placeholder) + '" ' +
      'autocomplete="off" value="' + U.esc(st.query) + '">' +
      (st.query
        ? '<button class="icon-btn" data-clear="1" aria-label="清空搜索关键词">' + ICONS.clear + '</button>'
        : '') +
      '</div>';
  }

  function filterChips() {
    var st = global.PFStore.state;
    var facets = (st.catalog && st.catalog.facets) || {};
    var cats = facets.categories || {};
    var statuses = facets.statuses || {};
    var c = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    var s = Object.keys(statuses).sort(function (a, b) { return statuses[b] - statuses[a]; });

    return '<div class="chips">' +
      '<button class="chip' + (st.category ? '' : ' on') + '" data-cat="">全部</button>' +
      c.map(function (k) {
        return '<button class="chip' + (st.category === k ? ' on' : '') + '" data-cat="' + U.esc(k) + '">' +
          U.esc(k) + '<span class="n">' + cats[k] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="chips">' +
      '<button class="chip' + (st.status ? '' : ' on') + '" data-status="">状态不限</button>' +
      s.map(function (k) {
        return '<button class="chip' + (st.status === k ? ' on' : '') + '" data-status="' + U.esc(k) + '">' +
          U.esc(k) + '<span class="n">' + statuses[k] + '</span></button>';
      }).join('') + '</div>';
  }

  function topbarSearch() {
    var st = global.PFStore.state;
    var count = st.catalog ? st.catalog.count : 0;
    return '<div class="topbar-row mb-3">' +
        '<div><div class="topbar-title">搜索</div>' +
        '<div class="topbar-sub">' + count + ' 条物料 · 完全离线</div></div>' +
      '</div>' +
      searchBox('型号 / 料号 / 规格，如 VS1000') + filterChips();
  }

  function topbarConfig() {
    var st = global.PFStore.state;
    var g = global.PFViewConfig.group();
    if (!g) {
      return '<div class="topbar-row"><div><div class="topbar-title">选型</div>' +
        '<div class="topbar-sub">未知型号？类别 → 系列 → 型号，三层挑选</div></div></div>';
    }
    var trail = '<button class="crumb" data-cfg-back="category">选型</button>' +
      '<span class="crumb-sep">›</span>';
    if (st.cfg.level === 'models') {
      trail += '<button class="crumb" data-cfg-back="series">' + U.esc(g.label) + '</button>' +
        '<span class="crumb-sep">›</span>' +
        '<span class="crumb-cur">' + U.esc(st.cfg.series) + '</span>';
    } else {
      trail += '<span class="crumb-cur">' + U.esc(g.label) + '</span>';
    }
    var q = global.PFViewConfig.qualityLabel();
    var sub = st.cfg.level === 'series'
      ? q + '机型 · 选系列'
      : q + ' / ' + st.cfg.series + ' · 挑型号，点开看规格与料号';
    return '<div class="topbar-row"><div><div class="topbar-title">' + trail + '</div>' +
      '<div class="topbar-sub">' + U.esc(sub) + '</div></div></div>';
  }

  function topbarRival() {
    var st = global.PFStore.state;
    var segs = [
      ['match', '对标'],
      ['brand', '品牌'],
      ['objection', '话术'],
      ['industry', '行业'],
    ];
    return '<div class="topbar-row"><div><div class="topbar-title">竞品</div>' +
      '<div class="topbar-sub">' + U.esc(RIVAL_SUB[st.rivalTab]) + '</div></div></div>' +
      searchBox('竞品型号 / 品牌 / 行业', 'mt-3') +
      '<div class="seg">' + segs.map(function (s) {
        return '<button class="' + (st.rivalTab === s[0] ? 'on' : '') +
          '" data-rivaltab="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>';
  }

  function topbarCustomers() {
    var selC = global.PFCustomers.getSelected();
    var sub = selC
      ? '已选择: ' + selC.name + (selC.address ? ' · ' + selC.address : '') + '，复制整包时自动带上'
      : '点客户卡片选中，复制整包清单时自动带上客户信息';
    return '<div class="topbar-row"><div><div class="topbar-title">客户管理</div>' +
      '<div class="topbar-sub"' + (selC ? ' hot' : '') + '>' + U.esc(sub) + '</div></div></div>';
  }

  function renderTopbar() {
    var bar = U.$('#topbar');
    if (!bar) return;
    var st = global.PFStore.state;
    if (st.tab === 'search') bar.innerHTML = topbarSearch();
    else if (st.tab === 'config') bar.innerHTML = topbarConfig();
    else if (st.tab === 'rival') bar.innerHTML = topbarRival();
    else if (st.tab === 'customers') bar.innerHTML = topbarCustomers();
    else bar.innerHTML = '<div class="topbar-row"><div><div class="topbar-title">收藏</div>' +
      '<div class="topbar-sub">常用料号与偏好设置</div></div></div>';
  }

  function renderNav() {
    var el = U.$('#nav');
    if (!el) return;
    var st = global.PFStore.state;
    el.innerHTML = TABS.map(function (t) {
      var on = st.tab === t.key;
      return '<button class="' + (on ? 'on' : '') + '" data-tab="' + t.key + '"' +
        ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '" aria-label="' + U.esc(t.label) + '">' +
        ICONS[t.icon] + '<span>' + t.label + '</span></button>';
    }).join('');
  }

  global.PFChrome = {
    TABS: TABS,
    renderTopbar: renderTopbar,
    renderNav: renderNav,
  };
})(window);
