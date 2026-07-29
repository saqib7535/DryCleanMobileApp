/* ============================================================
   ThemeManager — applies the light/dark data-theme attribute
   that theme.css keys off of, plus an optional custom accent
   color the user can pick in App Settings (overrides the default
   --color-primary/-dark/-light CSS variables).
   ============================================================ */

const ThemeManager = (function () {
  // A few curated accents that stay readable in both light & dark mode.
  const ACCENTS = {
    blue: { primary: '#2563eb', dark: '#1d4ed8', light: '#dbeafe' },
    teal: { primary: '#0d9488', dark: '#0f766e', light: '#ccfbf1' },
    purple: { primary: '#7c3aed', dark: '#6d28d9', light: '#ede9fe' },
    rose: { primary: '#e11d48', dark: '#be123c', light: '#ffe4e6' },
    orange: { primary: '#ea580c', dark: '#c2410c', light: '#ffedd5' },
    green: { primary: '#16a34a', dark: '#15803d', light: '#dcfce7' }
  };

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function applyAccent(accentKey) {
    const accent = ACCENTS[accentKey] || ACCENTS.blue;
    const root = document.documentElement.style;
    root.setProperty('--color-primary', accent.primary);
    root.setProperty('--color-primary-dark', accent.dark);
    root.setProperty('--color-primary-light', accent.light);
  }

  async function initFromSettings() {
    const theme = await SettingsService.get('theme', 'light');
    const accent = await SettingsService.get('accent_color', 'blue');
    apply(theme);
    applyAccent(accent);
  }

  return { apply, applyAccent, initFromSettings, ACCENTS };
})();
