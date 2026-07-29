/* ============================================================
   App bootstrap — DB/i18n init, route registration, shell wiring.
   ============================================================ */

(async function () {
  const splash = document.getElementById('boot-splash');

  function renderShell() {
    document.body.insertAdjacentHTML('beforeend', `
      <nav class="bottom-nav hidden" id="bottom-nav">
        <div class="nav-item" data-nav="dashboard">${Icons.svg('home', 21, 'ni')}<span data-i18n="nav.dashboard"></span></div>
        <div class="nav-item" data-nav="orders">${Icons.svg('orders', 21, 'ni')}<span data-i18n="nav.orders"></span></div>
        <div class="nav-item" data-nav="customers">${Icons.svg('customers', 21, 'ni')}<span data-i18n="nav.customers"></span></div>
        <div class="nav-item" data-nav="reports">${Icons.svg('reports', 21, 'ni')}<span data-i18n="nav.reports"></span></div>
        <div class="nav-item" data-nav="settings">${Icons.svg('more', 21, 'ni')}<span data-i18n="nav.settings"></span></div>
      </nav>
      <button class="fab hidden" id="global-fab">${Icons.svg('plus', 26)}</button>
    `);

    document.querySelectorAll('#bottom-nav .nav-item').forEach((el) => {
      el.addEventListener('click', () => Router.navigate('/' + el.getAttribute('data-nav')));
    });

    document.getElementById('global-fab').addEventListener('click', () => {
      Router.navigate('/orders/new');
    });

    I18n.apply(document.getElementById('bottom-nav'));
    I18n.on(() => I18n.apply(document.getElementById('bottom-nav')));
  }

  function registerRoutes() {
    Router.register('/activation', ActivationScreen.render, { auth: false });
    Router.register('/login', LoginScreen.render, { auth: false, guestOnly: true });
    Router.register('/dashboard', DashboardScreen.render, { auth: true, navKey: 'dashboard' });
    Router.register('/orders', OrdersScreen.renderList, { auth: true, navKey: 'orders' });
    Router.register('/orders/new', NewOrderScreen.render, { auth: true, navKey: 'orders' });
    Router.register('/orders/edit/:id', NewOrderScreen.render, { auth: true, navKey: 'orders' });
    Router.register('/orders/search', OrderSearchScreen.render, { auth: true, navKey: 'orders' });
    Router.register('/orders/:id', OrdersScreen.renderDetail, { auth: true, navKey: 'orders' });
    Router.register('/customers', CustomersScreen.render, { auth: true, navKey: 'customers' });
    Router.register('/reports', ReportsScreen.render, { auth: true, navKey: 'reports' });
    Router.register('/settings', MoreScreen.render, { auth: true, navKey: 'settings' });
    Router.register('/categories', CategoriesScreen.render, { auth: true });
    Router.register('/services', ServicesScreen.render, { auth: true });
    Router.register('/expenses', ExpensesScreen.render, { auth: true });
    Router.register('/backup', BackupScreen.render, { auth: true });
    Router.register('/app-settings', AppSettingsScreen.render, { auth: true });
    Router.setNotFound(async (app) => {
      app.innerHTML = '<div class="empty-state"><div class="ei">🔍</div><p data-i18n="common.noResults"></p></div>';
      I18n.apply(app);
    });
  }

  try {
    await I18n.init();
    await DB.init();
    await LicenseService.touch();
    await ThemeManager.initFromSettings();
    const autoLogoutMinutes = await SettingsService.get('auto_logout_minutes', '0');
    AuthService.setAutoLogoutMinutes(parseInt(autoLogoutMinutes, 10));
    AuthService.setAutoLogoutHandler(() => Toast.info('Session expired — please sign in again'));
    BackupService.maybeRunAutoBackup().catch((e) => console.warn('Auto-backup skipped', e));

    renderShell();
    registerRoutes();
    Router.start();

    // Catch expiry while the app is left open on one screen, not just on navigation.
    setInterval(() => {
      if (!LicenseService.isValidCached() && Router.getCurrentPath() !== '/activation') {
        Router.navigate('/activation');
      }
    }, 60000);
  } catch (err) {
    console.error('Bootstrap failed', err);
    document.getElementById('app').innerHTML =
      '<div class="empty-state"><div class="ei">⚠️</div><p>Failed to start app: ' + (err && err.message) + '</p></div>';
  } finally {
    if (splash) splash.remove();
  }
})();
