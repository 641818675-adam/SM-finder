/* ============================================================
   选型套包 —— 移植自桌面版 ContractMaterialSetService

   设计原则（与桌面版一致）：可审计、非模糊。
   必需项只来自"系列强绑定规则"或"适用型号明确声明"，
   不做宽泛关键词匹配，避免推荐出错的线材导致现场返工。
   ============================================================ */

(function (global) {
  'use strict';

  /**
   * 双线缆系列：同长度 网线 1 根 + 数据线 1 根 = 1 套（与 VS1000P 一致）。
   * 依据《配件型号清单-拖链专用线材.xlsx》「配件」页定义，新增：
   *   VN4000 / VN4000CL / VA6500 / VA200 / VA500 / VA502 / WIT40 / WIT50 / WIT60
   * 线缆料号与 VS1000P 共用（挂在 VS1000 系列名下）：
   *   网线   M12-8PIN-{length}   = 97010047(3M) / 97010048(5M) / 97010049(10M)
   *   数据线 M12-12PIN-{length}  = 97010073(3M) / 97010074(5M) / 97010075(10M)
   * xlsx 中的弯头变体（97010059-61 / 97010080-82，备注库存有限）物料编码不同，
   * 不参与精确匹配，默认按标准直头线材出单。
   */
  var PAIR_SERIES = [
    'VS1000', 'VS1000P', 'VS1000PRO', 'VS1000S', 'VS2000', 'VS2000P',
    'VN4000', 'VN4000CL', 'VA6500', 'VA200', 'VA500', 'VA502',
    'WIT40', 'WIT50', 'WIT60',
  ];

  var SINGLE_CABLE_RULES = {
    VS600: { series: 'VS600', template: 'HDB15P-M-ETH-{length}' },
    VS600P: { series: 'VS600', template: 'HDB15P-M-ETH-{length}' },
    VS800: { series: 'VS800', template: 'M12-17PIN-PC-{length}' },
    VS800P: { series: 'VS800', template: 'M12-17PIN-PC-{length}' },
  };

  var LEGACY_SINGLE_DATA_SERIES = ['VE10', 'ST1'];

  var ROLE_ORDER = { 主机: 0, 数据线: 1, 网线: 2, 安装支架: 3, 电源: 4, 可选配件: 9 };
  var VALID_LENGTHS = ['1M', '3M', '5M', '10M', '20M'];

  function normalizeLength(len) {
    var v = (len || '').trim().toUpperCase().replace(/米/g, 'M').replace(/\s+/g, '');
    return VALID_LENGTHS.indexOf(v) >= 0 ? v : '3M';
  }

  function upper(s) { return (s || '').toUpperCase(); }

  function textOf(m) {
    return upper((m.material_code || '') + ' ' + (m.material_name || '') + ' ' + (m.description || ''));
  }

  /** 精确匹配：与桌面版 contract_matches 一致，只认状态为可售的精确绑定。 */
  function contractMatches(materials, opts) {
    var wantedCode = upper((opts.materialCode || '').trim());
    var wantedApplicable = upper(opts.applicableTo || '');
    var out = [];
    for (var i = 0; i < materials.length; i++) {
      var m = materials[i];
      if (m.status !== '可售') continue;
      if (opts.productSeries && m.product_series !== opts.productSeries) continue;
      if (wantedCode && upper(m.material_code.trim()) !== wantedCode) continue;
      if (wantedApplicable && upper(m.applicable_models).indexOf(wantedApplicable) < 0) continue;
      out.push(m);
    }
    return out.sort(function (a, b) { return a.material_no < b.material_no ? -1 : 1; });
  }

  function classify(m) {
    var t = textOf(m);
    if (/支架|安装包|安装/.test(t)) return '安装支架';
    if (/转角镜|放大镜|匀化罩|镜|CRM/.test(t)) return '安装支架';
    if (/8PIN|网线|RJ45/.test(t)) return '网线';
    if (/12PIN|数据线|线缆/.test(t)) return '数据线';
    if (/电源/.test(t)) return '电源';
    return '';
  }

  function missing(role, note) {
    return { role: role, material: null, required: true, source: '缺少规则', note: note };
  }

  function resolve(material, materials, cableLength) {
    var length = normalizeLength(cableLength);
    var series = global.PFSearch.seriesKey(material.product_series);
    var items = [{ role: '主机', material: material, required: true, source: '当前选择', note: '' }];

    function byExactCode(role, s, code) {
      var hits = contractMatches(materials, { productSeries: s, materialCode: code });
      return hits.length
        ? { role: role, material: hits[0], required: true, source: '系列强绑定规则', note: '默认 ' + length }
        : missing(role, '未在产品库找到 ' + code + ' 的强绑定料号');
    }

    var applicableCache = null;
    function applicableItems() {
      if (applicableCache) return applicableCache;
      // 三级回退：exact（料号精确匹配）→ MED 型号提取 → 系列名。
      // MED 机器料号形如 VS-MED200-N，而医疗线材 applicable_models 记
      // "MED200 MED300"，料号整体与系列名都匹配不上，需从料号中提取型号。
      var exact = material.material_code
        ? contractMatches(materials, { applicableTo: material.material_code })
        : [];
      var medMatch = material.material_code
        ? upper(material.material_code).match(/MED\d+[A-Z]*/)
        : null;
      var byModel = medMatch
        ? contractMatches(materials, { applicableTo: medMatch[0] })
        : [];
      var base = exact.length ? exact : byModel;
      applicableCache = base.length || !series
        ? base
        : contractMatches(materials, { applicableTo: series });
      return applicableCache;
    }

    if (PAIR_SERIES.indexOf(series) >= 0) {
      items.push(byExactCode('网线', 'VS1000', 'M12-8PIN-' + length));
      items.push(byExactCode('数据线', 'VS1000', 'M12-12PIN-' + length));
    } else if (SINGLE_CABLE_RULES[series]) {
      var rule = SINGLE_CABLE_RULES[series];
      items.push(byExactCode('数据线', rule.series, rule.template.replace('{length}', length)));
    } else if (LEGACY_SINGLE_DATA_SERIES.indexOf(series) >= 0) {
      var cands = applicableItems().filter(function (m) {
        return classify(m) === '数据线' && textOf(m).indexOf(length) >= 0;
      });
      items.push(
        cands.length
          ? { role: '数据线', material: cands[0], required: true, source: '适用型号明确绑定', note: '默认 ' + length }
          : missing('数据线', '未找到适配 ' + series + ' 的 ' + length + ' 强绑定料号'),
      );
    }

    var selectedNos = {};
    var requiredRoles = {};
    items.forEach(function (it) {
      if (it.material) {
        selectedNos[it.material.material_no] = 1;
        requiredRoles[it.role] = 1;
      }
    });

    // 必需项已覆盖某角色（如 3M 数据线）时，其余同角色物料只是同款的不同长度变体，
    // 长度已由界面 chip 切换。若混入「可选配件」，整包复制到 CRM 会多录十几条
    // 用不上的料号，因此单独归入 alternates，不进复制清单。
    var optional = [];
    var alternates = [];
    applicableItems().forEach(function (cand) {
      if (selectedNos[cand.material_no]) return;
      var role = classify(cand);
      if (!role) return;
      var entry = { role: role, material: cand, required: false, source: '适用型号明确绑定', note: '' };
      if (requiredRoles[role]) alternates.push(entry);
      else optional.push(entry);
    });

    items.sort(function (a, b) {
      return (ROLE_ORDER[a.role] === undefined ? 99 : ROLE_ORDER[a.role]) -
             (ROLE_ORDER[b.role] === undefined ? 99 : ROLE_ORDER[b.role]);
    });

    return {
      primary: material,
      length: length,
      required: items,
      optional: optional,
      alternates: alternates,
      // 本系列是否配置了线缆规则：决定要不要提示"清单可能不完整"
      hasCable: !!(requiredRoles['数据线'] || requiredRoles['网线']),
      lengths: VALID_LENGTHS,
    };
  }

  /** 把套包格式化为可直接粘贴给客户的文本。 */
  function toText(set) {
    var lines = [];
    set.required.forEach(function (it) {
      if (it.material) {
        lines.push(it.role + '\t' + it.material.material_no + '\t' +
                   (it.material.material_code || it.material.material_name));
      } else {
        lines.push(it.role + '\t待确认\t' + it.note);
      }
    });
    if (set.optional.length) {
      lines.push('');
      lines.push('可选配件：');
      set.optional.forEach(function (it) {
        lines.push('  ' + it.role + '\t' + it.material.material_no + '\t' +
                   (it.material.material_code || it.material.material_name));
      });
    }
    return lines.join('\n');
  }

  global.PFContract = { resolve: resolve, toText: toText, normalizeLength: normalizeLength };
})(window);
