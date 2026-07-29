/* ============================================================
   NativeSave — the one place in the app that knows how to get a
   generated file (PDF receipt, backup file, ...) out of the WebView
   and onto the device.

   WHY THIS EXISTS
   ----------------
   Two things that work fine in a desktop browser silently fail
   inside an Android WebView (Capacitor/Cordova):

   1. `<a download href="blob:...">.click()` — desktop browsers save
      this straight to Downloads. Android's WebView has no download
      manager wired up for it by default, so the click does nothing
      and it *looks* like "download button is broken".

   2. `<iframe src="blob:...">` for previewing a PDF — desktop Chrome
      has a built-in PDF viewer that renders blob: PDFs inline.
      Android's system WebView does NOT expose that viewer to embedded
      content, so the iframe just stays blank — "print preview shows
      no data".

   THE FIX
   -------
   On a native Android build we never rely on blob: URLs at all.
   Instead we write the file to the app's cache folder via the
   @capacitor/filesystem plugin, and:
     - for PREVIEW: turn the saved file into a normal https URL via
       Capacitor.convertFileSrc() — the WebView can load/render a real
       URL far more reliably than a blob: one.
     - for DOWNLOAD / PRINT: hand that file to Android's native Share
       sheet via @capacitor/share, so the user can save it to
       Downloads/Drive, send it over WhatsApp, or open it in any PDF
       viewer that has its own Print button.

   On a plain desktop browser (npm run dev) none of this is needed,
   so we keep the original blob:/`<a download>` behaviour there.
   ============================================================ */

const NativeSave = (function () {
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function plugins() {
    return (window.Capacitor && window.Capacitor.Plugins) || {};
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result looks like "data:<mime>;base64,AAAA..."
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  function safeFileName(name) {
    return String(name).replace(/[\\/:*?"<>|]+/g, '_');
  }

  /* Writes a Blob into the app's cache dir and returns both a
     WebView-loadable preview URL and the raw native file URI
     (needed by the Share sheet). Native-only — check isNative() first. */
  async function writeToCache(blob, fileName) {
    const { Filesystem } = plugins();
    if (!Filesystem) throw new Error('Filesystem plugin not available');
    const name = safeFileName(fileName);
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
    const { uri } = await Filesystem.getUri({ path: name, directory: 'CACHE' });
    const previewUrl = window.Capacitor.convertFileSrc(uri);
    return { uri, previewUrl, fileName: name };
  }

  /* Best-effort local file URL to show inside an <iframe>/<embed> for
     "does this look right before I print/send it" purposes.
     - native: real file written to cache, served via convertFileSrc()
     - web: the usual blob: URL (works fine in a real browser) */
  async function previewUrlFor(blob, fileName) {
    if (isNative()) {
      const { previewUrl } = await writeToCache(blob, fileName);
      return { url: previewUrl, revoke: () => {} };
    }
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }

  /* Save-and-share flow used by "Download" / "Print" buttons.
     - native: writes the file, then opens Android's native Share sheet
       (Save to Files/Drive, send via WhatsApp/Email, or open with any
       PDF viewer/print service that registers as a share target).
     - web: normal same-tab download via a temporary <a download>. */
  function isCancelError(err) {
    const msg = String((err && (err.message || err.errorMessage || err.code)) || err || '').toLowerCase();
    return msg.includes('cancel') || msg.includes('abort') || msg.includes('dismiss');
  }

  async function shareBlob(blob, fileName, opts) {
    opts = opts || {};
    if (!isNative()) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = safeFileName(fileName);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { via: 'download' };
    }
    const { Share } = plugins();
    const { uri } = await writeToCache(blob, fileName);
    if (!Share || !Share.share) {
      // Filesystem worked but Share plugin isn't available for some
      // reason — at least the file exists in the app cache.
      throw new Error('Share plugin not available');
    }
    try {
      await Share.share({
        title: opts.title || fileName,
        dialogTitle: opts.dialogTitle || 'Save / Print / Share',
        url: uri
      });
      return { via: 'share', uri };
    } catch (err) {
      // The user simply backing out of the share sheet (tapping
      // outside it, pressing back, hitting Cancel) can surface as a
      // rejected promise on some Android versions/plugin builds —
      // that's not a real failure, so don't bubble it up as one.
      if (isCancelError(err)) return { via: 'cancelled', uri };
      throw err;
    }
  }

  return { isNative, blobToBase64, writeToCache, previewUrlFor, shareBlob };
})();
