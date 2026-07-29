/* ============================================================
   Expenses screen — track shop overheads (rent, utilities,
   salaries, supplies, etc). Reachable from the More menu.
   ============================================================ */

const ExpensesScreen = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function monthRange() {
    const today = Format.todayIso();
    return { from: today.slice(0, 8) + '01', to: today };
  }

  async function render(app) {
    const range = monthRange();
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="exp.title"></h1>
        <button class="icon-btn" id="btn-add-exp">${Icons.svg('plus', 24)}</button>
      </header>
      <div class="page-pad" style="padding-top:12px">
        <div class="card">
          <div class="field-row" style="margin-bottom:0">
            <div class="field" style="margin-bottom:0"><label data-i18n="report.fromDate"></label><input type="date" id="exp-from" value="${range.from}" /></div>
            <div class="field" style="margin-bottom:0"><label data-i18n="report.toDate"></label><input type="date" id="exp-to" value="${range.to}" /></div>
          </div>
        </div>
        <div class="stat-grid" style="padding:14px 0" id="exp-summary"></div>
        <div id="exp-list"></div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/settings');
    app.querySelector('#btn-add-exp').onclick = () => openForm();
    app.querySelector('#exp-from').addEventListener('change', loadList);
    app.querySelector('#exp-to').addEventListener('change', loadList);

    await loadList();
  }

  async function loadList() {
    const listEl = document.getElementById('exp-list');
    const summaryEl = document.getElementById('exp-summary');
    if (!listEl) return;
    const from = document.getElementById('exp-from').value;
    const to = document.getElementById('exp-to').value;
    const rows = await ExpenseService.list(from, to);
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

    summaryEl.innerHTML = `
      <div class="stat-card stat-c5"><div class="stat-label" data-i18n="exp.total"></div><div class="stat-value">${Format.money(total)}</div></div>
      <div class="stat-card stat-c8"><div class="stat-label" data-i18n="exp.count"></div><div class="stat-value">${rows.length}</div></div>
    `;
    I18n.apply(summaryEl);

    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">🧾</div><p data-i18n="exp.empty"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    listEl.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = async () => {
        const exp = await ExpenseService.getById(parseInt(el.getAttribute('data-edit'), 10));
        openForm(exp);
      };
    });
  }

  function rowHtml(e) {
    return `
      <div class="list-row" data-edit="${e.id}">
        <div class="avatar">🧾</div>
        <div class="main">
          <div class="title">${escapeHtml(e.category)}</div>
          <div class="subtitle">${escapeHtml(e.description || '')} · ${Format.shortDate(e.expense_date)}</div>
        </div>
        <div class="end"><div class="amount">${Format.money(e.amount)}</div></div>
      </div>
    `;
  }

  function categoryOptions(selected) {
    return ExpenseService.CATEGORIES.map((c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'exp.edit' : 'exp.new'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field-row">
        <div class="field">
          <label data-i18n="common.date"></label>
          <input type="date" id="in-date" value="${existing ? existing.expense_date : Format.todayIso()}" />
        </div>
        <div class="field">
          <label data-i18n="exp.category"></label>
          <select id="in-category">${categoryOptions(existing ? existing.category : 'Rent')}</select>
        </div>
      </div>
      <div class="field" id="f-amount">
        <label data-i18n="exp.amount"></label>
        <input type="number" min="0" step="1" id="in-amount" value="${existing ? existing.amount : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="common.notes"></label>
        <textarea id="in-desc" rows="2">${existing ? escapeHtml(existing.description || '') : ''}</textarea>
      </div>
      <div class="field">
        <label data-i18n="order.paymentMethod"></label>
        <select id="in-method">
          <option value="Cash" data-i18n="payment.Cash"></option>
          <option value="JazzCash" data-i18n="payment.JazzCash"></option>
          <option value="EasyPaisa" data-i18n="payment.EasyPaisa"></option>
          <option value="Bank" data-i18n="payment.Bank"></option>
          <option value="Card" data-i18n="payment.Card"></option>
        </select>
      </div>
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del-exp">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-exp" data-i18n="common.save"></button>
      </div>
    `, { center: true });
    I18n.apply(sheet);
    if (existing) sheet.querySelector('#in-method').value = existing.payment_method;

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del-exp').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('exp.deleteConfirm'), danger: true });
        if (!ok) return;
        await ExpenseService.remove(existing.id);
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList();
      };
    }
    sheet.querySelector('#btn-save-exp').onclick = async () => {
      const amount = parseFloat(sheet.querySelector('#in-amount').value);
      const fAmount = sheet.querySelector('#f-amount');
      fAmount.classList.toggle('invalid', !amount || amount <= 0);
      if (!amount || amount <= 0) return;
      const data = {
        expense_date: sheet.querySelector('#in-date').value || Format.todayIso(),
        category: sheet.querySelector('#in-category').value,
        description: sheet.querySelector('#in-desc').value.trim(),
        amount,
        payment_method: sheet.querySelector('#in-method').value
      };
      if (isEdit) await ExpenseService.update(existing.id, data);
      else await ExpenseService.create(data);
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList();
    };
  }

  return { render, openNew: () => openForm() };
})();
