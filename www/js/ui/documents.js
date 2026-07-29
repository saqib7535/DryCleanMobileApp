/* ============================================================
   Documents — builds real jsPDF documents for the tracking label
   and the customer receipt/invoice (QR + barcode of the tracking
   number, shop header, items/totals), sized for Thermal 58mm,
   Thermal 80mm, or A4 paper. Used together with PrintPreview so
   the user always sees the page before printing/exporting.
   ============================================================ */

const Documents = (function () {
  const PAGE_MM = { thermal58: [58, null], thermal80: [80, null], a4: [210, 297] };

  function qrDataUrl(text) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createDataURL(6, 4);
    } catch (e) {
      console.error('QR generation failed', e);
      return null;
    }
  }

  function barcodeDataUrl(text) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, text, { format: 'CODE128', width: 2, height: 50, displayValue: false, margin: 4 });
      return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
    } catch (e) {
      console.error('Barcode generation failed', e);
      return null;
    }
  }

  async function shopInfo() {
    return {
      name: await SettingsService.get('shop_name', 'DryClean POS'),
      address: await SettingsService.get('shop_address', ''),
      phone: await SettingsService.get('shop_phone', ''),
      currency: await SettingsService.get('currency_symbol', 'Rs.'),
      logo: await SettingsService.get('shop_logo', null)
    };
  }

  function newDoc(paperSize, estimatedHeightMM) {
    const { jsPDF } = window.jspdf;
    if (paperSize === 'a4') {
      return new jsPDF({ unit: 'mm', format: 'a4' });
    }
    const width = PAGE_MM[paperSize][0];
    const height = Math.max(60, estimatedHeightMM || 150);
    return new jsPDF({ unit: 'mm', format: [width, height] });
  }

  /* ----------------------------------------------------------
     Thermal receipts/labels use a custom-height PDF page (there's
     no "next page" for a receipt printer). jsPDF does NOT clip or
     reflow content that runs past the page height given at
     creation time -- it just draws past the bottom edge, and that
     content is silently lost off-page. A fixed/guessed height was
     the cause of receipts printing "half" cut off for longer
     item lists or long shop names.

     Fix: render the document TWICE. First pass uses a generously
     tall scratch page purely to measure how far the content
     actually goes (drawFn returns the final Y position). Second
     pass creates the real page sized exactly to that content
     height (+ a small margin) and draws for real. This makes the
     page height always match the content, no matter how many
     items/payments/lines are on the receipt.
     ---------------------------------------------------------- */
  function buildMeasuredThermalDoc(paperSize, drawFn) {
    const { jsPDF } = window.jspdf;
    const width = PAGE_MM[paperSize][0];
    const scratch = new jsPDF({ unit: 'mm', format: [width, 1000] });
    const finalY = drawFn(scratch);
    const height = Math.max(40, Math.ceil(finalY) + 6);
    const doc = new jsPDF({ unit: 'mm', format: [width, height] });
    drawFn(doc);
    return doc;
  }

  function addCenteredImage(doc, dataUrl, pageWidth, y, boxSize) {
    const x = (pageWidth - boxSize) / 2;
    doc.addImage(dataUrl, 'PNG', x, y, boxSize, boxSize);
    return y + boxSize;
  }

  function addCenteredBarcode(doc, barcode, pageWidth, y, targetHeight) {
    if (!barcode) return y;
    const w = targetHeight * (barcode.w / barcode.h);
    const boxW = Math.min(w, pageWidth - 8);
    const x = (pageWidth - boxW) / 2;
    doc.addImage(barcode.url, 'PNG', x, y, boxW, targetHeight);
    return y + targetHeight;
  }

  function loadImageMeta(dataUrl) {
    return new Promise((resolve) => {
      if (!dataUrl) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function imageFormatOf(dataUrl) {
    const m = /^data:image\/(\w+);/i.exec(dataUrl || '');
    if (!m) return 'PNG';
    const ext = m[1].toUpperCase();
    return ext === 'JPG' ? 'JPEG' : ext;
  }

  function addCenteredImageFit(doc, dataUrl, meta, pageWidth, y, maxW, maxH) {
    if (!dataUrl || !meta) return y;
    const ratio = meta.w / meta.h;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    const x = (pageWidth - w) / 2;
    doc.addImage(dataUrl, imageFormatOf(dataUrl), x, y, w, h);
    return y + h;
  }

  function addLeftImageFit(doc, dataUrl, meta, x, y, maxW, maxH) {
    if (!dataUrl || !meta) return { w: 0, h: 0 };
    const ratio = meta.w / meta.h;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    doc.addImage(dataUrl, imageFormatOf(dataUrl), x, y, w, h);
    return { w, h };
  }

  // ---------------- Tracking Label ----------------

  async function buildLabelPdf(order, paperSize) {
    const shop = await shopInfo();
    const qrUrl = qrDataUrl(order.tracking_no);
    const barcode = barcodeDataUrl(order.tracking_no);
    const logoMeta = await loadImageMeta(shop.logo);
    const isA4 = paperSize === 'a4';

    function draw(doc) {
      const pageWidth = doc.internal.pageSize.getWidth();
      const cx = pageWidth / 2;
      let y = isA4 ? 20 : 6;

      if (shop.logo && logoMeta) {
        y = addCenteredImageFit(doc, shop.logo, logoMeta, pageWidth, y, isA4 ? 40 : Math.min(28, pageWidth - 16), isA4 ? 22 : 14) + (isA4 ? 6 : 3);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isA4 ? 20 : 11);
      doc.text(shop.name, cx, y, { align: 'center' });
      y += isA4 ? 12 : 6;

      doc.setFontSize(isA4 ? 26 : 14);
      doc.text(order.tracking_no, cx, y, { align: 'center' });
      y += isA4 ? 10 : 5;

      if (qrUrl) {
        const qrSize = isA4 ? 55 : Math.min(32, pageWidth - 16);
        y = addCenteredImage(doc, qrUrl, pageWidth, y, qrSize) + (isA4 ? 6 : 3);
      }
      y = addCenteredBarcode(doc, barcode, pageWidth, y, isA4 ? 16 : 10) + (isA4 ? 8 : 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(isA4 ? 12 : 8.5);
      const rowX1 = isA4 ? cx - 60 : 4;
      const rowX2 = isA4 ? cx + 60 : pageWidth - 4;

      function row(label, value) {
        doc.setFont('helvetica', 'normal');
        doc.text(label, rowX1, y);
        doc.setFont('helvetica', 'bold');
        doc.text(String(value), rowX2, y, { align: 'right' });
        y += isA4 ? 8 : 5;
      }

      row('Customer', order.customer_name);
      row('Return Date', order.return_date ? Format.shortDate(order.return_date) : '-');
      if (order.urgent) row('URGENT', '⚡');

      return y;
    }

    if (isA4) {
      const doc = newDoc('a4');
      draw(doc);
      return doc;
    }
    return buildMeasuredThermalDoc(paperSize, draw);
  }

  // ---------------- Receipt / Invoice ----------------

  async function buildReceiptPdf(order, paperSize) {
    const shop = await shopInfo();
    Format.setCurrencySymbol(shop.currency);
    const qrUrl = qrDataUrl(order.tracking_no);
    const barcode = barcodeDataUrl(order.tracking_no);
    const logoMeta = await loadImageMeta(shop.logo);
    const isA4 = paperSize === 'a4';

    if (isA4) return buildReceiptA4(order, shop, qrUrl, barcode, logoMeta);
    return buildReceiptThermal(order, shop, qrUrl, barcode, paperSize, logoMeta);
  }

  function buildReceiptThermal(order, shop, qrUrl, barcode, paperSize, logoMeta) {
    const lineH = 4.6;

    function draw(doc) {
      const pageWidth = doc.internal.pageSize.getWidth();
      const cx = pageWidth / 2;
      const marginX = 4;
      let y = 6;

      if (shop.logo && logoMeta) {
        y = addCenteredImageFit(doc, shop.logo, logoMeta, pageWidth, y, Math.min(24, pageWidth - 16), 14) + 3;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(shop.name, cx, y, { align: 'center' }); y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      if (shop.address) { doc.text(shop.address, cx, y, { align: 'center' }); y += 4; }
      if (shop.phone) { doc.text(shop.phone, cx, y, { align: 'center' }); y += 4; }
      y += 1;
      dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

      doc.setFontSize(8.5);
      y = kv(doc, marginX, pageWidth - marginX, y, 'Tracking #', order.tracking_no);
      y = kv(doc, marginX, pageWidth - marginX, y, 'Date', Format.shortDate(order.order_date));
      y = kv(doc, marginX, pageWidth - marginX, y, 'Customer', order.customer_name);
      if (order.return_date) y = kv(doc, marginX, pageWidth - marginX, y, 'Return', Format.shortDate(order.return_date));
      y += 1;
      dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

      doc.setFont('helvetica', 'bold');
      doc.text('Item', marginX, y);
      doc.text('Qty', pageWidth - 32, y, { align: 'right' });
      doc.text('Amt', pageWidth - marginX, y, { align: 'right' });
      y += 4;
      doc.setFont('helvetica', 'normal');
      order.items.forEach((it) => {
        const label = `${it.category_name} (${it.service_name})`;
        doc.text(truncate(doc, label, pageWidth - 40), marginX, y);
        doc.text(String(it.quantity), pageWidth - 32, y, { align: 'right' });
        doc.text(Format.money(it.subtotal), pageWidth - marginX, y, { align: 'right' });
        y += lineH;
      });
      y += 1;
      dashedLine(doc, marginX, pageWidth - marginX, y); y += 4;

      y = kv(doc, marginX, pageWidth - marginX, y, 'Subtotal', Format.money(order.subtotal));
      y = kv(doc, marginX, pageWidth - marginX, y, 'Discount', '-' + Format.money(order.discount));
      y = kv(doc, marginX, pageWidth - marginX, y, 'Extra Charges', Format.money(order.extra_charges));
      y = kv(doc, marginX, pageWidth - marginX, y, 'Delivery', Format.money(order.delivery_charges));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      y = kv(doc, marginX, pageWidth - marginX, y, 'Grand Total', Format.money(order.grand_total));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      y = kv(doc, marginX, pageWidth - marginX, y, 'Advance Paid', Format.money(order.advance_paid));
      y = kv(doc, marginX, pageWidth - marginX, y, 'Remaining', Format.money(order.remaining_balance));
      y += 1;
      dashedLine(doc, marginX, pageWidth - marginX, y); y += 5;

      if (qrUrl) y = addCenteredImage(doc, qrUrl, pageWidth, y, 26) + 3;
      y = addCenteredBarcode(doc, barcode, pageWidth, y, 10) + 4;
      doc.setFontSize(8);
      doc.text('Thank you for your business!', cx, y, { align: 'center' });
      y += 4;

      return y;
    }

    return buildMeasuredThermalDoc(paperSize, draw);
  }

  function buildReceiptA4(order, shop, qrUrl, barcode, logoMeta) {
    const doc = newDoc('a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 16;
    let y = 20;
    let textX = marginX;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 4, 'F');

    let logoBottom = 0;
    if (shop.logo && logoMeta) {
      const logoBox = addLeftImageFit(doc, shop.logo, logoMeta, marginX, 10, 24, 20);
      if (logoBox.w) { textX = marginX + logoBox.w + 6; logoBottom = 10 + logoBox.h; }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(shop.name, textX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    if (shop.address) { y += 6; doc.text(shop.address, textX, y); }
    if (shop.phone) { y += 5; doc.text(shop.phone, textX, y); }
    doc.setTextColor(0);
    y = Math.max(y, logoBottom);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text('INVOICE', pageWidth - marginX, 20, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(order.tracking_no, pageWidth - marginX, 27, { align: 'right' });
    doc.text(Format.shortDate(order.order_date), pageWidth - marginX, 33, { align: 'right' });

    y = Math.max(y, 33) + 10;
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, pageWidth - marginX, y);
    doc.setLineWidth(0.2);
    doc.setDrawColor(200);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Bill To', marginX, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    doc.text(order.customer_name, marginX, y);
    if (order.customer_phone) { y += 5; doc.text(order.customer_phone, marginX, y); }
    if (order.return_date) {
      doc.setFont('helvetica', 'bold');
      doc.text('Return Date', pageWidth - marginX - 45, y - (order.customer_phone ? 5 : 0));
      doc.setFont('helvetica', 'normal');
      doc.text(Format.shortDate(order.return_date), pageWidth - marginX, y - (order.customer_phone ? 5 : 0), { align: 'right' });
    }
    y += 10;

    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Item', 'Service', 'Qty', 'Rate', 'Amount']],
      body: order.items.map((it) => [it.category_name, it.service_name, String(it.quantity), Format.money(it.rate), Format.money(it.subtotal)]),
      styles: { fontSize: 9.5 },
      headStyles: { fillColor: [37, 99, 235] }
    });
    y = doc.lastAutoTable.finalY + 10;

    const totalsX1 = pageWidth - marginX - 70;
    const totalsX2 = pageWidth - marginX;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(totalsX1 - 6, y - 6, (totalsX2 - totalsX1) + 12, 6.5 * 5 + 8 + 6, 3, 3, 'F');
    y += 2;

    function totalRow(label, value, bold) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 12 : 10);
      doc.text(label, totalsX1, y);
      doc.text(String(value), totalsX2, y, { align: 'right' });
      y += bold ? 8 : 6.5;
    }
    totalRow('Subtotal', Format.money(order.subtotal));
    totalRow('Discount', '-' + Format.money(order.discount));
    totalRow('Extra Charges', Format.money(order.extra_charges));
    totalRow('Delivery Charges', Format.money(order.delivery_charges));
    doc.setDrawColor(220);
    doc.line(totalsX1, y - 4, totalsX2, y - 4);
    totalRow('Grand Total', Format.money(order.grand_total), true);
    totalRow('Advance Paid', Format.money(order.advance_paid));
    totalRow('Remaining Balance', Format.money(order.remaining_balance));

    y += 10;
    if (qrUrl) doc.addImage(qrUrl, 'PNG', marginX, y, 28, 28);
    if (barcode) {
      const h = 16;
      const w = h * (barcode.w / barcode.h);
      doc.addImage(barcode.url, 'PNG', marginX + 34, y + 6, Math.min(w, 70), h);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Thank you for your business!', pageWidth - marginX, y + 20, { align: 'right' });

    return doc;
  }

  // ---------------- small pdf layout helpers ----------------

  function dashedLine(doc, x1, x2, y) {
    doc.setLineDashPattern([1, 1], 0);
    doc.setDrawColor(150);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  }

  function kv(doc, x1, x2, y, label, value) {
    doc.text(label, x1, y);
    doc.text(String(value), x2, y, { align: 'right' });
    return y + 4.6;
  }

  function truncate(doc, text, maxWidth) {
    let t = String(text);
    while (doc.getTextWidth(t) > maxWidth && t.length > 3) t = t.slice(0, -2) + '…';
    return t;
  }

  // ---------------- HTML mirror preview ----------------
  // Android's system WebView (unlike desktop Chrome) has no built-in
  // PDF viewer at all, so an <iframe src="blob:..."> or even a real
  // file:// URL from convertFileSrc() renders blank inside it. These
  // functions draw an HTML/CSS approximation of the exact same layout
  // so the on-screen "preview" is always reliable; the real PDF
  // (from buildLabelPdf/buildReceiptPdf) is still what actually gets
  // downloaded/printed/shared.
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function previewShellOpen(paperSize) {
    const width = paperSize === 'a4' ? '100%' : (paperSize === 'thermal58' ? '210px' : '280px');
    const pad = paperSize === 'a4' ? '18px 16px' : '10px 6px';
    return `<div style="background:#fff;color:#111;width:${width};max-width:100%;margin:0 auto;padding:${pad};font-family:'Courier New',monospace;font-size:${paperSize === 'a4' ? '12px' : '10.5px'};box-shadow:0 1px 4px rgba(0,0,0,.15)">`;
  }
  const previewShellClose = '</div>';
  const dashed = '<div style="border-top:1px dashed #999;margin:5px 0"></div>';
  function kvRow(label, value, bold) {
    return `<div style="display:flex;justify-content:space-between;gap:6px;${bold ? 'font-weight:700' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  }

  async function buildLabelPreviewHtml(order, paperSize) {
    const shop = await shopInfo();
    const isA4 = paperSize === 'a4';
    const qrUrl = qrDataUrl(order.tracking_no);
    const qrSize = isA4 ? '90px' : '54px';
    let html = previewShellOpen(paperSize);
    if (shop.logo) html += `<div style="text-align:center;margin-bottom:6px"><img src="${shop.logo}" style="max-width:${isA4 ? '110px' : '70px'};max-height:${isA4 ? '70px' : '44px'};object-fit:contain" /></div>`;
    html += `<div style="text-align:center;font-weight:700;font-size:${isA4 ? '18px' : '13px'}">${esc(shop.name)}</div>`;
    html += `<div style="text-align:center;font-weight:700;font-size:${isA4 ? '22px' : '15px'};margin:6px 0">${esc(order.tracking_no)}</div>`;
    html += `<div style="text-align:center;margin:8px 0">${qrUrl ? `<img src="${qrUrl}" style="width:${qrSize};height:${qrSize};image-rendering:pixelated" />` : ''}</div>`;
    html += kvRow('Customer', order.customer_name);
    html += kvRow('Return Date', order.return_date ? Format.shortDate(order.return_date) : '-');
    if (order.urgent) html += kvRow('URGENT', '⚡');
    html += previewShellClose;
    return html;
  }

  async function buildReceiptPreviewHtml(order, paperSize) {
    const shop = await shopInfo();
    Format.setCurrencySymbol(shop.currency);
    const isA4 = paperSize === 'a4';
    const qrUrl = qrDataUrl(order.tracking_no);
    const qrSize = isA4 ? '70px' : '48px';
    let html = previewShellOpen(paperSize);
    if (shop.logo) html += `<div style="text-align:center;margin-bottom:6px"><img src="${shop.logo}" style="max-width:${isA4 ? '100px' : '64px'};max-height:${isA4 ? '60px' : '40px'};object-fit:contain" /></div>`;
    html += `<div style="text-align:center;font-weight:700;font-size:${isA4 ? '16px' : '13px'}">${esc(shop.name)}</div>`;
    if (shop.address) html += `<div style="text-align:center">${esc(shop.address)}</div>`;
    if (shop.phone) html += `<div style="text-align:center">${esc(shop.phone)}</div>`;
    html += dashed;
    html += kvRow('Tracking #', order.tracking_no);
    html += kvRow('Date', Format.shortDate(order.order_date));
    html += kvRow('Customer', order.customer_name);
    if (order.return_date) html += kvRow('Return', Format.shortDate(order.return_date));
    html += dashed;
    html += `<div style="display:flex;justify-content:space-between;font-weight:700"><span>Item</span><span>Qty</span><span>Amt</span></div>`;
    order.items.forEach((it) => {
      html += `<div style="display:flex;justify-content:space-between;gap:4px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.category_name)} (${esc(it.service_name)})</span><span>${esc(it.quantity)}</span><span>${esc(Format.money(it.subtotal))}</span></div>`;
    });
    html += dashed;
    html += kvRow('Subtotal', Format.money(order.subtotal));
    html += kvRow('Discount', '-' + Format.money(order.discount));
    html += kvRow('Extra Charges', Format.money(order.extra_charges));
    html += kvRow('Delivery', Format.money(order.delivery_charges));
    html += kvRow('Grand Total', Format.money(order.grand_total), true);
    html += kvRow('Advance Paid', Format.money(order.advance_paid));
    html += kvRow('Remaining', Format.money(order.remaining_balance));
    html += dashed;
    html += `<div style="text-align:center;margin:8px 0">${qrUrl ? `<img src="${qrUrl}" style="width:${qrSize};height:${qrSize};image-rendering:pixelated" />` : ''}</div>`;
    html += `<div style="text-align:center">Thank you for your business!</div>`;
    html += previewShellClose;
    return html;
  }

  async function openLabelPreview(order) {
    await PrintPreview.open({
      title: I18n.t('order.printLabel'),
      filename: order.tracking_no + '_label.pdf',
      defaultSize: 'thermal58',
      buildDoc: (size) => buildLabelPdf(order, size),
      buildHtml: (size) => buildLabelPreviewHtml(order, size)
    });
  }

  async function openReceiptPreview(order) {
    await PrintPreview.open({
      title: I18n.t('order.printReceipt'),
      filename: order.tracking_no + '_receipt.pdf',
      defaultSize: 'thermal80',
      buildDoc: (size) => buildReceiptPdf(order, size),
      buildHtml: (size) => buildReceiptPreviewHtml(order, size)
    });
  }

  // ---------------- WhatsApp "ready" message ----------------

  async function buildReadyWhatsappMessage(order) {
    const shop = await shopInfo();
    Format.setCurrencySymbol(shop.currency);
    const lines = [];
    const greetingKey = order.customer_gender === 'female' ? 'whatsapp.readyGreetingFemale'
      : order.customer_gender === 'male' ? 'whatsapp.readyGreetingMale'
      : 'whatsapp.readyGreeting';
    lines.push(I18n.t(greetingKey, { name: order.customer_name }));
    lines.push('');
    lines.push(I18n.t('whatsapp.readyLine', { tracking: order.tracking_no }));
    lines.push('');
    order.items.forEach((it, idx) => {
      lines.push(`${idx + 1}. ${it.category_name} (${it.service_name}) x${it.quantity}`);
    });
    lines.push('');
    lines.push(I18n.t('whatsapp.readyTotal', { amount: Format.money(order.grand_total) }));
    if (order.remaining_balance > 0) {
      lines.push(I18n.t('whatsapp.readyRemaining', { amount: Format.money(order.remaining_balance) }));
    }
    lines.push('');
    lines.push(shop.name);
    if (shop.address) lines.push(shop.address);
    if (shop.phone) lines.push(shop.phone);
    return lines.join('\n');
  }

  return {
    buildLabelPdf, buildReceiptPdf, openLabelPreview, openReceiptPreview, qrDataUrl, barcodeDataUrl,
    buildLabelPreviewHtml, buildReceiptPreviewHtml, buildReadyWhatsappMessage
  };
})();
