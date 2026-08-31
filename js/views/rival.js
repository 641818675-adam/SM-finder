/* ============================================================
   竞品页 —— 四个平行视图：对标 / 品牌 / 话术 / 行业
   + 增强检索（品牌/型号/别名/缩写/错拼）+ 品牌钻取（品牌→机型→返回）

   数据来自 data/competitor.json（V3.1 交叉查证融合版）。该资源缺失不阻断
   启动，列表入口自带"未导入"空态。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var UI = global.PFUI;
  var ICONS = global.PFIcons;

  var LEVEL_LABEL = { precise: '精准对标', peer: '同梯队', reference: '参考' };
  var LEVEL_SYM = { precise: '◆', peer: '▲', reference: '○' };

  function state() { return global.PFStore.state; }

  /* ---------------- 归一化与品牌别名索引 ---------------- */

  /** 归一化：去分隔符/空白、统一大写、统一易混字符，供模糊命中。 */
  function norm(s) {
    return (s || '').toUpperCase()
      .replace(/[\s\-_/·．.()（）\[\]【】|｜~～×*]/g, '')
      .replace(/Ｏ/g, 'O').replace(/０/g, '0');
  }

  var _aliasIndex = null;   // normAlias -> 品牌键（products.competitors 的键）
  function aliasIndex() {
    if (_aliasIndex) return _aliasIndex;
    _aliasIndex = {};
    var rival = state().rival || {};
    var keyByName = {};
    // brands[].name -> 其在 products.competitors 中可能使用的键（海康机器人↔海康威视）
    (rival.products || []).forEach(function (p) {
      Object.keys(p.competitors || {}).forEach(function (k) { keyByName[k] = k; });
    });
    function put(alias, brandKey) {
      var n = norm(alias);
      if (n && !_aliasIndex[n]) _aliasIndex[n] = brandKey;
    }
    (rival.brands || []).forEach(function (b) {
      var key = keyByName[b.name] || (b.name === '海康机器人' ? '海康威视' : b.name);
      [b.name, b.en].concat(b.aliases || [], b.abbr || [], b.misspell || []).forEach(function (a) {
        put(a, key);
      });
      // 画像名与产品键互为别名
      put(b.name, key);
    });
    Object.keys(keyByName).forEach(function (k) { put(k, k); });
    return _aliasIndex;
  }

  /** 查询词命中的品牌键集合（别名/缩写/错拼/英文名任一命中）。 */
  function brandHits(qn) {
    var idx = aliasIndex(), set = {};
    if (!qn || qn.length < 2) return set;
    for (var a in idx) {
      if (a.length < 2) continue;
      if (a === qn || qn.indexOf(a) === 0 || (a.indexOf(qn) === 0) || (a.length >= 4 && qn.indexOf(a) >= 0)) {
        set[idx[a]] = true;
      }
    }
    return set;
  }

  /* ---------------- 反向检索（增强） ---------------- */

  /** 反向检索：由竞品型号/品牌/别名/错拼反查我方对标系列，带分级排序。 */
  function matches(q) {
    var rival = state().rival;
    var qn = norm(q);
    var exact = [];
    var entries = [];
    (rival.products || []).forEach(function (p) {
      var comps = p.competitors || {};
      Object.keys(comps).forEach(function (brand) {
        (comps[brand] || []).forEach(function (c) {
          if (c.model) entries.push({ brand: brand, c: c, p: p });
        });
      });
    });

    // 阶段一：型号级命中
    if (qn) {
      entries.forEach(function (e) {
        var mn = norm(e.c.model);
        var lvl = null, rel = 0;
        if (mn === qn) { lvl = 0; rel = 100; }
        else if (mn.indexOf(qn) === 0) { lvl = 1; rel = 88; }
        else if (mn.indexOf(qn) >= 0) { lvl = 2; rel = 76; }
        if (lvl !== null) exact.push(mk(e, lvl, rel));
      });
      if (exact.length) return finish(exact);
    } else {
      return finish(entries.map(function (e) { return mk(e, 5, 0); }));
    }

    // 阶段二：无型号命中 → 视为品牌/别名/错拼查询，展开品牌全部机型
    var bset = brandHits(qn);
    var out = [];
    entries.forEach(function (e) {
      if (bset[e.brand]) out.push(mk(e, 3, 60));
      else if (norm(e.c.note + ' ' + e.brand + ' ' + e.p.series).indexOf(qn) >= 0) out.push(mk(e, 4, 50));
    });
    return finish(out);
  }

  function mk(e, lvl, rel) {
    return { brand: e.brand, level: e.c.level, model: e.c.model, note: e.c.note, product: e.p, _lvl: lvl, _rel: rel };
  }
  function finish(list) {
    list.sort(function (a, b) { return a._lvl - b._lvl || b._rel - a._rel; });
    return list;
  }

  /** 聚合某品牌下全部机型（跨我方系列去重）。 */
  function modelsOf(brand) {
    var seen = {}, out = [];
    (state().rival.products || []).forEach(function (p) {
      ((p.competitors || {})[brand] || []).forEach(function (c) {
        if (!c.model) return;
        var k = norm(c.model);
        if (seen[k]) { seen[k].series.push(p.series); return; }
        seen[k] = { brand: brand, level: c.level, model: c.model, note: c.note, series: [p.series] };
        out.push(seen[k]);
      });
    });
    return out;
  }

  function brandInfo(name) {
    var list = state().rival.brands || [];
    return list.filter(function (b) { return b.name === name || b.name === '海康机器人' && name === '海康威视'; })[0] ||
           list.filter(function (b) { return name.indexOf(b.name) >= 0 || (b.name === '海康机器人' && name === '海康威视'); })[0] || null;
  }

  function brief(p) {
    var parts = [];
    if (p.pixel) parts.push(String(p.pixel).split('\n')[0]);
    if (p.work_distance) parts.push('工作距离 ' + p.work_distance);
    if (p.price_band) parts.push(p.price_band);
    return parts.join(' · ');
  }

  /* ---------------- 渲染：对标 ---------------- */

  function renderMatch(host, q) {
    var st = state();
    var hits = matches(q);
    if (!hits.length) {
      host.innerHTML = UI.empty('没有匹配的对标',
        '试试竞品型号 / 品牌 / 别名，例如 SR-710、ID813M、DataMan、VHV5、X5Pro', null, 'emptyStar');
      return;
    }
    host.innerHTML = UI.meta(hits.length + ' 条对标', '◆ 精准 · ▲ 同梯队 · ○ 参考') +
      hits.slice(0, st.shown).map(function (h) {
        return '<article class="rival-card">' +
          '<div class="rival-head">' +
            '<button class="rival-brand link" data-open-brand="' + U.esc(h.brand) + '">' + U.esc(h.brand) + '</button>' +
            '<span class="rival-model">' + U.esc(h.model) + '</span>' +
            '<span class="lv ' + U.esc(h.level) + '">' + U.esc(LEVEL_LABEL[h.level] || h.level) + '</span>' +
          '</div>' +
          '<div class="rival-meta">' +
            U.esc(h.product.series) + '<span class="arrow">→</span>' + U.esc(brief(h.product)) +
          '</div>' +
          (h.note ? '<div class="rival-note">' + U.esc(h.note) + '</div>' : '') +
          '</article>';
      }).join('') + UI.moreBtn(hits.length > st.shown);
  }

  /* ---------------- 渲染：品牌（列表→品牌页→机型） ---------------- */

  function renderBrand(host, q) {
    if (q) return renderBrandList(host, q);
    var st = state();
    if (st.rivalModel) return renderRivalModel(host, st.rivalModel);
    if (st.rivalBrand) return renderBrandDetail(host, st.rivalBrand);
    return renderBrandList(host, q);
  }

  function renderBrandList(host, q) {
    var qn = norm(q);
    var list = (state().rival.brands || []).filter(function (b) {
      if (!qn) return true;
      var hay = norm([b.name, b.en].concat(b.aliases || [], b.abbr || [], b.misspell || []).join(' '));
      return hay.indexOf(qn) >= 0 || norm(JSON.stringify(b)).indexOf(qn) >= 0;
    });
    if (!list.length) {
      host.innerHTML = UI.empty('没有匹配的品牌', '换个品牌名 / 别名 / 缩写试试，例如 基恩士、Keyence、海康', null, 'rival');
      return;
    }
    host.innerHTML = UI.meta(list.length + ' 个品牌', '点品牌进入全部机型') +
      list.map(function (b) {
        var key = (b.name === '海康机器人' ? '海康威视' : b.name);
        var n = modelsOf(key).length;
        return '<article class="rival-card" data-open-brand="' + U.esc(key) + '" role="button" tabindex="0">' +
          '<div class="rival-head">' +
            '<span class="rival-model rival-name">' + U.esc(b.name) + '</span>' +
            '<span class="rival-brand">' + U.esc(b.en || '') + '</span>' +
            '<span class="lv peer">' + n + ' 机型</span>' +
            '<button class="icon-btn" data-copy-brand="' + U.esc(b.name) + '" aria-label="复制画像">' + ICONS.copy + '</button>' +
          '</div>' +
          '<div class="profile-grid">' + UI.profileGrid([
            ['市场定位', b.market_position], ['可打击点', b.beatable_area],
          ]) + '</div></article>';
      }).join('');
  }

  function renderBrandDetail(host, brand) {
    var b = brandInfo(brand);
    var models = modelsOf(brand);
    var head = '<div class="rival-crumb">' +
      '<button class="crumb" data-rival-back="list">' + ICONS.back + ' 全部品牌</button>' +
      '<span class="crumb-cur">' + U.esc(brand) + '</span></div>';
    var profile = b ? '<div class="profile-grid">' + UI.profileGrid([
      ['市场定位', b.market_position], ['价格区间', b.price_range],
      ['算法优势', b.algorithm_advantage], ['主要弱点', b.weakness],
      ['最佳场景', b.best_scenario], ['可打击点', b.beatable_area],
      ['销售模式', b.sales_model], ['应对策略', b.tactic],
    ]) + '</div>' : '';
    var body = models.map(function (m) {
      return '<article class="rival-card" data-open-rmodel="' + U.esc(brand + '||' + m.model) + '" role="button" tabindex="0">' +
        '<div class="rival-head">' +
          '<span class="rival-model">' + U.esc(m.model) + '</span>' +
          '<span class="lv ' + U.esc(m.level) + '">' + U.esc(LEVEL_SYM[m.level] || '') + ' ' + U.esc(LEVEL_LABEL[m.level] || m.level) + '</span>' +
        '</div>' +
        '<div class="rival-meta">对标我方：' + U.esc(m.series.join(' / ')) + '</div>' +
        (m.note ? '<div class="rival-note">' + U.esc(m.note) + '</div>' : '') +
        '</article>';
    }).join('');
    host.innerHTML = head + UI.meta(brand + ' · ' + models.length + ' 个机型', '点机型查看对标详情') + profile + body;
  }

  function renderRivalModel(host, token) {
    var parts = token.split('||');
    var brand = parts[0], model = parts[1];
    var hits = (state().rival.products || []).filter(function (p) {
      return ((p.competitors || {})[brand] || []).some(function (c) { return c.model === model; });
    });
    var head = '<div class="rival-crumb">' +
      '<button class="crumb" data-rival-back="brand">' + ICONS.back + ' ' + U.esc(brand) + '</button>' +
      '<span class="crumb-cur">' + U.esc(model) + '</span></div>';
    if (!hits.length) {
      host.innerHTML = head + UI.empty('未找到该机型', '返回品牌页查看其它机型', null, 'rival');
      return;
    }
    var b = brandInfo(brand);
    var cards = hits.map(function (p) {
      var c = ((p.competitors || {})[brand] || []).filter(function (x) { return x.model === model; })[0] || {};
      return '<article class="rival-card">' +
        '<div class="rival-head">' +
          '<span class="lv ' + U.esc(c.level) + '">' + U.esc(LEVEL_SYM[c.level] || '') + ' ' + U.esc(LEVEL_LABEL[c.level] || c.level) + '</span>' +
          '<span class="rival-model">' + U.esc(p.series) + '</span>' +
        '</div>' +
        '<div class="rival-meta">' + U.esc(brief(p)) + '</div>' +
        (c.note ? '<div class="rival-note">' + U.esc(c.note) + '</div>' : '') +
        (p.core_advantage ? '<div class="rival-note">我方优势：' + U.esc(p.core_advantage) + '</div>' : '') +
        '</article>';
    }).join('');
    host.innerHTML = head +
      UI.meta(brand + ' · ' + model, '该竞品型号对我方系列的对标关系') +
      (b ? '<div class="rival-note">品牌策略：' + U.esc(b.tactic || '') + '</div>' : '') + cards;
  }

  /* ---------------- 渲染：话术 / 行业（保持原逻辑） ---------------- */

  function renderObjection(host, q) {
    var list = (state().rival.sales && state().rival.sales.objections) || [];
    var hits = list.map(function (o, i) { return { o: o, i: i }; }).filter(function (x) {
      return !q || JSON.stringify(x.o).toUpperCase().indexOf(q) >= 0;
    });
    if (!hits.length) {
      host.innerHTML = UI.empty('没有匹配的话术', '换个关键词，例如价格、售后、交期', null, 'rival');
      return;
    }
    host.innerHTML = UI.meta(hits.length + ' 条应对', '点右上角复制话术') +
      hits.map(function (x) {
        var o = x.o;
        return '<article class="rival-card">' +
          '<div class="card-head">' +
            '<div class="card-title">客户：' + U.esc(o.objection) + '</div>' +
            '<button class="icon-btn" data-copy-script="' + x.i + '" aria-label="复制话术">' + ICONS.copy + '</button>' +
          '</div>' +
          (o.strategy ? '<div class="rival-meta mt-2">策略：' + U.esc(o.strategy) + '</div>' : '') +
          (o.script ? '<div class="quote"><div class="quote-label">参考话术</div>' + U.esc(o.script) + '</div>' : '') +
          (o.support ? '<div class="rival-note">支撑材料：' + U.esc(o.support) + '</div>' : '') +
          '</article>';
      }).join('');
  }

  function renderIndustry(host, q) {
    var list = (state().rival.industries || []).filter(function (n) {
      return !q || JSON.stringify(n).toUpperCase().indexOf(q) >= 0;
    });
    if (!list.length) {
      host.innerHTML = UI.empty('没有匹配的行业', '试试锂电、3C、物流、汽车零部件', null, 'rival');
      return;
    }
    host.innerHTML = UI.meta(list.length + ' 个行业') +
      list.map(function (n) {
        return '<article class="rival-card">' +
          '<div class="rival-head"><span class="rival-model rival-name">' + U.esc(n.name) + '</span></div>' +
          '<div class="profile-grid">' + UI.profileGrid([
            ['关键需求', n.key_needs], ['我方产品', n.smartmore_product],
            ['主要竞品', n.core_competitor], ['赢单论点', n.winning_argument],
            ['攻坚难度', n.difficulty],
          ]) + '</div></article>';
      }).join('');
  }

  function render(host) {
    if (!state().rival) {
      host.innerHTML = '<div class="empty"><div class="big">' + ICONS.rival + '</div>' +
        '<div class="msg">竞品数据尚未导入</div>' +
        '<div class="hint">在桌面版执行 scripts/export_mobile.py 生成 competitor.json 后重新打包</div></div>';
      return;
    }
    var q = state().query.trim().toUpperCase();
    if (state().rivalTab === 'brand') return renderBrand(host, q);
    if (state().rivalTab === 'objection') return renderObjection(host, q);
    if (state().rivalTab === 'industry') return renderIndustry(host, q);
    return renderMatch(host, q);
  }

  global.PFViewRival = {
    render: render,
    matches: matches,
    modelsOf: modelsOf,
    brief: brief,
    norm: norm,
  };
})(window);
