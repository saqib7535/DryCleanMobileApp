/* ============================================================
   App Settings screen — shop profile, logo, currency, language,
   theme, auto-logout, and the reset-to-factory danger zone.
   ============================================================ */

const AppSettingsScreen = (function () {
  let logoDataUrl = null;
  let selectedAccent = 'blue';

  async function render(app) {
    const s = await SettingsService.all();
    logoDataUrl = s.shop_logo || null;

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="more.settings"></h1>
      </header>
      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="settings.shopProfile"></div>
          <div class="center mt-8">
            <div id="logo-preview" class="login-logo" style="cursor:pointer">${logoDataUrl ? `<img src="${logoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />` : Icons.svg('user', 30)}</div>
            <input type="file" accept="image/*" id="in-logo-file" class="hidden" />
            <a class="link" id="btn-pick-logo" data-i18n="settings.logo" style="display:inline-block;margin-top:6px"></a>
          </div>
          <div class="field mt-8"><label data-i18n="settings.shopName"></label><input id="in-shop-name" value="${s.shop_name || ''}" /></div>
          <div class="field"><label data-i18n="settings.shopAddress"></label><textarea id="in-shop-address" rows="2">${s.shop_address || ''}</textarea></div>
          <div class="field-row">
            <div class="field"><label data-i18n="settings.shopPhone"></label><input id="in-shop-phone" value="${s.shop_phone || ''}" /></div>
            <div class="field"><label data-i18n="settings.shopWhatsapp"></label><input id="in-shop-whatsapp" value="${s.shop_whatsapp || ''}" /></div>
          </div>
          <div class="field-row">
            <div class="field"><label data-i18n="settings.currency"></label><input id="in-currency" value="${s.currency_symbol || 'Rs.'}" /></div>
            <div class="field"><label data-i18n="settings.countryCode"></label><input id="in-country-code" value="${s.country_code || '92'}" /></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="settings.preferences"></div>
          <div class="field">
            <label data-i18n="settings.language"></label>
            <select id="in-language">
              ${I18n.availableLanguages().map((l) => `<option value="${l.code}" ${l.code === I18n.getLanguage() ? 'selected' : ''}>${l.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label data-i18n="settings.theme"></label>
            <select id="in-theme">
              <option value="light" ${s.theme === 'light' ? 'selected' : ''} data-i18n="settings.themeLight"></option>
              <option value="dark" ${s.theme === 'dark' ? 'selected' : ''} data-i18n="settings.themeDark"></option>
            </select>
          </div>
          <div class="field">
            <label data-i18n="settings.accentColor"></label>
            <div id="accent-swatches" style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">
              ${Object.keys(ThemeManager.ACCENTS).map((key) => `
                <div class="accent-swatch ${((s.accent_color || 'blue') === key) ? 'active' : ''}" data-accent="${key}"
                     style="width:34px;height:34px;border-radius:50%;background:${ThemeManager.ACCENTS[key].primary};cursor:pointer;border:3px solid ${((s.accent_color || 'blue') === key) ? ThemeManager.ACCENTS[key].dark : 'transparent'};box-shadow:0 0 0 1px var(--color-border)"></div>
              `).join('')}
            </div>
          </div>
          <div class="field">
            <label data-i18n="settings.autoLogout"></label>
            <input type="number" min="0" id="in-auto-logout" value="${s.auto_logout_minutes || '0'}" />
          </div>
        </div>

        <button class="btn btn-primary btn-block" id="btn-save-settings" data-i18n="settings.saveSettings" style="margin-bottom:20px"></button>

        <div class="card" style="border-color:var(--color-danger)">
          <div class="card-title text-danger" data-i18n="settings.dangerZone"></div>
          <div class="flex-between">
            <div>
              <div style="font-weight:700" data-i18n="settings.reset"></div>
              <div class="text-muted" style="font-size:12px" data-i18n="settings.resetDesc"></div>
            </div>
            <button class="btn btn-danger btn-sm" id="btn-reset-app">${Icons.svg('trash', 16)}</button>
          </div>
        </div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/settings');
    app.querySelector('#btn-pick-logo').onclick = () => app.querySelector('#in-logo-file').click();
    app.querySelector('#logo-preview').onclick = () => app.querySelector('#in-logo-file').click();
    app.querySelector('#in-logo-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        logoDataUrl = reader.result;
        app.querySelector('#logo-preview').innerHTML = `<img src="${logoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />`;
      };
      reader.readAsDataURL(file);
    });

    app.querySelector('#btn-save-settings').onclick = save;
    app.querySelector('#btn-reset-app').onclick = resetApp;

    selectedAccent = s.accent_color || 'blue';
    app.querySelectorAll('#accent-swatches [data-accent]').forEach((el) => {
      el.onclick = () => {
        selectedAccent = el.getAttribute('data-accent');
        app.querySelectorAll('#accent-swatches [data-accent]').forEach((sw) => {
          const key = sw.getAttribute('data-accent');
          sw.classList.toggle('active', key === selectedAccent);
          sw.style.borderColor = key === selectedAccent ? ThemeManager.ACCENTS[key].dark : 'transparent';
        });
        ThemeManager.applyAccent(selectedAccent);
      };
    });
  }

  async function save() {
    const language = document.getElementById('in-language').value;
    await SettingsService.setMany({
      shop_name: document.getElementById('in-shop-name').value.trim(),
      shop_address: document.getElementById('in-shop-address').value.trim(),
      shop_phone: document.getElementById('in-shop-phone').value.trim(),
      shop_whatsapp: document.getElementById('in-shop-whatsapp').value.trim(),
      currency_symbol: document.getElementById('in-currency').value.trim() || 'Rs.',
      country_code: document.getElementById('in-country-code').value.trim() || '92',
      theme: document.getElementById('in-theme').value,
      accent_color: selectedAccent,
      auto_logout_minutes: document.getElementById('in-auto-logout').value || '0',
      language
    });
    if (logoDataUrl) await SettingsService.set('shop_logo', logoDataUrl);

    ThemeManager.apply(document.getElementById('in-theme').value);
    ThemeManager.applyAccent(selectedAccent);
    AuthService.setAutoLogoutMinutes(parseInt(document.getElementById('in-auto-logout').value, 10) || 0);
    if (language !== I18n.getLanguage()) await I18n.setLanguage(language);

    Toast.success(I18n.t('common.saved'));
  }

  async function resetApp() {
    const ok1 = await Modal.confirm({ message: I18n.t('settings.resetConfirm1'), danger: true });
    if (!ok1) return;
    const ok2 = await Modal.confirm({ message: I18n.t('settings.resetConfirm2'), danger: true });
    if (!ok2) return;
    await BackupService.resetApplication();
    Toast.success(I18n.t('settings.resetDone'));
    setTimeout(() => location.reload(), 900);
  }

  return { render };
})();
