/* ============================================================
   PrintPreview — modal that renders a jsPDF document in an
   embedded viewer before the user commits to printing, with a
   Thermal 58mm / Thermal 80mm / A4 paper-size toggle. Printing
   hands off to the browser/WebView's own PDF print pipeline
   (fully offline — no server round-trip).

   PrintPreview.open({
     title: 'Receipt',
     filename: 'DC-2026-000001.pdf',
     defaultSize: 'thermal80',        // 'thermal58' | 'thermal80' | 'a4'
     buildDoc: async (paperSize) => jsPDFInstance
   })
   ============================================================ */

const PrintPreview = (function () {
  let currentUrl = null;

  function revokeCurrent() {
    if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null; }
  }

  function sizeLabel(size) {
    return { thermal58: 'print.thermal58', thermal80: 'print.thermal80', a4: 'print.a4' }[size];
  }

  async function open(opts) {
    const sizes = opts.sizes || ['thermal58', 'thermal80', 'a4'];
    let activeSize = opts.defaultSize || sizes[0];

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3>${opts.title || I18n.t('print.title')}</h3>
        <button class="icon-btn" id="pp-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label data-i18n="print.paperSize"></label>
        <div class="tabs" id="pp-size-tabs" style="padding:0">
          ${sizes.map((s) => `<div class="tab-chip ${s === activeSize ? 'active' : ''}" data-size="${s}" data-i18n="${sizeLabel(s)}"></div>`).join('')}
        </div>
      </div>
      <div id="pp-viewer-wrap" style="background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;height:52vh;display:flex;align-items:center;justify-content:center;position:relative">
        <div id="pp-spinner" style="display:flex;flex-direction:column;align-items:center;gap:10px">
          <div class="spinner dark"></div>
          <span class="text-muted" style="font-size:12.5px" data-i18n="print.generating"></span>
        </div>
        <iframe id="pp-iframe" style="width:100%;height:100%;border:none;display:none"></iframe>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-outline btn-block" id="pp-download">${Icons.svg('download', 16)} <span data-i18n="print.downloadBtn"></span></button>
        <button class="btn btn-primary btn-block" id="pp-print">${Icons.svg('printer', 16)} <span data-i18n="print.printBtn"></span></button>
      </div>
    `, { center: true });
    I18n.apply(sheet);
    sheet.style.maxWidth = '520px';
    sheet.style.width = '94vw';

    const iframe = sheet.querySelector('#pp-iframe');
    const spinner = sheet.querySelector('#pp-spinner');
    let currentDoc = null;

    async function rebuild(size) {
      activeSize = size;
      spinner.style.display = 'flex';
      iframe.style.display = 'none';
      sheet.querySelectorAll('#pp-size-tabs .tab-chip').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-size') === size);
      });
      try {
        currentDoc = await opts.buildDoc(size);
        revokeCurrent();
        currentUrl = currentDoc.output('bloburl');
        iframe.src = currentUrl;
      } catch (e) {
        console.error('Print preview generation failed', e);
        Toast.error(I18n.t('common.error'));
      } finally {
        spinner.style.display = 'none';
        iframe.style.display = 'block';
      }
    }

    sheet.querySelector('#pp-close').onclick = () => { revokeCurrent(); Modal.close(); };
    sheet.querySelectorAll('#pp-size-tabs .tab-chip').forEach((el) => {
      el.onclick = () => rebuild(el.getAttribute('data-size'));
    });

    sheet.querySelector('#pp-download').onclick = () => {
      if (!currentDoc) return;
      currentDoc.save(opts.filename || 'document.pdf');
    };

    sheet.querySelector('#pp-print').onclick = () => {
      if (!iframe.contentWindow) return;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        window.open(currentUrl, '_blank');
      }
    };

    await rebuild(activeSize);
  }

  return { open };
})();
