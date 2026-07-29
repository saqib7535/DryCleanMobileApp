/* ============================================================
   PrintPreview — modal that shows an HTML mirror of the receipt/
   label/report before the user commits to printing, with a
   Thermal 58mm / Thermal 80mm / A4 paper-size toggle. The actual
   file handed to Download/Print/Share is a real jsPDF document
   (fully offline — no server round-trip).

   PrintPreview.open({
     title: 'Receipt',
     filename: 'DC-2026-000001.pdf',
     defaultSize: 'thermal80',        // 'thermal58' | 'thermal80' | 'a4'
     buildDoc: async (paperSize) => jsPDFInstance,
     buildHtml: async (paperSize) => '<div>...</div>'   // on-screen preview
   })
   ============================================================ */

const PrintPreview = (function () {
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
      <div id="pp-viewer-wrap" style="background:var(--color-surface-alt);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:auto;height:52vh;display:flex;align-items:flex-start;justify-content:center;position:relative;padding:14px 10px">
        <div id="pp-spinner" style="display:flex;flex-direction:column;align-items:center;gap:10px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
          <div class="spinner dark"></div>
          <span class="text-muted" style="font-size:12.5px" data-i18n="print.generating"></span>
        </div>
        <div id="pp-html-preview" style="width:100%;display:none"></div>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-outline btn-block" id="pp-download">${Icons.svg('download', 16)} <span data-i18n="print.downloadBtn"></span></button>
        <button class="btn btn-primary btn-block" id="pp-print">${Icons.svg('printer', 16)} <span data-i18n="print.printBtn"></span></button>
      </div>
    `, { center: true });
    I18n.apply(sheet);
    sheet.style.maxWidth = '520px';
    sheet.style.width = '94vw';

    const preview = sheet.querySelector('#pp-html-preview');
    const spinner = sheet.querySelector('#pp-spinner');
    let currentDoc = null;

    async function rebuild(size) {
      activeSize = size;
      spinner.style.display = 'flex';
      preview.style.display = 'none';
      sheet.querySelectorAll('#pp-size-tabs .tab-chip').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-size') === size);
      });
      try {
        // The real PDF (used for Download/Print/Share) and the
        // on-screen preview are generated separately on purpose:
        // Android's system WebView has no built-in PDF renderer at
        // all (unlike desktop Chrome), so loading the PDF blob into
        // an <iframe> — even via a real file:// URL — stays blank.
        // opts.buildHtml renders an HTML mirror of the exact same
        // layout instead, which always works.
        const [doc, html] = await Promise.all([
          opts.buildDoc(size),
          opts.buildHtml ? opts.buildHtml(size) : Promise.resolve(null)
        ]);
        currentDoc = doc;
        if (html != null) {
          preview.innerHTML = html;
        } else {
          // No HTML builder supplied for this document type — fall
          // back to a plain "ready" notice rather than a blank box.
          preview.innerHTML = `<div class="text-muted center" style="padding:24px 10px">${I18n.t('print.readyNoPreview')}</div>`;
        }
      } catch (e) {
        console.error('Print preview generation failed', e);
        Toast.error(I18n.t('common.error'));
      } finally {
        spinner.style.display = 'none';
        preview.style.display = 'block';
      }
    }

    sheet.querySelector('#pp-close').onclick = () => { Modal.close(); };
    sheet.querySelectorAll('#pp-size-tabs .tab-chip').forEach((el) => {
      el.onclick = () => rebuild(el.getAttribute('data-size'));
    });

    sheet.querySelector('#pp-download').onclick = async () => {
      if (!currentDoc) return;
      const filename = opts.filename || 'document.pdf';
      try {
        const result = await NativeSave.shareBlob(currentDoc.output('blob'), filename, {
          title: opts.title || filename,
          dialogTitle: I18n.t('print.saveShareTitle')
        });
        if (result && result.via === 'cancelled') return; // user backed out — not an error
      } catch (e) {
        console.error('Save/share failed', e);
        Toast.error(I18n.t('common.error'));
      }
    };

    sheet.querySelector('#pp-print').onclick = async () => {
      // In a real desktop browser the embedded PDF viewer can be
      // printed directly. On Android's WebView there is no such
      // built-in viewer/print pipeline for embedded PDFs, so we hand
      // the file to the native Share sheet instead — from there the
      // user can pick a connected printer / "Save as PDF" / any PDF
      // viewer app that has its own print button.
      if (NativeSave.isNative()) {
        if (!currentDoc) return;
        const filename = opts.filename || 'document.pdf';
        try {
          const result = await NativeSave.shareBlob(currentDoc.output('blob'), filename, {
            title: opts.title || filename,
            dialogTitle: I18n.t('print.printBtn')
          });
          if (result && result.via === 'cancelled') return; // user backed out — not an error
        } catch (e) {
          console.error('Print hand-off failed', e);
          Toast.error(I18n.t('common.error'));
        }
        return;
      }
      if (!currentDoc) return;
      const blob = currentDoc.output('blob');
      const url = URL.createObjectURL(blob);
      const printFrame = document.createElement('iframe');
      printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      printFrame.src = url;
      document.body.appendChild(printFrame);
      printFrame.onload = () => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (e) {
          window.open(url, '_blank');
        }
        setTimeout(() => { printFrame.remove(); URL.revokeObjectURL(url); }, 60000);
      };
    };

    await rebuild(activeSize);
  }

  return { open };
})();
