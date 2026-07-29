/* ============================================================
   More screen — hub for secondary/admin features reachable from
   the bottom nav's "More" tab (Categories, Services, Backup,
   Settings, Change Password, Logout).
   ============================================================ */

const MoreScreen = (function () {
  function menuItem(icon, titleKey, descKey, id) {
    return `
      <div class="list-row" data-menu="${id}" style="margin:0 16px 10px">
        <div class="avatar">${Icons.svg(icon, 20)}</div>
        <div class="main">
          <div class="title" data-i18n="${titleKey}"></div>
          <div class="subtitle" data-i18n="${descKey}"></div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `;
  }

  async function render(app) {
    const user = AuthService.currentUser();
    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="more.title"></h1>
      </header>
      <div class="page" style="padding-top:12px">
        ${menuItem('orders', 'more.categories', 'more.categoriesDesc', 'categories')}
        ${menuItem('reports', 'more.services', 'more.servicesDesc', 'services')}
        ${menuItem('money', 'more.expenses', 'more.expensesDesc', 'expenses')}
        ${menuItem('backup', 'more.backup', 'more.backupDesc', 'backup')}
        ${menuItem('settings', 'more.settings', 'more.settingsDesc', 'app-settings')}
        ${menuItem('lock', 'more.license', 'more.licenseDesc', 'license')}
        ${menuItem('lock', 'more.changePassword', 'more.changePassword', 'change-password')}
        ${menuItem('logout', 'more.logout', 'more.logout', 'logout')}
        <p class="center text-muted mt-16" style="font-size:12px">${AuthService.currentUser() ? '@' + user.username + ' · ' : ''}<span data-i18n="more.version"></span> 1.0.0</p>
      </div>
    `;
    I18n.apply(app);

    app.querySelectorAll('[data-menu]').forEach((el) => {
      el.onclick = () => handleMenu(el.getAttribute('data-menu'));
    });
  }

  function handleMenu(id) {
    switch (id) {
      case 'categories': Router.navigate('/categories'); break;
      case 'services': Router.navigate('/services'); break;
      case 'expenses': Router.navigate('/expenses'); break;
      case 'backup': Router.navigate('/backup'); break;
      case 'app-settings': Router.navigate('/app-settings'); break;
      case 'license': openLicenseInfo(); break;
      case 'change-password': openChangePassword(); break;
      case 'logout': doLogout(); break;
    }
  }

  function openLicenseInfo() {
    const status = LicenseService.getCachedStatus();
    const durationLabel = status.durationLabelKey ? I18n.t(status.durationLabelKey) : '—';
    const expiryLine = status.expiresAtMs == null
      ? I18n.t('license.expiresNever')
      : I18n.t('license.daysLeft', { days: status.daysLeft });

    const sheet = Modal.open(`
      <div class="modal-header"><h3 data-i18n="more.license"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="flex-between"><span class="text-muted" data-i18n="common.status"></span><b>${durationLabel}</b></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="license.expiresLabel"></span><b>${expiryLine}</b></div>
      </div>
      <div class="field" id="f-key">
        <label data-i18n="activation.placeholder"></label>
        <input id="in-new-key" data-i18n-placeholder="activation.placeholder" style="text-transform:uppercase;letter-spacing:.5px" />
        <div class="error-msg" data-i18n="activation.invalidKey"></div>
      </div>
      <button class="btn btn-primary btn-block" id="btn-reactivate" data-i18n="activation.activate"></button>
    `, { center: true });
    I18n.apply(sheet);
    const input = sheet.querySelector('#in-new-key');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-reactivate').onclick = async () => {
      const raw = input.value.trim();
      const fKey = sheet.querySelector('#f-key');
      if (!raw) { fKey.classList.add('invalid'); return; }
      const result = await LicenseService.activate(raw);
      if (!result.ok) { fKey.classList.add('invalid'); Toast.error(I18n.t('activation.invalidKey')); return; }
      Toast.success(I18n.t('activation.success'));
      Modal.close();
    };
  }

  async function doLogout() {
    const ok = await Modal.confirm({ message: I18n.t('more.logoutConfirm') });
    if (ok) AuthService.logout();
  }

  function openChangePassword() {
    const user = AuthService.currentUser();
    const sheet = Modal.open(`
      <div class="modal-header"><h3 data-i18n="login.changePassword"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field"><label data-i18n="login.currentPassword"></label><input type="password" id="cp-current" /></div>
      <div class="field"><label data-i18n="login.newPassword"></label><input type="password" id="cp-new" /></div>
      <div class="field"><label data-i18n="login.confirmPassword"></label><input type="password" id="cp-confirm" /></div>
      <button class="btn btn-primary btn-block" id="cp-submit" data-i18n="common.confirm"></button>
    `, { center: true });
    I18n.apply(sheet);
    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#cp-submit').onclick = async () => {
      const current = sheet.querySelector('#cp-current').value;
      const next = sheet.querySelector('#cp-new').value;
      const confirmPw = sheet.querySelector('#cp-confirm').value;
      if (!current || !next) { Toast.error(I18n.t('common.requiredField')); return; }
      if (next !== confirmPw) { Toast.error(I18n.t('login.passwordMismatch')); return; }
      const res = await AuthService.changePassword(user.username, current, next);
      if (!res.ok) { Toast.error(res.error); return; }
      Toast.success(I18n.t('login.passwordChanged'));
      Modal.close();
    };
  }

  return { render };
})();
