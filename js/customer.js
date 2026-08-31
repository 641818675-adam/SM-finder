/* ============================================================
   客户管理 —— 自桌面版 V9.7 pages/customer.py + database.py 移植

   数据字段与桌面版 customers 表逐一对齐：
     id INTEGER  /  name TEXT 必填  /  address TEXT 默认空
     created_at TIMESTAMP        /  updated_at TIMESTAMP
   业务逻辑对齐：
     - 新增/编辑校验：名称必填（桌面版 Toast「请输入客户名称」）
     - 允许同名客户（桌面版无 UNIQUE 约束，行为保持一致）
     - 列表按 created_at 倒序（桌面版 ORDER BY created_at DESC）
     - 删除需确认（桌面版 QMessageBox，默认否）
     - 点卡片选中，用于报价；复制按钮输出「客户:/地址:」两行文本

   平台差异（详见 docs/客户管理迁移说明.md）：
     桌面版存 SQLite；移动端 file:// 页面无法使用 SQLite，
     沿用本应用既有三级持久化（原生 SharedPreferences →
     localStorage → 内存），收藏/设置已用同一机制。
     桌面版「选中客户 → 报价单页」在移动端没有报价模块，
     等效替代：选中的客户自动附加到「复制整包清单」文本头部，
     与桌面版报价文本的「客户: xxx」行保持同一格式。
   ============================================================ */

(function (global) {
  'use strict';

  var KEY = 'customers';

  function store() { return global.PFData; }

  function readAll() {
    var raw = store().getPref(KEY);
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(list) {
    store().setPref(KEY, JSON.stringify(list));
  }

  /** 与桌面版 CURRENT_TIMESTAMP 同形：YYYY-MM-DD HH:MM:SS（本地时区）。 */
  function nowStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  var Customer = {
    key: KEY,

    /** 全部客户，created_at 倒序 —— 对齐桌面版 get_all_customers。 */
    all: function () {
      return readAll().sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
    },

    count: function () { return readAll().length; },

    get: function (id) {
      var list = readAll();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    },

    /** 对齐桌面版 add_customer；返回新客户。id 在移动端以时间戳充当。 */
    add: function (name, address) {
      var stamp = nowStamp();
      var c = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: String(name || '').trim(),
        address: String(address || '').trim(),
        created_at: stamp,
        updated_at: stamp,
      };
      var list = readAll();
      list.push(c);
      writeAll(list);
      return c;
    },

    /** 对齐桌面版 update_customer：只更新名称/地址与 updated_at。 */
    update: function (id, name, address) {
      var list = readAll();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          list[i].name = String(name || '').trim();
          list[i].address = String(address || '').trim();
          list[i].updated_at = nowStamp();
          writeAll(list);
          return list[i];
        }
      }
      return null;
    },

    /** 对齐桌面版 delete_customer。 */
    remove: function (id) {
      var list = readAll();
      var next = list.filter(function (c) { return c.id !== id; });
      if (next.length === list.length) return false;
      writeAll(next);
      var sel = Customer.getSelected();
      if (sel && sel.id === id) Customer.setSelected(null);
      return true;
    },

    /** 与桌面版 _copy_customer 同格式的复制文本。 */
    copyText: function (c) {
      return '客户: ' + c.name + '\n地址: ' + (c.address || '未填写');
    },

    /* ---- 选中客户（对齐桌面版 customer_selected / _selected_customer）----
       桌面版选中态仅存于会话内存，重启即清；移动端保持同语义。 */
    _selectedId: null,

    getSelected: function () {
      return this._selectedId === null ? null : this.get(this._selectedId);
    },

    setSelected: function (c) {
      this._selectedId = c ? c.id : null;
    },

    /**
     * 报价等效链路：选中客户时，整包清单文本头部加「客户:/收货地址:」，
     * 与桌面版报价文本的「客户: xxx」行同格式；未选中则原样输出。
     */
    quoteHeader: function () {
      var c = this.getSelected();
      if (!c) return '';
      return '客户: ' + c.name + (c.address ? '\n收货地址: ' + c.address : '');
    },

    /**
     * 跨端数据一致性：桌面版客户数据在桌面机 SQLite 内，移动端无法直接读取。
     * 等效方案 = JSON 导入/导出（桌面版 scripts/export_customers.py 导出 →
     * 任意离线通道传到手机 → 此处导入）。合并时按 name+address 去重。
     */
    exportJSON: function () {
      return JSON.stringify({
        type: 'partfinder-customers',
        exported_at: nowStamp(),
        count: readAll().length,
        customers: readAll(),
      }, null, 2);
    },

    /** 返回 {added, skipped}；跳过与既有客户 name+address 完全相同的记录。
        失败返回 {error:'parse'|'format'}，供 UI 区分报错方向（R2-03）。 */
    importJSON: function (text) {
      var parsed;
      try { parsed = JSON.parse(String(text || '')); } catch (e) { return { error: 'parse' }; }
      var incoming = Array.isArray(parsed) ? parsed :
        (parsed && Array.isArray(parsed.customers) ? parsed.customers : null);
      if (!incoming) return { error: 'format' };

      var list = readAll();
      var seen = {};
      var takenIds = {};
      list.forEach(function (c) {
        seen[c.name + '\u0000' + (c.address || '')] = 1;
        takenIds[c.id] = 1;
      });
      var added = 0, skipped = 0;
      incoming.forEach(function (raw) {
        if (!raw || !String(raw.name || '').trim()) { skipped++; return; }
        var name = String(raw.name).trim();
        var address = String(raw.address || '').trim();
        var k = name + '\u0000' + address;
        if (seen[k]) { skipped++; return; }
        seen[k] = 1;
        // 保留来源库的原始 id（数据一致性）；仅在与本地现有 id 冲突时改派新 id
        var id = typeof raw.id === 'number' && !takenIds[raw.id] ? raw.id
          : Date.now() + Math.floor(Math.random() * 1000) + list.length;
        takenIds[id] = 1;
        list.push({
          id: id,
          name: name,
          address: address,
          created_at: raw.created_at || nowStamp(),
          updated_at: raw.updated_at || raw.created_at || nowStamp(),
        });
        added++;
      });
      if (added) writeAll(list);
      return { added: added, skipped: skipped };
    },
  };

  global.PFCustomers = Customer;
})(window);
