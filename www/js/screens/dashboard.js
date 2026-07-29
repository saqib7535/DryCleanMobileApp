/* ============================================================
   Dashboard screen — live stats, due alerts, recent orders,
   and quick actions.
   ============================================================ */

const DashboardScreen = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function statCard(cls, icon, labelKey, value) {
    return `
      <div class="stat-card ${cls}">
        <div class="stat-icon">${icon}</div>
        <div>
          <div class="stat-value">${value}</div>
          <div class="stat-label" data-i18n="${labelKey}"></div>
        </div>
      </div>
    `;
  }

  function quickBtn(cls, icon, labelKey, action) {
    return `
      <div class="quick-btn" data-action="${action}">
        <div class="qi" style="background:${cls}">${icon}</div>
        <span class="label" data-i18n="${labelKey}"></span>
      </div>
    `;
  }

  function recentOrderRow(o) {
    return `
      <div class="list-row" data-order="${o.id}" style="margin:0 0 10px">
        <div class="avatar">${Format.initials(o.customer_name)}</div>
        <div class="main">
          <div class="title">${escapeHtml(o.tracking_no)}</div>
          <div class="subtitle">${escapeHtml(o.customer_name)} · ${Format.shortDate(o.order_date)}</div>
        </div>
        <div class="end">
          <div class="amount">${Format.money(o.grand_total)}</div>
          <span class="${Format.statusBadgeClass(o.status)}">${I18n.t('status.' + o.status)}</span>
        </div>
      </div>
    `;
  }

  async function render(app) {
    const shopName = await SettingsService.get('shop_name', 'DryClean POS');
    const currency = await SettingsService.get('currency_symbol', 'Rs.');
    Format.setCurrencySymbol(currency);
    const user = AuthService.currentUser();
    const s = await DashboardService.stats();
    const alerts = await DashboardService.dueAlerts();
    const recent = await DashboardService.recentOrders(5);
    const monthExpense = await ExpenseService.totalForMonth();

    app.innerHTML = `
      <header class="app-header">
        <div>
          <h1>${shopName}</h1>
          <div class="subtitle">${I18n.t('dash.greeting')}, ${user ? user.username : ''}</div>
        </div>
        <button class="icon-btn" id="btn-logout">${Icons.svg('logout', 22)}</button>
      </header>

      <div class="stat-grid">
        ${statCard('stat-c2', '📅', 'dash.todaysOrders', s.todaysOrders)}
        ${statCard('stat-c7', '🚛', 'dash.todaysDeliveries', s.todaysDeliveries)}
        ${statCard('stat-c2', '📦', 'dash.activeOrders', s.activeOrders)}
        ${statCard('stat-c3', '✅', 'dash.readyOrders', s.readyOrders)}
        ${statCard('stat-c8', '⏳', 'dash.pendingOrders', s.pendingOrders)}
        ${statCard('stat-c7', '🚚', 'dash.deliveredOrders', s.deliveredOrders)}
        ${statCard('stat-c1', '👥', 'dash.totalCustomers', s.totalCustomers)}
        ${statCard('stat-c4', '💰', 'dash.advanceReceived', Format.money(s.advanceReceived))}
        ${statCard('stat-c5', '⚠️', 'dash.remainingBalance', Format.money(s.remainingBalance))}
        <div class="stat-card stat-c6" style="grid-column:span 2">
          <div class="stat-icon">📈</div>
          <div><div class="stat-value">${Format.money(s.totalRevenue)}</div><div class="stat-label" data-i18n="dash.totalRevenue"></div></div>
        </div>
        <div class="stat-card stat-c1">
          <div class="stat-icon">🗓️</div>
          <div><div class="stat-value">${Format.money(s.monthRevenue)}</div><div class="stat-label" data-i18n="dash.monthRevenue"></div></div>
        </div>
        <div class="stat-card stat-c5">
          <div class="stat-icon">🧾</div>
          <div><div class="stat-value">${Format.money(monthExpense)}</div><div class="stat-label" data-i18n="dash.monthExpense"></div></div>
        </div>
      </div>

      ${(alerts.overdue > 0 || alerts.unpaidDelivered > 0) ? `
      <div class="page-pad">
        <div class="card" style="border-color:var(--color-danger);margin-bottom:4px">
          <div class="card-title text-danger" data-i18n="dash.alerts"></div>
          ${alerts.overdue > 0 ? `<div class="flex-between mt-8" style="cursor:pointer" id="alert-overdue"><span data-i18n="dash.overdueOrders"></span><span class="badge badge-cancelled">${alerts.overdue}</span></div>` : ''}
          ${alerts.unpaidDelivered > 0 ? `<div class="flex-between mt-8" style="cursor:pointer" id="alert-unpaid"><span data-i18n="dash.unpaidDelivered"></span><span class="badge badge-ironing">${alerts.unpaidDelivered}</span></div>` : ''}
        </div>
      </div>` : ''}

      <div class="section-header"><h2 data-i18n="dash.quickActions"></h2></div>
      <div class="quick-grid">
        ${quickBtn('#2563eb', Icons.svg('customers', 18), 'dash.newCustomer', 'new-customer')}
        ${quickBtn('#d97706', Icons.svg('plus', 18), 'dash.newOrder', 'new-order')}
        ${quickBtn('#0891b2', Icons.svg('search', 18), 'dash.searchOrder', 'search-order')}
        ${quickBtn('#16a34a', Icons.svg('ready', 18), 'dash.readyOrdersBtn', 'ready-orders')}
        ${quickBtn('#7c3aed', Icons.svg('reports', 18), 'dash.reportsBtn', 'reports')}
        ${quickBtn('#0d9488', Icons.svg('backup', 18), 'dash.backupBtn', 'backup')}
        ${quickBtn('#475569', Icons.svg('settings', 18), 'dash.settingsBtn', 'settings')}
      </div>

      <div class="section-header">
        <h2 data-i18n="dash.recentOrders"></h2>
        <a class="link" id="link-view-all" data-i18n="dash.viewAll"></a>
      </div>
      <div class="page-pad" id="recent-orders-list">
        ${recent.length ? recent.map(recentOrderRow).join('') : `<div class="empty-state"><div class="ei">${Icons.svg('orders', 36)}</div><p data-i18n="order.noOrders"></p></div>`}
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-logout').onclick = async () => {
      const ok = await Modal.confirm({ message: I18n.t('more.logoutConfirm') });
      if (ok) AuthService.logout();
    };

    app.querySelectorAll('.quick-btn').forEach((el) => {
      el.onclick = () => handleQuickAction(el.getAttribute('data-action'));
    });

    const overdueEl = app.querySelector('#alert-overdue');
    if (overdueEl) overdueEl.onclick = () => Router.navigate('/orders');
    const unpaidEl = app.querySelector('#alert-unpaid');
    if (unpaidEl) unpaidEl.onclick = () => Router.navigate('/orders?status=Delivered');

    app.querySelector('#link-view-all').onclick = () => Router.navigate('/orders');
    app.querySelectorAll('#recent-orders-list [data-order]').forEach((el) => {
      el.onclick = () => Router.navigate('/orders/' + el.getAttribute('data-order'));
    });
  }

  async function handleQuickAction(action) {
    switch (action) {
      case 'new-customer':
        Router.navigate('/customers');
        setTimeout(() => { if (typeof CustomersScreen !== 'undefined') CustomersScreen.openNew(); }, 120);
        break;
      case 'new-order': Router.navigate('/orders/new'); break;
      case 'search-order': Router.navigate('/orders/search'); break;
      case 'ready-orders': Router.navigate('/orders?status=Ready'); break;
      case 'reports': Router.navigate('/reports'); break;
      case 'backup': Router.navigate('/backup'); break;
      case 'settings': Router.navigate('/app-settings'); break;
    }
  }

  return { render };
})();
