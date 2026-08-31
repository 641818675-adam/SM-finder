/* ============================================================
   状态层 —— 唯一的可变状态源 + 两处查询加速索引

   加速索引（本次优化引入，纯性能，不改变任何数据语义）：
     1. 料号 → 物料 Map：替代原先每卡片一次的全库线性扫描
     2. 收藏 Set：PFData.favorites.has() 原为「读偏好 + JSON.parse + indexOf」，
        渲染 600 张卡片时会执行 600 次解析。改为惰性同步一次、之后 O(1) 命中。
     3. 选型系列计数缓存：类别层与系列层原本各自遍历全库，合并为一次遍历 + 缓存。

   失效规则：只有 toggleFav 会改收藏，只有 setCatalog 会换物料库，
   因此缓存失效点收敛到这两个入口，不存在脏读路径。
   ============================================================ */

(function (global) {
  'use strict';

  var PAGE_SIZE = 30;
  // 空态/宽泛检索的最大返回量。1213 条全部渲染会拖慢低端 WebView 的滚动，
  // 600 条 + 诚实文案 + 触顶指引是浏览完整性与流畅度的折中（R1-03）。
  var SEARCH_CAP = 600;

  // 与 build.py 的 VERSION_NAME 保持同步（此前两处漂移为 10.3.0 / 10.4.1）
  var APP_VERSION = '10.8.0';

  var state = {
    catalog: null,
    rival: null,
    tab: 'search',
    query: '',
    category: '',
    status: '',
    results: [],
    shown: PAGE_SIZE,
    selected: null,
    series: '',
    cableLength: '3M',
    rivalTab: 'match',
    // 竞品品牌钻取：品牌页 / 机型详情（空串=品牌列表页）
    rivalBrand: '',
    rivalModel: '',
    moreClicks: 0,
    // 选型三级钻取：类别（读码器/智能相机）→ 系列 → 型号
    cfg: { level: 'category', group: '', quality: 'original', series: '' },
    // 详情排序模式：lookup=查料号（料号优先）；select=选型号（规格优先）
    detailMode: 'lookup',
    // 客户管理：表单编辑态（null = 新增）
    custEditing: null,
    // 体验反馈表单
    fbRating: 0,
    fbCats: [],
  };

  /* ---- 索引 ---- */

  var noIndex = Object.create(null);   // material_no -> material
  var favSet = Object.create(null);    // material_no -> true
  var favReady = false;
  var seriesCache = Object.create(null); // "group|quality" -> [{name,count}]

  function setCatalog(catalog) {
    state.catalog = catalog;
    noIndex = Object.create(null);
    seriesCache = Object.create(null);
    favReady = false;
    var list = catalog && catalog.materials ? catalog.materials : [];
    for (var i = 0; i < list.length; i++) {
      noIndex[list[i].material_no] = list[i];
    }
  }

  /** O(1) 料号查物料。索引缺失（异常兜底）时退回线性扫描，保证不返回 undefined。 */
  function byNo(no) {
    var hit = noIndex[no];
    if (hit) return hit;
    var list = state.catalog ? state.catalog.materials : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].material_no === no) {
        noIndex[no] = list[i];
        return list[i];
      }
    }
    return null;
  }

  function syncFav() {
    if (favReady) return;
    favSet = Object.create(null);
    var list = global.PFData.favorites.all();
    for (var i = 0; i < list.length; i++) favSet[list[i]] = true;
    favReady = true;
  }

  function hasFav(no) {
    syncFav();
    return favSet[no] === true;
  }

  /** 与 PFData.favorites.toggle 行为一致：返回 true 表示"本次是加入收藏"。 */
  function toggleFav(no) {
    var added = global.PFData.favorites.toggle(no);
    favReady = false;
    return added;
  }

  function allFav() {
    return global.PFData.favorites.all();
  }

  /* ---- 分页游标 ---- */

  /** R3-02：加载更多步进递增——首次 +30，之后 +60。上限提升到 600 后
      固定 30 的步长会让"翻全量"退化成高频连点。 */
  function loadMore() {
    state.moreClicks = (state.moreClicks || 0) + 1;
    state.shown += PAGE_SIZE * (state.moreClicks > 1 ? 2 : 1);
  }

  /** 触发新结果集时统一重置分页游标（含加载步进计数）。 */
  function resetShown() {
    state.shown = PAGE_SIZE;
    state.moreClicks = 0;
  }

  /* ---- 选型系列计数（缓存，键 = group|quality） ---- */

  function seriesCounts(group, quality, matchFn) {
    var key = group + '|' + quality;
    if (seriesCache[key]) return seriesCache[key];
    var counts = {};
    var order = [];
    var list = state.catalog ? state.catalog.materials : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.is_accessory === 1) continue;
      if (matchFn && !matchFn(m)) continue;
      var k = global.PFSearch.seriesKey(m.product_series);
      if (!k) continue;
      if (counts[k] === undefined) { counts[k] = 0; order.push(k); }
      counts[k] += 1;
    }
    var out = order
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (k) { return { name: k, count: counts[k] }; });
    seriesCache[key] = out;
    return out;
  }

  global.PFStore = {
    PAGE_SIZE: PAGE_SIZE,
    SEARCH_CAP: SEARCH_CAP,
    APP_VERSION: APP_VERSION,
    state: state,
    setCatalog: setCatalog,
    byNo: byNo,
    hasFav: hasFav,
    toggleFav: toggleFav,
    allFav: allFav,
    loadMore: loadMore,
    resetShown: resetShown,
    seriesCounts: seriesCounts,
  };
})(window);
