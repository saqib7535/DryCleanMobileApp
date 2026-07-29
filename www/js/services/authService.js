/* ============================================================
   AuthService — login/logout, "remember login" persistence,
   session/auto-logout timer, change password.
   ============================================================ */

const AuthService = (function () {
  const SESSION_KEY = 'dc_session_user';
  const REMEMBER_KEY = 'dc_remember_user';

  let sessionUser = null;
  let autoLogoutTimer = null;
  let onAutoLogout = null;

  function loadSession() {
    if (sessionUser) return sessionUser;
    try {
      const remembered = localStorage.getItem(REMEMBER_KEY);
      if (remembered) { sessionUser = JSON.parse(remembered); return sessionUser; }
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) { sessionUser = JSON.parse(raw); return sessionUser; }
    } catch (e) { /* ignore */ }
    return null;
  }

  function isLoggedIn() { return !!loadSession(); }
  function currentUser() { return loadSession(); }

  async function login(username, password, remember) {
    const rows = await DB.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return { ok: false, error: I18n.t('login.invalidCreds') };
    const user = rows[0];
    const valid = await CryptoUtil.verifyPassword(password, user.password_hash);
    if (!valid) return { ok: false, error: I18n.t('login.invalidCreds') };

    await DB.run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);

    sessionUser = { id: user.id, username: user.username, role: user.role };
    const payload = JSON.stringify(sessionUser);
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, payload);
    } else {
      sessionStorage.setItem(SESSION_KEY, payload);
    }
    resetAutoLogoutTimer();
    return { ok: true, user: sessionUser };
  }

  function logout() {
    sessionUser = null;
    localStorage.removeItem(REMEMBER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    clearTimeout(autoLogoutTimer);
    Router.replace('/login');
  }

  async function changePassword(username, currentPassword, newPassword) {
    const rows = await DB.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return { ok: false, error: I18n.t('login.invalidCreds') };
    const valid = await CryptoUtil.verifyPassword(currentPassword, rows[0].password_hash);
    if (!valid) return { ok: false, error: I18n.t('login.invalidCreds') };
    const hash = await CryptoUtil.hashPassword(newPassword);
    await DB.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].id]);
    // Once the default admin account's password has been changed,
    // stop advertising the admin/admin123 hint on the login screen.
    if (String(username).toLowerCase() === 'admin') {
      await SettingsService.set('default_creds_hidden', '1');
    }
    return { ok: true };
  }

  function setAutoLogoutHandler(fn) { onAutoLogout = fn; }

  function resetAutoLogoutTimer() {
    clearTimeout(autoLogoutTimer);
    const minutes = parseInt((window.__dc_autoLogoutMinutes || 0), 10);
    if (!minutes || !isLoggedIn()) return;
    autoLogoutTimer = setTimeout(() => {
      logout();
      if (onAutoLogout) onAutoLogout();
    }, minutes * 60 * 1000);
  }

  function setAutoLogoutMinutes(minutes) {
    window.__dc_autoLogoutMinutes = minutes;
    resetAutoLogoutTimer();
  }

  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, () => resetAutoLogoutTimer(), { passive: true });
  });

  return {
    isLoggedIn, currentUser, login, logout, changePassword,
    setAutoLogoutHandler, setAutoLogoutMinutes, resetAutoLogoutTimer
  };
})();
