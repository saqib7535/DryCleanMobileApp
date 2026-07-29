/* ============================================================
   BackupService — export/import the whole database file, silent
   daily auto-backup, and reset-to-factory.

   NOTE ON FORMATS: the web (sql.js) adapter exports a real SQLite
   binary; the native (@capacitor-community/sqlite) adapter exports
   a JSON dump instead (that plugin's own backup format). A backup
   taken on one platform can only be restored on that same platform
   — this is called out in Settings/Backup UI copy so it's never a
   silent surprise.
   ============================================================ */

const BackupService = (function () {
  const AUTO_SLOT_KEY = 'dc_auto_backup_blob';
  const AUTO_DATE_KEY = 'dc_last_auto_backup_date';

  function fileExtension() { return DB.isNative ? 'json' : 'sqlite'; }

  function fileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `drycleanpos-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${fileExtension()}`;
  }

  async function logBackup(name, size) {
    await DB.run('INSERT INTO backups (file_name, size) VALUES (?, ?)', [name, size]);
  }

  async function listBackupHistory() {
    return DB.query('SELECT * FROM backups ORDER BY created_at DESC LIMIT 20');
  }

  async function exportAndDownload() {
    const bytes = await DB.exportBytes();
    const name = fileName();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    // NativeSave picks the right mechanism per platform: a normal
    // browser download on desktop, or Android's native Share sheet
    // (Save to Files/Drive, etc.) on a real device — see ui/nativeSave.js
    // for why a plain <a download> click silently does nothing in the
    // Android WebView.
    await NativeSave.shareBlob(blob, name, {
      title: name,
      dialogTitle: I18n.t('backup.saveShareTitle')
    });
    await logBackup(name, bytes.byteLength || bytes.length || 0);
    return { name, size: bytes.byteLength || bytes.length || 0 };
  }

  async function importFromFile(file) {
    const buffer = await file.arrayBuffer();
    await DB.importBytes(new Uint8Array(buffer));
  }

  async function saveSilentAutoBackup() {
    const bytes = await DB.exportBytes();
    try {
      localStorage.setItem(AUTO_SLOT_KEY, btoa(String.fromCharCode(...new Uint8Array(bytes))));
      localStorage.setItem(AUTO_DATE_KEY, Format.todayIso());
    } catch (e) {
      console.warn('Auto-backup slot save skipped (storage limit?)', e);
    }
    await logBackup('auto-backup-' + Format.todayIso() + '.' + fileExtension(), bytes.byteLength || bytes.length || 0);
  }

  function hasAutoBackup() {
    try { return !!localStorage.getItem(AUTO_SLOT_KEY); } catch (e) { return false; }
  }

  function lastAutoBackupDate() {
    try { return localStorage.getItem(AUTO_DATE_KEY); } catch (e) { return null; }
  }

  async function restoreFromAutoBackup() {
    const b64 = localStorage.getItem(AUTO_SLOT_KEY);
    if (!b64) throw new Error('No auto-backup available');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await DB.importBytes(bytes);
  }

  async function maybeRunAutoBackup() {
    const enabled = await SettingsService.get('auto_backup', '1');
    if (enabled !== '1') return;
    const today = Format.todayIso();
    if (lastAutoBackupDate() === today) return;
    await saveSilentAutoBackup();
  }

  async function resetApplication() {
    const tables = ['payments', 'order_items', 'orders', 'customers', 'categories', 'services', 'backups', 'settings', 'users', 'meta'];
    for (const t of tables) await DB.run(`DELETE FROM ${t}`);
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  }

  return {
    fileExtension, exportAndDownload, importFromFile, listBackupHistory,
    saveSilentAutoBackup, hasAutoBackup, lastAutoBackupDate, restoreFromAutoBackup,
    maybeRunAutoBackup, resetApplication
  };
})();
