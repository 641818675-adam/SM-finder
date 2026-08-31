/* ============================================================
   数据层：离线数据集加载 + 用户状态持久化

   持久化采用三级降级：
     1. 原生 SharedPreferences（通过 Android 桥接，最可靠）
     2. localStorage（file:// 归属 null origin，可能不可用）
     3. 进程内内存（仅当次会话有效）
   ============================================================ */

(function (global) {
  'use strict';

  var memory = {};
  var lsOk = (function () {
    try {
      localStorage.setItem('__pf', '1');
      localStorage.removeItem('__pf');
      return true;
    } catch (e) {
      return false;
    }
  })();

  function getPref(key) {
    if (global.Android && global.Android.getPref) {
      var v = global.Android.getPref(key);
      if (v !== null && v !== undefined) return v;
    }
    if (lsOk) {
      try { return localStorage.getItem(key); } catch (e) { /* 忽略 */ }
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  function setPref(key, value) {
    if (global.Android && global.Android.setPref) global.Android.setPref(key, value);
    if (lsOk) {
      try { localStorage.setItem(key, value); } catch (e) { /* 忽略 */ }
    }
    memory[key] = value;
  }

  function loadJSON(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 0) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('解析失败: ' + url));
          }
        } else {
          reject(new Error('HTTP ' + xhr.status + ' ' + url));
        }
      };
      xhr.onerror = function () { reject(new Error('网络错误: ' + url)); };
      xhr.send();
    });
  }

  function loadCatalog() {
    return loadJSON('data/products.json').then(function (payload) {
      var materials = global.PFSearch.index(payload.materials || []);
      return {
        version: payload.version || '',
        exportedAt: payload.exported_at || '',
        count: materials.length,
        facets: payload.facets || { categories: {}, series: {}, statuses: {} },
        materials: materials,
      };
    });
  }

  /** 收藏夹：料号集合，按加入顺序倒序。 */
  var Fav = {
    key: 'favorites',
    all: function () {
      var raw = getPref(this.key);
      if (!raw) return [];
      try {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },
    has: function (no) { return this.all().indexOf(no) >= 0; },
    toggle: function (no) {
      var list = this.all();
      var i = list.indexOf(no);
      if (i >= 0) list.splice(i, 1); else list.unshift(no);
      setPref(this.key, JSON.stringify(list));
      return i < 0;
    },
  };

  /** 最近查看：最多 30 条。 */
  var Recent = {
    key: 'recent',
    all: function () {
      var raw = getPref(this.key);
      if (!raw) return [];
      try {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },
    push: function (no) {
      var list = this.all().filter(function (n) { return n !== no; });
      list.unshift(no);
      setPref(this.key, JSON.stringify(list.slice(0, 30)));
    },
  };

  /** 应用设置。 */
  var Settings = {
    key: 'settings',
    defaults: { hideRetired: false, includeAccessory: true, groupBySeries: true },
    get: function (name) {
      var raw = getPref(this.key);
      var obj = this.defaults;
      if (raw) {
        try { obj = Object.assign({}, this.defaults, JSON.parse(raw)); } catch (e) { /* 忽略 */ }
      }
      return obj[name];
    },
    set: function (name, value) {
      var raw = getPref(this.key);
      var obj = this.defaults;
      if (raw) {
        try { obj = Object.assign({}, this.defaults, JSON.parse(raw)); } catch (e) { /* 忽略 */ }
      }
      obj[name] = value;
      setPref(this.key, JSON.stringify(obj));
    },
  };

  /* ----------------------------------------------------------
     整机备份 —— 换机迁移用（含 Android → iPhone 主屏 Web App）。

     只搬用户产生的数据，不含物料库：物料库随版本发布，换机时重新装即可。
     搬的是各键的原始字符串而非解析后的对象——这样即便未来某个键的结构升级，
     备份文件也不会因为中间层的模型变化而失真。
     ---------------------------------------------------------- */
  var BACKUP_TYPE = 'partfinder-backup';
  var BACKUP_KEYS = ['favorites', 'recent', 'settings', 'customers', 'feedback_log'];

  var Backup = {
    keys: BACKUP_KEYS,

    /** 打包为单个 JSON 文本；空键直接跳过，不写 null 进备份。 */
    dump: function () {
      var data = {};
      BACKUP_KEYS.forEach(function (k) {
        var v = getPref(k);
        if (v !== null && v !== undefined && v !== '') data[k] = String(v);
      });
      return JSON.stringify({
        type: BACKUP_TYPE,
        schema: 1,
        app: (global.PFStore && global.PFStore.APP_VERSION) || '',
        exportedAt: new Date().toISOString(),
        data: data,
      }, null, 2);
    },

    /** 统计各键的条目数，用于导出前给用户一个可核对的摘要。 */
    summary: function () {
      return BACKUP_KEYS.map(function (k) {
        var n = 0;
        try {
          var v = JSON.parse(getPref(k) || 'null');
          if (Array.isArray(v)) n = v.length;
          else if (v && typeof v === 'object') n = Object.keys(v).length;
        } catch (e) { /* 忽略坏数据，按 0 计 */ }
        return { key: k, count: n };
      });
    },

    /**
     * 恢复备份。校验全部通过后才落盘——避免半途失败留下新旧混合状态。
     * @returns {{ok: boolean, keys?: string[], msg?: string}}
     */
    restore: function (text) {
      var obj;
      try {
        obj = JSON.parse(String(text || '').trim());
      } catch (e) {
        return { ok: false, msg: '不是合法的 JSON 文本' };
      }
      if (!obj || obj.type !== BACKUP_TYPE) {
        return { ok: false, msg: '这不是 PartFinder 备份数据' };
      }
      if (!obj.data || typeof obj.data !== 'object') {
        return { ok: false, msg: '备份内容为空' };
      }
      var keys = BACKUP_KEYS.filter(function (k) {
        return typeof obj.data[k] === 'string' && obj.data[k];
      });
      if (!keys.length) {
        return { ok: false, msg: '备份里没有可恢复的条目' };
      }
      keys.forEach(function (k) { setPref(k, obj.data[k]); });
      return { ok: true, keys: keys };
    },
  };

  global.PFData = {
    loadCatalog: loadCatalog,
    loadJSON: loadJSON,
    favorites: Fav,
    recent: Recent,
    settings: Settings,
    backup: Backup,
    getPref: getPref,
    setPref: setPref,
  };
})(window);
