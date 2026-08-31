/* ============================================================
   搜索引擎 —— 移植自桌面版 V9.6 search_engine.py 的多级融合策略

   匹配分级（数字越小越优先）：
     0  料号精确      1  型号精确      2  型号前缀
     3  料号前缀      4  型号中段      5  全文检索
     6  属性维度      7  模糊兜底

   排序：分级 -> 相关性降序 -> 状态优先级 -> 非配件优先 -> 料号
   在桌面版基础上新增：空格分词降级重试，适配手机一次性输入多个关键词。
   ============================================================ */

(function (global) {
  'use strict';

  var STATUS_PRIORITY = { '可售': 0, '准备下架': 1, '待上市': 2, '退市': 3 };

  // 工业术语同义词：命中任一变体即视为相关
  var SYNONYMS = {
    '红': ['红灯', '红光'], '白': ['白灯', '白光'], '蓝': ['蓝灯', '蓝光'], '绿': ['绿灯', '绿光'],
    '无偏振': ['非偏振', '无偏'], '半偏振': ['半偏'], '全偏振': ['偏振'],
    '手动': ['手动调焦', '手动对焦'], '机械': ['机械调焦', '机械对焦'], '液态': ['液态调焦', '液态对焦'],
    '传感器': ['sensor', '感应器'], '读码器': ['reader', '扫码器', '扫描器'],
    '线材': ['cable', '线缆', '数据线', '连接线'],
    '标准': ['standard'], '中性': ['neutral'],
    '12V': ['12伏', '12v'], '24V': ['24伏', '24v'], '5V': ['5伏', '5v'],
  };

  // 参与全文检索的字段及其权重
  var TEXT_FIELDS = [
    ['material_name', 10], ['product_series', 8], ['description', 6],
    ['remark', 4], ['description_tokens', 4], ['applicable_models', 3],
  ];

  // 参与属性维度匹配的字段
  var ATTR_FIELDS = [
    'light_source', 'polarization', 'pixel', 'resolution', 'focus_method',
    'focal_length', 'algorithm', 'version',
  ];

  var NLP_PATTERNS = {
    voltage: /(\d+)\s*[Vv伏]/g,
    color: /[红蓝白绿黑黄紫橙青粉]/g,
    size: /(\d+(?:\.\d+)?)\s*[米mM厘cC][米mM]?/g,
    interface: /\b(USB|M12|M8|RJ45|HDMI|VGA|DP|Type-C|TYPE-C|RS232|RS485|I\/O|IO)\b/gi,
  };

  function upper(s) { return (s || '').toUpperCase(); }
  function has(s, q) { return (s || '').indexOf(q) >= 0; }

  /** 把所有可搜索字段预拼成小写串，避免每次查询重复转换。 */
  function index(materials) {
    for (var i = 0; i < materials.length; i++) {
      var m = materials[i];
      m._no = upper(m.material_no);
      m._code = upper(m.material_code);
      var text = '';
      for (var f = 0; f < TEXT_FIELDS.length; f++) {
        text += (m[TEXT_FIELDS[f][0]] || '') + ' ';
      }
      m._text = upper(text);
      var attr = '';
      for (var a = 0; a < ATTR_FIELDS.length; a++) {
        attr += (m[ATTR_FIELDS[a]] || '') + ' ';
      }
      m._attr = upper(attr);
    }
    return materials;
  }

  function expand(q) {
    var out = [q];
    for (var key in SYNONYMS) {
      if (q === key || has(q, key)) {
        var list = SYNONYMS[key];
        for (var i = 0; i < list.length; i++) out.push(list[i]);
      }
    }
    return out;
  }

  function prefixScore(q, code) {
    var ratio = q.length / Math.max(code.length, 1);
    return Math.min(96, Math.round(70 + ratio * 26));
  }

  /** 对单个物料就单个查询词评分；不匹配返回 null。 */
  function score(m, q) {
    var no = m._no, code = m._code;
    if (!q) return null;

    if (no === q) return { level: 0, rel: 100 };
    if (code === q) return { level: 1, rel: 98 };

    if (code && code.indexOf(q) === 0) {
      // 极短查询命中配件时降权，避免单个字母淹没整机结果
      if (q.length <= 3 && m.is_accessory) return { level: 5, rel: 45 };
      return { level: 2, rel: prefixScore(q, code) };
    }
    if (no.indexOf(q) === 0) return { level: 3, rel: 80 };

    if (q.length >= 2 && !/^\d+$/.test(q)) {
      if (has(code, '-' + q + '-') || (code.length > q.length && code.lastIndexOf('-' + q) === code.length - q.length - 1)) {
        return { level: 4, rel: m.is_accessory ? 82 : 85 };
      }
      if (has(code, q)) return { level: 4, rel: 72 };
    }

    if (has(m._text, q)) {
      var pos = m._text.indexOf(q);
      var rel = Math.max(50, 68 - Math.min(18, Math.floor(pos / 8)));
      // 名称/系列命中比长描述命中更相关
      if (has(upper(m.material_name), q)) rel += 6;
      if (has(upper(m.product_series), q)) rel += 4;
      return { level: 5, rel: Math.min(rel, 78) };
    }

    if (has(m._attr, q)) return { level: 6, rel: 60 };

    // 数值语义匹配：库内 pixel 记为 "5"（500 万）、focal_length 记为 "8"（8mm），
    // 直接用 "5MP" / "500万" / "8mm" 这类自然写法检索时在此归一。
    var mp = /^(\d+(?:\.\d+)?)\s*MP$/i.exec(q);
    if (mp && Math.abs(parseFloat(m.pixel) - parseFloat(mp[1])) < 0.001) {
      return { level: 6, rel: 72 };
    }
    var wan = /^(\d+(?:\.\d+)?)\s*万(?:像素)?$/.exec(q);
    if (wan && Math.abs(parseFloat(m.pixel) - parseFloat(wan[1]) / 100) < 0.001) {
      return { level: 6, rel: 72 };
    }
    var mm = /^(\d+(?:\.\d+)?)\s*MM$/i.exec(q);
    if (mm && Math.abs(parseFloat(m.focal_length) - parseFloat(mm[1])) < 0.001) {
      return { level: 6, rel: 70 };
    }

    return null;
  }

  /** 模糊兜底：去分隔符后包含，或字符子序列匹配。 */
  function fuzzy(m, q) {
    var compact = q.replace(/[\s\-_/]/g, '');
    if (compact.length < 3) return null;
    var no = m._no.replace(/[\s\-_/]/g, '');
    var code = m._code.replace(/[\s\-_/]/g, '');
    if (has(no, compact)) return { level: 7, rel: 55 };
    if (has(code, compact)) return { level: 7, rel: 52 };
    var text = m._text.replace(/[\s\-_/]/g, '');
    if (has(text, compact)) return { level: 7, rel: 40 };
    return null;
  }

  function nlpSpecs(query) {
    var m, out = { voltage: [], color: [], size: [], interface: [] };
    for (var k in NLP_PATTERNS) {
      var re = new RegExp(NLP_PATTERNS[k].source, NLP_PATTERNS[k].flags);
      while ((m = re.exec(query)) !== null) {
        out[k].push(m[0]);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    return out;
  }

  function nlpBoost(row, specs) {
    var boost = 0;
    var text = ((row.material_name || '') + ' ' + (row.description || '') + ' ' + (row.material_code || '')).toUpperCase();
    var i, v;
    for (i = 0; i < specs.voltage.length; i++) {
      v = specs.voltage[i].toUpperCase().replace(/伏/, 'V').replace(/\s+/g, '');
      if (has(text, v)) boost += 15;
    }
    for (i = 0; i < specs.color.length; i++) {
      if (has(row.light_source || '', specs.color[i])) boost += 15;
    }
    for (i = 0; i < specs.interface.length; i++) {
      v = upper(specs.interface[i]);
      if (has(text, v)) boost += 12;
    }
    for (i = 0; i < specs.size.length; i++) {
      if (has(text, upper(specs.size[i]))) boost += 10;
    }
    return Math.min(boost, 30);
  }

  function compare(a, b) {
    if (a._level !== b._level) return a._level - b._level;
    if (b._rel !== a._rel) return b._rel - a._rel;
    var pa = STATUS_PRIORITY[a.status] === undefined ? 9 : STATUS_PRIORITY[a.status];
    var pb = STATUS_PRIORITY[b.status] === undefined ? 9 : STATUS_PRIORITY[b.status];
    if (pa !== pb) return pa - pb;
    if (a.is_accessory !== b.is_accessory) return a.is_accessory - b.is_accessory;
    return a.material_no < b.material_no ? -1 : 1;
  }

  /**
   * 执行搜索。
   * @param {Array}  materials 已建立索引的物料数组
   * @param {string} query     用户输入
   * @param {Object} filters   {category, series, status, includeAccessory}
   * @param {number} limit     最大返回条数
   */
  function search(materials, query, filters, limit) {
    filters = filters || {};
    limit = limit || 60;
    query = (query || '').trim();
    var filtered = applyFilters(materials, filters);

    if (!query) {
      return filtered.slice().sort(compare).slice(0, limit);
    }

    var qUpper = upper(query);
    var variants = expand(query).map(upper);
    var specs = nlpSpecs(query);
    var hasSpec = specs.voltage.length + specs.color.length + specs.size.length + specs.interface.length > 0;

    var results = [];
    for (var i = 0; i < filtered.length; i++) {
      var m = filtered[i];
      var best = null;
      for (var v = 0; v < variants.length; v++) {
        var s = score(m, variants[v]);
        if (s && (!best || s.level < best.level || (s.level === best.level && s.rel > best.rel))) {
          best = s;
        }
      }
      if (!best) continue;
      m._level = best.level;
      m._rel = best.rel;
      if (hasSpec) m._rel += nlpBoost(m, specs);
      results.push(m);
    }

    // 结果过少时启用模糊兜底，避免"什么都搜不到"的死胡同
    if (results.length < 5) {
      var seen = {};
      for (var r = 0; r < results.length; r++) seen[results[r].material_no] = 1;
      for (var j = 0; j < filtered.length; j++) {
        var mj = filtered[j];
        if (seen[mj.material_no]) continue;
        var f = fuzzy(mj, qUpper);
        if (f) {
          mj._level = f.level; mj._rel = f.rel;
          results.push(mj);
          seen[mj.material_no] = 1;
        }
      }
    }

    // 空格分词降级：整串无结果时，各词独立命中再合并
    var words = query.split(/[\s,，、]+/).filter(function (w) { return w.length > 0; });
    if (results.length < 3 && words.length > 1) {
      var extra = {};
      for (var r2 = 0; r2 < results.length; r2++) extra[results[r2].material_no] = 1;
      for (var w = 0; w < words.length; w++) {
        var sub = search(materials, words[w], filters, 40);
        for (var s2 = 0; s2 < sub.length; s2++) {
          var sm = sub[s2];
          if (!extra[sm.material_no]) {
            sm._level = Math.min(8, sm._level + 1);
            results.push(sm);
            extra[sm.material_no] = 1;
          }
        }
      }
    }

    results.sort(compare);
    return results.slice(0, limit);
  }

  function applyFilters(materials, f) {
    if (!f.category && !f.series && !f.status && f.includeAccessory !== false) return materials;
    var out = [];
    for (var i = 0; i < materials.length; i++) {
      var m = materials[i];
      if (f.category && m.product_category !== f.category) continue;
      if (f.series && seriesKey(m.product_series) !== f.series) continue;
      if (f.status && m.status !== f.status) continue;
      if (f.includeAccessory === false && m.is_accessory) continue;
      out.push(m);
    }
    return out;
  }

  /**
   * 系列归一键（对齐桌面版 contract_service._clean_series/_series_key）：
   * 拆换行说明 → 拆全角/半角括号后缀 → 取首个空白分词。
   * 库内存在 'VA200(标准)'（半角括号）、'VN4000CL 彩色相机'（带描述词）、
   * 'WIT40\n\n软件与VN4000一样…'（换行说明）等写法，配线规则查表依赖此归一。
   */
  function seriesKey(raw) {
    if (!raw) return '';
    var head = String(raw).split('\n')[0].split('（')[0].split('(')[0];
    var s = head.trim().toUpperCase();
    return s ? s.split(/\s+/)[0] : '';
  }

  global.PFSearch = { index: index, search: search, seriesKey: seriesKey, STATUS_PRIORITY: STATUS_PRIORITY };
})(window);
