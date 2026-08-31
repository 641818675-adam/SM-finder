/* ============================================================
   PartFinder Mobile — 应用编排层

   本文件只做四件事：
     1. 组装各层（core / ui / views），按页签分发渲染
     2. 事件路由：把 DOM 上的 data-* 契约映射到具体动作
     3. 详情呈现方式：宽屏双栏 / 窄屏全屏层
     4. 启动与全局出口（window.__pf）

   不变量（重构前后逐条比对过，行为完全一致）：
     - 所有业务逻辑仍在 PFContract / PFSearch / PFCustomers / PFData 内
     - 所有 data-* 契约、DOM 结构、文案一字未改
     - 事件分派顺序与原实现的 if 链完全一致（见 ROUTES 数组顺序）

   信息架构围绕销售现场动线设计：
     搜索  打开即搜，输入型号/料号/规格立刻出结果（默认页）
     选型  按系列挑主机，自动带出线缆与配件，一键复制整包
     竞品  竞品型号查对标与应对话术
     客户  客户管理（自桌面版 V9.7 移植），选中后用于报价复制
     收藏  收藏夹 + 最近查看 + 偏好设置 + 体验反馈
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var Store = global.PFStore;
  var Modal = global.PFModal;
  var FB_CATS = ['搜索', '选型', '竞品', '客户', '界面', '性能', '其他'];

  function state() { return Store.state; }
  function esc(s) { return U.esc(s); }

  /* ---------------- 渲染分发 ---------------- */

  function renderList() {
    var host = U.$('#list-body');
    if (!host) return;
    var tab = state().tab;
    if (tab === 'search') global.PFViewResults.render(host);
    else if (tab === 'config') global.PFViewConfig.render(host);
    else if (tab === 'rival') global.PFViewRival.render(host);
    else if (tab === 'customers') global.PFViewCustomers.render(host);
    else if (tab === 'saved') global.PFViewSaved.render(host);
  }

  function renderDetailPane() {
    var pane = U.$('#detail-pane');
    if (!pane) return;
    var m = state().selected;
    if (!m) {
      pane.className = 'pane pane-detail empty';
      pane.innerHTML = '<div class="empty"><div class="big">' + global.PFIcons.search + '</div>' +
        '<div class="msg">选择一个型号查看详情</div>' +
        '<div class="hint">在左侧搜索型号/料号，或按 <span class="kbd">/</span> 快速聚焦搜索框</div></div>';
      return;
    }
    pane.className = 'pane pane-detail';
    pane.innerHTML = global.PFViewDetail.html(m, false);
  }

  function openSheet(m) {
    var host = U.$('#sheet');
    if (!host) return;
    host.innerHTML = global.PFViewDetail.html(m, true);
    host.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // 景深后退：主界面微缩变暗，衬托详情层的推入（动效本体在 base.css）
    if (document.body.classList) document.body.classList.add('sheet-open');
    Modal.reportOverlay(true);
  }

  function closeSheet() {
    var host = U.$('#sheet');
    if (!host) return;
    host.innerHTML = '';
    host.style.display = 'none';
    document.body.style.overflow = '';
    if (document.body.classList) document.body.classList.remove('sheet-open');
    Modal.reportOverlay(false);
  }

  function refreshDetail() {
    var m = state().selected;
    if (!m) return;
    var sheet = U.$('#sheet');
    if (U.isWide()) renderDetailPane();
    else if (sheet && sheet.style.display === 'flex') openSheet(m);
  }

  function focusInput() {
    var input = U.$('#q');
    if (input) input.focus();
  }

  /**
   * 列表入场动效只在切页时重放一次。
   * 输入搜索会以 140ms 防抖连续重渲染，重放入场动画会变成逐键闪烁，
   * 因此 runSearch 路径负责把类摘掉，这里负责以重排触发重新播放。
   */
  function playListEntrance() {
    var host = U.$('#list-body');
    if (!host || !host.classList) return;
    host.classList.remove('anim');
    void (host.offsetWidth || 0);
    host.classList.add('anim');
  }

  /* ---------------- 搜索 ---------------- */

  function runSearch(resetPage) {
    var st = state();
    if (!st.catalog) return;
    st.query = U.normalizeQuery(st.query);
    var hideRetired = global.PFData.settings.get('hideRetired');
    var status = st.status;
    if (hideRetired && !status) status = '';

    st.results = global.PFSearch.search(st.catalog.materials, st.query, {
      category: st.category,
      status: status,
      includeAccessory: global.PFData.settings.get('includeAccessory') !== false,
    }, Store.SEARCH_CAP);

    if (hideRetired) {
      st.results = st.results.filter(function (m) { return m.status !== '退市'; });
    }
    if (resetPage) Store.resetShown();
    renderList();
    // 详情面板的内容只由 selected + cableLength 决定，与关键词无关。
    // 原实现每次键入都重绘详情（含一次全库套包解析），此处移除；视觉结果一致。
    var host = U.$('#list-body');
    if (host && host.classList) host.classList.remove('anim');
  }

  /* ---------------- 页签切换 ---------------- */

  function switchTab(key) {
    var st = state();
    st.tab = key;
    Store.resetShown();
    st.selected = null;
    if (key !== 'search') st.query = '';
    U.buzz(10);
    closeSheet();
    U.vt(function () {
      global.PFChrome.renderNav();
      global.PFChrome.renderTopbar();
      renderList();
      renderDetailPane();
      playListEntrance();
      // 页签态挂到 body：大屏"单栏画布模式"由 CSS 依据 data-tab 驱动
      // （竞品/客户/收藏空详情栏收起、列表栏展宽；窄屏不受影响）。
      // 旧版这里用内联 style 隐藏详情栏，会连带掐断收藏/竞品页点卡片开详情的宽屏路径。
      if (document.body && document.body.setAttribute) document.body.setAttribute('data-tab', key);
      if (key === 'search') focusInput();
      window.scrollTo(0, 0);
    });
  }

  /* ---------------- 体验反馈 ---------------- */

  function deviceMeta() {
    var dark = false;
    try { dark = global.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* 忽略 */ }
    return {
      app_version: Store.APP_VERSION,
      data_version: state().catalog ? state().catalog.version : '',
      data_count: state().catalog ? state().catalog.count : 0,
      screen_width: global.innerWidth || 0,
      screen_height: global.innerHeight || 0,
      dark_mode: dark,
    };
  }

  function feedbackRecord(rating, cats, message) {
    var rec = Object.assign({
      type: 'partfinder-feedback',
      submitted_at: new Date().toISOString(),
      rating: rating,
      categories: cats,
      message: String(message || '').trim(),
    }, deviceMeta());
    var raw = global.PFData.getPref('feedback_log');
    var log = [];
    if (raw) { try { log = JSON.parse(raw) || []; } catch (e) { /* 忽略 */ } }
    log.unshift(rec);
    global.PFData.setPref('feedback_log', JSON.stringify(log.slice(0, 50)));
    return rec;
  }

  function feedbackModal() {
    var st = state();
    st.fbRating = 0;
    st.fbCats = [];
    Modal.open(
      '<div class="modal-title">体验反馈</div>' +
      '<div class="modal-body left">' +
        '<div class="field-label fb-label">整体体验打分</div>' +
        '<div class="fb-stars">' +
          [1, 2, 3, 4, 5].map(function (n) {
            // R2-04：未选中用描边星，选中后换实心星，形状+颜色双重编码
            return '<button class="fb-star" data-fb-rate="' + n + '" aria-label="' + n + ' 星">' +
              global.PFIcons.star + '</button>';
          }).join('') +
        '</div>' +
        '<div class="field-label fb-label mt-4">问题或建议类型（可多选）</div>' +
        ' <div class="chips flush">' +
          FB_CATS.map(function (c) {
            return '<button class="chip" data-fb-cat="' + esc(c) + '">' + esc(c) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="field-label fb-label mt-4">具体描述（选填）</div>' +
        '<textarea id="fb-text" class="fb-text" rows="3" placeholder="哪一步卡住了？希望改成什么样？"></textarea>' +
        '<div class="fb-meta">将随反馈自动附上：版本号、数据版本、屏幕宽度、深色模式（不含业务数据）</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn" data-modal-close="1">取消</button>' +
        '<button class="btn primary" data-fb-send="1">' + global.PFIcons.send + '提交</button>' +
      '</div>');
  }

  function sendFeedback() {
    var st = state();
    if (!st.fbRating) { U.toast('请先打分'); return; }
    var msgEl = document.getElementById('fb-text');
    var rec = feedbackRecord(st.fbRating, st.fbCats.slice(), msgEl ? msgEl.value : '');
    // 提交即复制结构化 JSON：离线场景下唯一可靠的回收通道是粘贴给收集人
    U.copyText(JSON.stringify(rec, null, 2));
    Modal.close();
    U.toast('感谢反馈！上报内容已复制');
  }

  /* ---------------- 客户导入 / 删除确认 ---------------- */

  function importModal() {
    Modal.open(
      '<div class="modal-title">从桌面版导入客户</div>' +
      '<div class="modal-body left">' +
        '<div class="fb-meta mb-3">桌面版执行 scripts/export_customers.py 导出 JSON，' +
        '传到手机后粘贴到下方（同名同地址客户自动去重）：</div>' +
        '<textarea id="import-text" class="fb-text" rows="5" placeholder=\'{"type":"partfinder-customers",...}\'></textarea>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn" data-modal-close="1">取消</button>' +
        '<button class="btn primary" data-cust-import-run="1">导入</button>' +
      '</div>');
    // 桥接可用时尝试直接读剪贴板，省去手动粘贴
    setTimeout(function () {
      var ta = document.getElementById('import-text');
      if (!ta || ta.value) return;
      try {
        if (global.Android && global.Android.paste) {
          var clip = global.Android.paste();
          if (clip && clip.indexOf('partfinder-customers') >= 0) ta.value = clip;
        }
        // iOS PWA：读剪贴板需 HTTPS + 授权，失败静默（用户可手动粘贴）
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.readText &&
            /^https:$/.test(global.location.protocol)) {
          global.navigator.clipboard.readText().then(function (clip) {
            if (clip && clip.indexOf('partfinder-customers') >= 0 && !ta.value) ta.value = clip;
          }, function () { /* 忽略 */ });
        }
      } catch (e) { /* 忽略 */ }
    }, 60);
  }

  function runImport() {
    var ta = document.getElementById('import-text');
    var text = ta ? ta.value : '';
    if (!text.trim()) { U.toast('请先粘贴导出的 JSON'); return; }
    var r = global.PFCustomers.importJSON(text);
    if (r && r.error) {
      U.toast(r.error === 'parse'
        ? 'JSON 无法解析，请检查是否完整'
        : 'JSON 缺少 customers 数组，请确认是桌面版导出的内容');
      return;
    }
    if (!r) { U.toast('JSON 无法解析，请检查是否完整'); return; }
    Modal.close();
    U.toast('导入完成：新增 ' + r.added + '，跳过 ' + r.skipped);
    renderList();
  }

  /* ---------------- 整机备份 / 恢复（换机迁移） ---------------- */

  var BK_LABEL = {
    favorites: '收藏', recent: '最近查看', settings: '偏好',
    customers: '客户', feedback_log: '反馈',
  };

  function backupExportModal() {
    var text = global.PFData.backup.dump();
    var sum = global.PFData.backup.summary()
      .filter(function (s) { return s.count; })
      .map(function (s) { return BK_LABEL[s.key] + ' ' + s.count; })
      .join(' · ');
    Modal.open(
      '<div class="modal-title">导出备份</div>' +
      '<div class="modal-body left">' +
        '<div class="fb-meta mb-3">本机数据：' + (sum || '暂无可备份内容') +
        '。复制下方文本，在新设备的「恢复备份」里粘贴即可（不含物料库，新设备装上应用自带）。</div>' +
        '<textarea id="bk-out" class="fb-text" rows="5" readonly>' + U.esc(text) + '</textarea>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn" data-modal-close="1">关闭</button>' +
        '<button class="btn primary" data-bk-copy="1">' + global.PFIcons.copy + '复制</button>' +
      '</div>');
  }

  function backupCopy() {
    var ta = document.getElementById('bk-out');
    U.copyText(ta ? ta.value : '', '备份已复制', global.PFIcons.check);
  }

  function backupImportModal() {
    Modal.open(
      '<div class="modal-title">恢复备份</div>' +
      '<div class="modal-body left">' +
        '<div class="fb-meta mb-3">粘贴另一台设备导出的备份文本。' +
        '<b>同名数据会被覆盖</b>，恢复后应用会自动重载以重建索引：</div>' +
        '<textarea id="bk-in" class="fb-text" rows="5" placeholder=\'{"type":"partfinder-backup",...}\'></textarea>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn" data-modal-close="1">取消</button>' +
        '<button class="btn primary" data-bk-restore="1">覆盖恢复</button>' +
      '</div>');
    // 与客户导入同一套读剪贴板策略，省去手动粘贴
    setTimeout(function () {
      var ta = document.getElementById('bk-in');
      if (!ta || ta.value) return;
      try {
        if (global.Android && global.Android.paste) {
          var clip = global.Android.paste();
          if (clip && clip.indexOf('partfinder-backup') >= 0) ta.value = clip;
        }
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.readText &&
            /^https:$/.test(global.location.protocol)) {
          global.navigator.clipboard.readText().then(function (clip) {
            if (clip && clip.indexOf('partfinder-backup') >= 0 && !ta.value) ta.value = clip;
          }, function () { /* 忽略 */ });
        }
      } catch (e) { /* 忽略 */ }
    }, 60);
  }

  /**
   * 恢复后整页重载，而不是就地重绘：
   * Store 的收藏集合 / 料号索引 / 系列计数三处缓存只在 toggleFav 与 setCatalog 时失效，
   * 批量改写持久化层会绕过这两个入口。重载是唯一能保证缓存与磁盘一致的做法。
   */
  function backupRestore() {
    var ta = document.getElementById('bk-in');
    var text = ta ? ta.value : '';
    if (!text.trim()) { U.toast('请先粘贴备份文本'); return; }
    var r = global.PFData.backup.restore(text);
    if (!r.ok) { U.toast(r.msg); return; }
    Modal.close();
    var names = r.keys.map(function (k) { return BK_LABEL[k] || k; }).join('、');
    U.toast('已恢复 ' + names + '，正在重载…', global.PFIcons.check);
    setTimeout(function () { global.location.reload(); }, 800);
  }

  /** 确认弹层的主动作。R3-01：删除的客户若正用于报价，必须说明连带后果。 */
  function confirmModalOk() {
    var st = state();
    var delPending = st._pendingDel;
    st._pendingDel = null;
    if (delPending !== undefined && delPending !== null) {
      var selNow = global.PFCustomers.getSelected();
      var wasSelected = selNow && selNow.id === delPending;
      if (global.PFCustomers.remove(delPending)) {
        U.toast(wasSelected ? '客户已删除，已同时取消报价选择' : '客户已删除');
      }
      global.PFChrome.renderTopbar();
      renderList();
    }
    Modal.close();
  }

  function saveCustomerFromForm() {
    if (global.PFViewCustomers.saveFromForm()) renderList();
  }

  /* ---------------- 事件路由 ---------------- */

  /**
   * data-* 契约 → 动作。
   * 数组顺序即分派优先级：
   *   1. 具体操作路由优先（客户/收藏/复制/反馈/备份等），
   *      否则 <body data-tab="..."> 会被 [data-tab] 先命中并吞掉所有点击。
   *   2. [data-tab] 放在具体操作之后，确保页签按钮仍然能切换。
   *   3. .card 兜底，仅在无更具体匹配时触发卡片选中。
   */
  var ROUTES = [
    ['[data-act]', function (el) {
      var st = state();
      var act = el.getAttribute('data-act');
      if (act === 'clear-filters') {
        st.category = ''; st.status = '';
        global.PFData.settings.set('hideRetired', false);
        Store.resetShown(); global.PFChrome.renderTopbar(); runSearch(true);
      } else if (act === 'clear-query') {
        st.query = '';
        Store.resetShown(); global.PFChrome.renderTopbar(); runSearch(true); focusInput();
      } else if (act === 'despace') {
        st.query = st.query.replace(/\s+/g, '');
        Store.resetShown(); global.PFChrome.renderTopbar(); runSearch(true);
      } else if (act === 'cfg-home') {
        st.cfg.level = 'category'; st.cfg.group = ''; st.cfg.series = '';
        Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
      }
    }],

    ['[data-cat]', function (el) {
      state().category = el.getAttribute('data-cat');
      Store.resetShown(); global.PFChrome.renderTopbar(); runSearch(true);
    }],
    ['[data-status]', function (el) {
      state().status = el.getAttribute('data-status');
      Store.resetShown(); global.PFChrome.renderTopbar(); runSearch(true);
    }],

    ['[data-cfg-group]', function (el) {
      var cfg = state().cfg;
      cfg.group = el.getAttribute('data-cfg-group');
      cfg.level = 'series';
      cfg.series = '';
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],
    ['[data-cfg-quality]', function (el) {
      var cfg = state().cfg;
      cfg.quality = el.getAttribute('data-cfg-quality');
      cfg.level = 'series';
      cfg.series = '';
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],
    ['[data-cfg-series]', function (el) {
      var cfg = state().cfg;
      cfg.series = el.getAttribute('data-cfg-series');
      cfg.level = 'models';
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],
    ['[data-cfg-back]', function (el) {
      global.PFViewConfig.goBack(el.getAttribute('data-cfg-back'));
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],

    ['[data-rivaltab]', function (el) {
      state().rivalTab = el.getAttribute('data-rivaltab');
      state().rivalBrand = ''; state().rivalModel = '';
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],

    ['[data-open-brand]', function (el, e) {
      if (e && e.target && e.target.closest && e.target.closest('[data-copy-brand]')) return;
      state().rivalTab = 'brand';
      state().rivalBrand = el.getAttribute('data-open-brand');
      state().rivalModel = '';
      state().query = '';
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],

    ['[data-open-rmodel]', function (el) {
      state().rivalModel = el.getAttribute('data-open-rmodel');
      state().query = '';
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],

    ['[data-rival-back]', function (el) {
      var to = el.getAttribute('data-rival-back');
      if (to === 'list') { state().rivalBrand = ''; state().rivalModel = ''; }
      else { state().rivalModel = ''; }
      Store.resetShown(); global.PFChrome.renderTopbar(); renderList();
    }],

    ['[data-copy-script]', function (el) {
      var objs = (state().rival.sales && state().rival.sales.objections) || [];
      var ob = objs[parseInt(el.getAttribute('data-copy-script'), 10)];
      if (ob) {
        U.copyText('客户异议：' + ob.objection +
          '\n应对策略：' + (ob.strategy || '') +
          '\n参考话术：' + (ob.script || '') +
          (ob.support ? '\n支撑材料：' + ob.support : ''));
      }
    }],
    ['[data-copy-brand]', function (el) {
      var bName = el.getAttribute('data-copy-brand');
      var bHit = (state().rival.brands || []).filter(function (x) { return x.name === bName; })[0];
      if (bHit) {
        U.copyText([
          '【' + bHit.name + '】',
          '市场定位：' + (bHit.market_position || ''),
          '价格区间：' + (bHit.price_range || ''),
          '算法优势：' + (bHit.algorithm_advantage || ''),
          '主要弱点：' + (bHit.weakness || ''),
          '可打击点：' + (bHit.beatable_area || ''),
          '应对策略：' + (bHit.tactic || ''),
        ].join('\n'));
      }
    }],

    ['[data-more]', function () { Store.loadMore(); renderList(); }],
    ['[data-clear]', function () {
      state().query = '';
      global.PFChrome.renderTopbar(); runSearch(true); focusInput();
    }],
    ['[data-close]', function () { closeSheet(); }],

    ['[data-toggle]', function (el) {
      var key = el.getAttribute('data-toggle');
      global.PFData.settings.set(key, !global.PFData.settings.get(key));
      renderList();
      if (state().tab === 'search') runSearch(true);
    }],

    ['[data-cable]', function (el) {
      state().cableLength = el.getAttribute('data-cable');
      refreshDetail();
    }],
    // 需求2：逐项复制 —— 仅复制该项料号，轻提示「复制成功」
    ['[data-copy-part]', function (el) {
      U.copyText(el.getAttribute('data-copy-part'), '复制成功', 'check');
    }],
    ['[data-copy-no]', function (el) { U.copyText(el.getAttribute('data-copy-no')); }],

    ['[data-fav],[data-fav-detail]', function (el, e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var no = el.getAttribute('data-fav') || el.getAttribute('data-fav-detail');
      var added = Store.toggleFav(no);
      U.toast(added ? '已加入收藏' : '已取消收藏');
      renderList();
      refreshDetail();
    }],

    ['[data-copy-all]', function (el) {
      var m = Store.byNo(el.getAttribute('data-copy-all'));
      if (m) U.copyText(global.PFViewDetail.specText(m));
    }],
    ['[data-copy-set]', function (el) {
      var st = state();
      var m = Store.byNo(el.getAttribute('data-copy-set'));
      if (!m) return;
      var kitText = global.PFContract.toText(
        global.PFContract.resolve(m, st.catalog.materials, st.cableLength));
      // 桌面版动线「选客户 → 报价」的移动端等效：选中客户时清单头部带客户信息
      var head = global.PFCustomers.quoteHeader();
      U.copyText(head ? head + '\n\n' + kitText : kitText);
    }],

    /* ---- 客户管理（必须先于通用 .card 分支，否则按钮点击被卡片选中吞掉） ---- */
    ['[data-cust-copy]', function (el) {
      var c = global.PFCustomers.get(Number(el.getAttribute('data-cust-copy')));
      if (c) U.copyText(global.PFCustomers.copyText(c));
    }],
    ['[data-cust-edit]', function (el) {
      state().custEditing = Number(el.getAttribute('data-cust-edit'));
      renderList();
      window.scrollTo(0, 0);
    }],
    ['[data-cust-del]', function (el) {
      var id = Number(el.getAttribute('data-cust-del'));
      var c = global.PFCustomers.get(id);
      if (!c) return;
      // 对齐桌面版「确定要删除客户「X」吗？」确认弹窗，默认取消
      Modal.confirm({
        title: '确认删除',
        body: '确定要删除客户「' + c.name + '」吗？',
        confirmLabel: '删除',
        danger: true,
      });
      state()._pendingDel = id;
    }],
    ['[data-cust-select]', function (el) {
      var id = Number(el.getAttribute('data-cust-select'));
      var c = global.PFCustomers.get(id);
      if (c) {
        var cur = global.PFCustomers.getSelected();
        // 再点一次已选中的卡片 = 取消选择（桌面版无此操作，但移动端需要明确出口）
        if (cur && cur.id === id) {
          global.PFCustomers.setSelected(null);
          U.toast('已取消选择');
        } else {
          global.PFCustomers.setSelected(c);
          U.toast('已选择: ' + c.name);
        }
      }
      global.PFChrome.renderTopbar();
      renderList();
    }],
    ['[data-cust-clear]', function () {
      global.PFCustomers.setSelected(null);
      U.toast('已取消选择');
      global.PFChrome.renderTopbar();
      renderList();
    }],
    ['[data-cust-save]', function () { saveCustomerFromForm(); }],
    ['[data-cust-cancel]', function () { state().custEditing = null; renderList(); }],
    ['[data-cust-export]', function () {
      var n = global.PFCustomers.count();
      if (!n) { U.toast('暂无客户可导出'); return; }
      U.copyText(global.PFCustomers.exportJSON());
      U.toast('已导出 ' + n + ' 个客户到剪贴板');
    }],
    ['[data-cust-import]', function () { importModal(); }],
    ['[data-cust-import-run]', function () { runImport(); }],

    /* ---- 模态与体验反馈 ---- */
    ['[data-modal-close]', function () { Modal.close(); }],
    ['[data-modal-ok]', function () { confirmModalOk(); }],
    ['[data-fb-open]', function () { feedbackModal(); }],
    ['[data-fb-rate]', function (el) {
      var st = state();
      st.fbRating = Number(el.getAttribute('data-fb-rate'));
      var stars = document.querySelectorAll('.fb-star');
      if (!stars || !stars.length) return;
      for (var i = 0; i < stars.length; i++) {
        var on = i < st.fbRating;
        stars[i].classList.toggle('on', on);
        // R2-04：形状随选中态切换（描边星 ↔ 实心星）
        stars[i].innerHTML = on ? global.PFIcons.starOn : global.PFIcons.star;
      }
    }],
    ['[data-fb-cat]', function (el) {
      var st = state();
      var cat = el.getAttribute('data-fb-cat');
      var i = st.fbCats.indexOf(cat);
      if (i >= 0) st.fbCats.splice(i, 1); else st.fbCats.push(cat);
      el.classList.toggle('on', i < 0);
    }],
    ['[data-fb-send]', function () { sendFeedback(); }],

    /* ---- 数据迁移：整机备份 / 恢复（iOS PWA 无 7 天签名到期，靠此通道跨设备搬运） ---- */
    ['[data-bk-export]', function () { backupExportModal(); }],
    ['[data-bk-import]', function () { backupImportModal(); }],
    ['[data-bk-copy]', function () { backupCopy(); }],
    ['[data-bk-restore]', function () { backupRestore(); }],

    /* ---- 兜底：通用物料卡片（必须在 [data-tab] 之前，否则 <body data-tab> 会拦截所有点击） ---- */
    ['.card', function (el) {
      var st = state();
      var m = Store.byNo(el.getAttribute('data-no'));
      if (!m) return;
      st.selected = m;
      // 需求2：选型动线=规格优先；搜索/收藏动线=料号优先
      st.detailMode = st.tab === 'config' ? 'select' : 'lookup';
      global.PFData.recent.push(m.material_no);
      if (U.isWide()) {
        renderList();
        renderDetailPane();
      } else {
        openSheet(m);
      }
    }],

    /* ---- 页签切换（必须在具体操作和 .card 之后，否则 <body data-tab> 会拦截所有点击） ---- */
    ['[data-tab]', function (el) { switchTab(el.getAttribute('data-tab')); }],
  ];

  var searchTimer = null;

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      // 极端老 WebView 下 e.target 可能是无 closest 的节点，直接忽略而不是抛异常
      if (!t || typeof t.closest !== 'function') return;
      for (var i = 0; i < ROUTES.length; i++) {
        var el = t.closest(ROUTES[i][0]);
        if (el) {
          // DEBUG: 记录匹配结果
          console.log('[ROUTES] matched:', ROUTES[i][0], 'el:', el.tagName, el.className || el.id || '', 'selectorIndex:', i);
          ROUTES[i][1](el, e);
          return;
        }
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'q') {
        state().query = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          Store.resetShown();
          if (state().tab === 'search') runSearch(true);
          else if (state().tab === 'rival') renderList();
        }, 90);
      }
    });

    // 折叠屏形态变化时重新决定详情呈现方式
    global.addEventListener('resize', function () {
      if (U.isWide()) closeSheet();
      renderDetailPane();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSheet(); return; }

      // 客户表单：输入法「完成/回车」= 保存（R3-03）
      if (global.PFViewCustomers.handleEnter(e)) return;

      // 卡片声明了 role="button"，键盘必须能激活，否则无障碍改造只做了一半
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        var card = e.target && e.target.closest ? e.target.closest('.card') : null;
        if (card) {
          e.preventDefault();
          card.click();
          return;
        }
      }

      // "/" 聚焦搜索框：桌面/外接键盘场景下的高频诉求
      if (e.key === '/' && state().tab === 'search' && e.target !== U.$('#q')) {
        e.preventDefault();
        focusInput();
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    global.PFData.loadCatalog().then(function (catalog) {
      Store.setCatalog(catalog);
      state().results = catalog.materials.slice(0, Store.PAGE_SIZE * 3);

      // 竞品数据为可选资源，缺失不阻断启动
      return global.PFData.loadJSON('data/competitor.json').then(function (r) {
        state().rival = r;
      }).catch(function () {
        state().rival = null;
      });
    }).then(function () {
      bindEvents();
      // 启动屏淡出：必须先于 bindEvents 绑定，否则 splash visibility:hidden + pointer-events:auto
      // 会在淡出期内（~360ms）拦截所有点击，用户反馈"按钮无反应"即源于此窗口期。
      var sp = document.getElementById('splash');
      if (sp && sp.classList && sp.classList.add) {
        sp.classList.add('out');
        setTimeout(function () {
          var el = document.getElementById('splash');
          if (el && el.remove) el.remove();
        }, 260);
      } else if (sp && sp.remove) {
        sp.remove();
      }
      global.PFChrome.renderNav();
      global.PFChrome.renderTopbar();
      renderList();
      renderDetailPane();
      // 初始页签挂到 body（switchTab 之后的每次切换也会同步），供大屏画布模式 CSS 使用
      if (document.body && document.body.setAttribute) document.body.setAttribute('data-tab', state().tab);
      // 启动屏淡出后主区上浮接力；classList 缺失（测试桩）时静默跳过
      if (document.body && document.body.classList) document.body.classList.add('pf-ready');
      // 页签深链：#search/#config/#rival/#customers/#saved 直达对应页签（U2 定宽截图 + 可分享）
      var h = (global.location && global.location.hash || '').replace('#', '');
      if (['search', 'config', 'rival', 'customers', 'saved'].indexOf(h) >= 0 && h !== state().tab) {
        switchTab(h);
      } else if (h === 'detail') {
        // 进入搜索并选中首条结果，宽屏下于右侧详情栏呈现（U2 详情栏定宽截图）
        switchTab('search');
        var first = (state().results || [])[0];
        if (first) {
          state().selected = first;
          global.PFData.recent.push(first.material_no);
          renderDetailPane();
          if (!U.isWide()) openSheet(first);
        }
      }
    }).catch(function (err) {
      var sp = document.getElementById('splash');
      if (sp) {
        sp.innerHTML = '<div class="n">数据加载失败</div><div class="s">' + esc(err.message) + '</div>' +
          '<button class="btn empty-cta" onclick="location.reload()">重试</button>';
      }
    });
  }

  // 暴露渲染入口：既供原生层在折叠态变化时回调，也便于离线自测驱动。
  global.__pf = {
    onResize: function () {
      if (U.isWide()) closeSheet();
      renderDetailPane();
    },
    pause: function () {},
    resume: function () {},
    /** 硬件返回键逐层退出：先弹层，再详情 sheet（R2-01）。 */
    closeTop: function () {
      if (Modal.isOpen()) { Modal.close(); return; }
      var sheet = U.$('#sheet');
      if (sheet && sheet.style.display === 'flex') { closeSheet(); return; }
      Modal.reportOverlay(false);
    },
    state: state(),
    version: Store.APP_VERSION,
    boot: boot,
    findByNo: function (no) { return Store.byNo(no); },
    renderTopbar: function () { global.PFChrome.renderTopbar(); },
    renderList: renderList,
    renderDetailPane: renderDetailPane,
    renderNav: function () { global.PFChrome.renderNav(); },
    renderCustomerList: function () { global.PFViewCustomers.render(U.$('#list-body')); },
    saveCustomerFromForm: saveCustomerFromForm,
    confirmModal: function (opts) { Modal.confirm(opts); },
    confirmModalOk: confirmModalOk,
    handleCustEnter: function (e) { return global.PFViewCustomers.handleEnter(e); },
    loadMore: function () { Store.loadMore(); },
    resetShown: function () { Store.resetShown(); },
    openModal: function (inner) { Modal.open(inner); },
    closeModal: function () { Modal.close(); },
    modalHTML: function () { return Modal.html(); },
    feedbackModal: feedbackModal,
    feedbackRecord: feedbackRecord,
    importModal: importModal,
    runImport: runImport,
    deviceMeta: deviceMeta,
    detailHTML: function (m, asSheet) { return global.PFViewDetail.html(m, asSheet); },
    switchTab: switchTab,
    searchEmptyCopy: function () { return global.PFViewResults.emptyCopy(); },
    normalizeQuery: U.normalizeQuery,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
