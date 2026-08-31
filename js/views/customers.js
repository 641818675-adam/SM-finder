/* ============================================================
   客户管理（桌面版 V9.7 迁移）

   数据字段与桌面版 customers 表逐一对齐，业务规则见 web/js/customer.js 头部注释。
   本文件只负责渲染与表单取值，不含任何存储逻辑。
   ============================================================ */

(function (global) {
  'use strict';

  var U = global.PFUtil;
  var UI = global.PFUI;
  var ICONS = global.PFIcons;

  function state() { return global.PFStore.state; }
  function C() { return global.PFCustomers; }

  function initial(name) {
    return String(name || '?').slice(0, 1).toUpperCase();
  }

  function formHTML(editing) {
    return '<div class="section form-card">' +
        '<div class="sec-head">' + (editing ? '编辑客户' : '新增客户') + '</div>' +
        '<div class="form-body">' +
          '<label class="field">' +
            '<span class="field-label">客户名称<i class="req">*</i></span>' +
            '<input id="cust-name" type="text" enterkeyhint="done" placeholder="输入客户名称（必填）" ' +
              'value="' + U.esc(editing ? editing.name : '') + '" autocomplete="off">' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label">收货地址</span>' +
            '<input id="cust-addr" type="text" enterkeyhint="done" placeholder="输入收货地址（选填）" ' +
              'value="' + U.esc(editing ? editing.address : '') + '" autocomplete="off">' +
          '</label>' +
          '<div class="form-actions">' +
            '<button class="btn primary" data-cust-save="1">' +
              (editing ? '保存修改' : '保存客户') + '</button>' +
            (editing ? '<button class="btn" data-cust-cancel="1">取消</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function selectedHTML(sel) {
    return sel
      ? '<button class="sel-cust" data-cust-clear="1" aria-label="取消选择客户">' +
        '<span class="sel-dot"></span>已选择: ' + U.esc(sel.name) +
        '<span class="sel-x">点击取消</span></button>'
      : '';
  }

  function listHTML(list, sel) {
    if (!list.length) {
      return '<div class="empty compact">' +
        '<div class="big dim">' + ICONS.users + '</div>' +
        '<div class="msg">暂无客户，请在上方添加</div>' +
        '<div class="hint">添加后在型号详情「复制整包清单」时自动带上客户信息</div></div>';
    }
    return '<div class="sec-head flush">已保存客户 · ' + list.length +
      '（点击选择用于报价）</div>' +
      list.map(function (c) {
        var isSel = sel && sel.id === c.id;
        return '<article class="card cust-card' + (isSel ? ' sel' : '') + '" data-cust-select="' + c.id + '"' +
          ' role="button" tabindex="0" aria-label="选择客户 ' + U.esc(c.name) + '">' +
          '<div class="card-head">' +
            '<span class="cust-avatar" aria-hidden="true">' + U.esc(initial(c.name)) + '</span>' +
            '<div class="cust-info">' +
              '<div class="card-title">' + U.esc(c.name) + '</div>' +
              '<div class="cust-addr' + (c.address ? '' : ' none') + '">' + ICONS.box +
                (c.address ? U.esc(c.address) : '未填写地址') + '</div>' +
              '<div class="cust-time">创建: ' + U.esc(String(c.created_at || '').slice(0, 10)) + '</div>' +
            '</div>' +
            '<div class="cust-actions">' +
              '<button class="mini-btn" data-cust-copy="' + c.id + '" aria-label="复制客户信息">' + ICONS.copy + '复制</button>' +
              '<button class="mini-btn" data-cust-edit="' + c.id + '" aria-label="编辑客户">' + ICONS.edit + '编辑</button>' +
              '<button class="mini-btn danger" data-cust-del="' + c.id + '" aria-label="删除客户">' + ICONS.trash + '删除</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join('');
  }

  function render(host) {
    var st = state();
    var Customers = C();
    var list = Customers.all();
    var sel = Customers.getSelected();
    var editing = st.custEditing ? Customers.get(st.custEditing) : null;

    host.innerHTML = formHTML(editing) + selectedHTML(sel) +
      '<div class="io-row">' +
        '<button class="btn" data-cust-export="1">' + ICONS.copy + '导出到剪贴板</button>' +
        '<button class="btn" data-cust-import="1">' + ICONS.swap + '从桌面版导入</button>' +
      '</div>' + listHTML(list, sel);
  }

  /** 从表单取值并落库；名称为空时拦截，文案与桌面版一致。 */
  function saveFromForm() {
    var Customers = C();
    var nameEl = document.getElementById('cust-name');
    var addrEl = document.getElementById('cust-addr');
    var name = String((nameEl && nameEl.value) || '').trim();
    var addr = String((addrEl && addrEl.value) || '').trim();
    if (!name) { U.toast('请输入客户名称'); return false; }
    if (state().custEditing) {
      Customers.update(state().custEditing, name, addr);
      U.toast('已更新客户: ' + name);
    } else {
      Customers.add(name, addr);
      U.toast('已保存客户: ' + name);
    }
    state().custEditing = null;
    return true;
  }

  /** R3-03：客户表单里按输入法「完成/回车」直接提交，不再要求去点保存按钮。 */
  function handleEnter(e) {
    if (!e || !e.target) return false;
    var id = e.target.id;
    if (id !== 'cust-name' && id !== 'cust-addr') return false;
    if (e.preventDefault) e.preventDefault();
    saveFromForm();
    return true;
  }

  global.PFViewCustomers = {
    render: render,
    saveFromForm: saveFromForm,
    handleEnter: handleEnter,
    initial: initial,
  };
})(window);
