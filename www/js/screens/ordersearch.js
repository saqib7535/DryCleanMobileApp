/* ============================================================
   Order search screen — filter by tracking #, customer, phone,
   category, status, return date.
   ============================================================ */

const OrderSearchScreen = (function () {
  async function render(app) {
    const categories = await CategoryService.list(true);

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="order.searchTitle"></h1>
      </header>
      <div class="page page-pad" style="padding-top:14px">
        <button class="btn btn-accent btn-block" id="btn-scan" style="margin-bottom:14px">${Icons.svg('qr', 16)} <span data-i18n="scan.openCamera"></span></button>
        <div class="card" style="margin-bottom:14px">
          <div class="field"><label data-i18n="order.searchByTracking"></label><input id="f-tracking" /></div>
          <div class="field-row">
            <div class="field"><label data-i18n="order.searchByCustomer"></label><input id="f-customer" /></div>
            <div class="field"><label data-i18n="order.searchByPhone"></label><input id="f-phone" type="tel" /></div>
          </div>
          <div class="field-row">
            <div class="field">
              <label data-i18n="order.filterCategory"></label>
              <select id="f-category">
                <option value="" data-i18n="common.all"></option>
                ${categories.map((c) => `<option value="${c.name}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label data-i18n="order.filterStatus"></label>
              <select id="f-status">
                <option value="" data-i18n="common.all"></option>
                ${OrderService.ALL_STATUSES.map((s) => `<option value="${s}">${I18n.t('status.' + s)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field"><label data-i18n="order.filterReturnDate"></label><input id="f-return-date" type="date" /></div>
          <div class="flex gap-8">
            <button class="btn btn-outline btn-block" id="btn-clear" data-i18n="order.clearFilters"></button>
            <button class="btn btn-primary btn-block" id="btn-search" data-i18n="common.search"></button>
          </div>
        </div>
        <div id="search-results"></div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/dashboard');
    app.querySelector('#btn-search').onclick = runSearch;
    app.querySelector('#btn-scan').onclick = () => {
      Scanner.open(async (text) => {
        const order = await OrderService.getByTrackingNo(text.trim());
        if (order) {
          Router.navigate('/orders/' + order.id);
        } else {
          document.getElementById('f-tracking').value = text.trim();
          Toast.error(I18n.t('scan.notFound'));
        }
      });
    };
    app.querySelector('#btn-clear').onclick = () => {
      ['#f-tracking', '#f-customer', '#f-phone', '#f-category', '#f-status', '#f-return-date'].forEach((sel) => { app.querySelector(sel).value = ''; });
      document.getElementById('search-results').innerHTML = '';
    };
    ['#f-tracking', '#f-customer', '#f-phone', '#f-return-date'].forEach((sel) => {
      app.querySelector(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
    });
  }

  async function runSearch() {
    const filters = {
      trackingNo: document.getElementById('f-tracking').value.trim(),
      customerName: document.getElementById('f-customer').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      category: document.getElementById('f-category').value,
      status: document.getElementById('f-status').value,
      returnDate: document.getElementById('f-return-date').value
    };
    const rows = await OrderService.search(filters);
    const box = document.getElementById('search-results');
    if (!rows.length) {
      box.innerHTML = `<div class="empty-state"><div class="ei">🔍</div><p data-i18n="order.noOrders"></p></div>`;
      I18n.apply(box);
      return;
    }
    box.innerHTML = rows.map(OrdersScreen.rowHtml).join('');
    OrdersScreen.wireRows(box);
  }

  return { render };
})();
