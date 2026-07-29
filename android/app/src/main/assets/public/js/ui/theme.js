/* ============================================================
   ThemeManager — applies the light/dark data-theme attribute
   that theme.css keys off of.
   ============================================================ */

const ThemeManager = (function () {
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  async function initFromSettings() {
    const theme = await SettingsService.get('theme', 'light');
    apply(theme);
  }

  return { apply, initFromSettings };
})();
