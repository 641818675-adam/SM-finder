/* ============================================================
   型号详情 —— 两种动线共用一套内容，只换顺序

     lookup（搜索/收藏进来，已知料号）：料号速览置顶 → 套包 → 规格折叠在页尾
     select（选型进来，未知料号）：规格参数优先 → 料号速览 → 套包
   内容完全相同，差异只在顺序，避免"查料号的人要滚三屏才看到料号"。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var UI = global.PFUI;
  var ICONS = global.PFIcons;

  var SPEC_LABELS = {
    material_no: '料号', material_code: '型号', material_name: '名称',
    description: '描述', product_category: '类别', product_series: '系列',
    version: '版本', status: '状态', applicable_models: '适用机型',
    light_source: '光源', focal_length: '焦距', polarization: '偏振',
    pixel: '像素', resolution: '分辨率', focus_method: '调焦方式',
    algorithm: '算法', remark: '备注', price: '价格', price_model: '价格型号',
  };

  // 详情页展示顺序
  var SPEC_ORDER = [
    'material_no', 'material_code', 'material_name', 'product_category',
    'product_series', 'version', 'status', 'pixel', 'resolution',
    'light_source', 'polarization', 'focal_length', 'focus_method',
    'algorithm', 'applicable_models', 'description', 'remark',
    'price', 'price_model',
  ];

  var FOLD_ARROW = '<svg class="fold-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8 10l4 4 4-4"/></svg>';

  function state() { return global.PFStore.state; }

  /**
   * 套包规则覆盖度提示。
   * resolve 只返回主机（required.length<=1）说明该系列未配置线缆/配件规则，
   * 此时"整套料号"并不完整，必须显式告知用户，避免漏录 CRM。
   */
  function kitWarningHTML(m, set) {
    if (set.hasCable) return '';
    // VS680 为一体机，本就无外接线缆套包，不提示"套包规则未覆盖"
    if (global.PFSearch.seriesKey(m.product_series) === 'VS680') return '';
    var series = global.PFSearch.seriesKey(m.product_series) || '该系列';
    return '<div class="contract-warning">' +
      '<strong>套包规则未覆盖：</strong>' + U.esc(series) +
      ' 暂无线缆配置，下方清单缺少线缆料号。请按选型手册人工补齐后再录入 CRM。' +
      '</div>';
  }

  /** 首屏料号速览行 —— 机型料号与配套线材料号固定在首屏（需求1）。 */
  function glanceRow(label, no) {
    return '<div class="glance-row">' +
      '<span class="g-label">' + U.esc(label) + '</span>' +
      '<span class="g-lead" aria-hidden="true"></span>' +
      '<span class="g-code mono">' + U.esc(no) + '</span>' +
      UI.partCopyBtn(no, label + '料号') + '</div>';
  }

  /** 同款线缆的其他长度。长度已由 chip 切换，此处仅备查，不计入复制清单。 */
  function alternatesHTML(set) {
    if (!set.alternates || !set.alternates.length) return '';
    return UI.section('同款其他长度 · ' + set.alternates.length,
      '<div class="alt-note">长度由上方「线长」切换，此处仅备查，不计入复制清单</div>' +
      set.alternates.map(function (it) {
        return UI.kv(U.esc(it.role),
          '<div>' + U.esc(U.displayCode(it.material)) + '</div>' +
          '<div class="mono-sub">' + U.esc(it.material.material_no) + '</div>',
          { trailing: UI.partCopyBtn(it.material.material_no, it.role + '料号') });
      }).join(''),
      { cls: 'alternates' });
  }

  function specRows(m) {
    return SPEC_ORDER.map(function (k) {
      var v = m[k];
      if (k === 'price') {
        if (!v) return '';
        v = '¥' + v;
      } else {
        v = U.fmtSpec(k, v);
      }
      if (!v) return '';
      return UI.kv(U.esc(SPEC_LABELS[k]), U.esc(v));
    }).join('');
  }

  /** 「复制全部规格」的文本：与详情页字段顺序一致，换行压平便于粘贴。 */
  function specText(m) {
    var lines = [];
    SPEC_ORDER.forEach(function (k) {
      var v;
      if (k === 'price') {
        if (!m[k]) return;
        v = '¥' + m[k];
      } else {
        v = U.fmtSpec(k, m[k]);
      }
      if (!v) return;
      lines.push(SPEC_LABELS[k] + '：' + String(v).replace(/\n/g, ' '));
    });
    return lines.join('\n');
  }

  function kitItemRow(it) {
    if (!it.material) {
      return UI.kv(U.esc(it.role), U.esc(it.note), { vCls: 'v-missing' });
    }
    return UI.kv(U.esc(it.role),
      '<div class="v-primary">' + U.esc(U.displayCode(it.material)) + '</div>' +
      '<div class="mono-sub">' + U.esc(it.material.material_no) + '</div>',
      { trailing: UI.partCopyBtn(it.material.material_no, it.role + '料号') });
  }

  function html(m, asSheet) {
    var st = state();
    var fav = global.PFStore.hasFav(m.material_no);
    var set = global.PFContract.resolve(m, st.catalog.materials, st.cableLength);
    var warn = kitWarningHTML(m, set);

    // R2-02：已选报价客户必须在详情页可见，否则"复制整包带客户信息"无从感知
    var selCust = global.PFCustomers.getSelected();
    var custPill = selCust
      ? '<span class="badge-cust" role="status" aria-label="报价客户 ' + U.esc(selCust.name) + '">' +
        ICONS.users + '报价客户: ' + U.esc(selCust.name) + '</span>'
      : '';

    var specs = specRows(m);

    var cableBtns = set.lengths.map(function (l) {
      return '<button class="chip' + (l === set.length ? ' on' : '') + '" data-cable="' + l + '">' + l + '</button>';
    }).join('');

    var favBtn = '<button class="icon-btn" data-fav-detail="' + U.esc(m.material_no) + '"' +
      ' aria-pressed="' + (fav ? 'true' : 'false') + '"' +
      ' aria-label="' + (fav ? '取消收藏' : '收藏该型号') + '">' +
      (fav ? ICONS.starOn : ICONS.star) + '</button>';

    // 需求1：首屏速览 —— 机型料号 + 配套线材料号。线材行随「线长」chip 联动。
    var glanceRows =
      glanceRow(m.is_accessory === 1 ? '配件料号' : '机型料号', m.material_no) +
      set.required.map(function (it) {
        if ((it.role === '网线' || it.role === '数据线') && it.material) {
          return glanceRow(it.role + '（' + set.length + '）', it.material.material_no);
        }
        return '';
      }).join('');

    var selectMode = st.detailMode === 'select';

    var kitSection = UI.section('选型套包 · 线长 ' + U.esc(set.length),
      '<div class="chips-pad"><div class="chips">' + cableBtns + '</div></div>' +
      set.required.map(kitItemRow).join('') +
      '<div class="kit-actions">' +
        '<button class="btn primary" data-copy-set="' + U.esc(m.material_no) + '">' +
        ICONS.copy + '复制整包清单</button>' +
      '</div>');

    var optionalHTML = set.optional.length
      ? UI.section('可选配件 · ' + set.optional.length,
          set.optional.map(function (it) {
            return UI.kv(U.esc(it.role),
              '<div>' + U.esc(U.displayCode(it.material)) + '</div>' +
              '<div class="mono-sub">' + U.esc(it.material.material_no) + '</div>',
              { trailing: UI.partCopyBtn(it.material.material_no, it.role + '料号') });
          }).join(''))
      : '';

    // 详细规格参数在查料号动线下折叠收起并下移到页尾，首屏让位给关键料号
    var specsFold = '<details class="section specs-fold">' +
        '<summary class="sec-head">规格参数' + FOLD_ARROW + '</summary>' +
        '<div class="specs-body">' + specs + '</div>' +
      '</details>';

    return (asSheet
      ? '<div class="detail-bar">' +
        '<button class="icon-btn back" data-close="1" aria-label="关闭详情">' + ICONS.back + '</button>' +
        '<div class="t">型号详情</div>' +
        favBtn + '</div>'
      : '') +
      '<div class="pane pane-fill">' +
      '<div class="detail-body">' +
        '<div class="detail-hero vf">' +
          '<i class="hero-scan" aria-hidden="true"></i>' +
          '<div class="hero-top">' +
            ' <div class="fill-col">' +
              '<div class="hero-code">' + U.esc(U.displayCode(m)) + '</div>' +
              '<div class="hero-name">' + U.esc(m.material_name || m.description || '') + '</div>' +
            '</div>' +
            (asSheet ? '' : favBtn) +
          '</div>' +
          '<div class="badge-row">' +
            '<span class="badge ' + U.statusClass(m.status) + '">' + U.esc(m.status || '未知') + '</span>' +
            (m.product_series ? '<span class="spec">' + U.esc(global.PFSearch.seriesKey(m.product_series)) + '</span>' : '') +
            (m.version ? '<span class="spec">' + U.esc(m.version) + '</span>' : '') +
            custPill +
          '</div>' +
          (selectMode ? '' : '<div class="kit-glance">' + glanceRows + '</div>') +
          '<div class="copy-row">' +
            '<button class="btn primary" data-copy-no="' + U.esc(m.material_no) + '">' +
              ICONS.copy + '复制料号</button>' +
            '<button class="btn" data-copy-all="' + U.esc(m.material_no) + '">复制全部规格</button>' +
          '</div>' +
        '</div>' +
        (selectMode
          // 选型动线：规格参数优先展开，料号速览其次，再进套包清单
          ? UI.section('规格参数', specs) +
            '<div class="kit-glance standalone">' + glanceRows + '</div>' +
            warn + kitSection + optionalHTML + alternatesHTML(set)
          // 查料号动线：速览在首屏 hero，规格参数折叠下移页尾
          : warn + kitSection + optionalHTML + alternatesHTML(set) + specsFold) +
      '</div></div>';
  }

  global.PFViewDetail = {
    html: html,
    specText: specText,
    SPEC_LABELS: SPEC_LABELS,
    SPEC_ORDER: SPEC_ORDER,
  };
})(window);
