/* ============================================================
   Reports screen — pick a report type, view results, export PDF
   or print. Fully generic over ReportService's {columns, rows,
   totals} shape.
   ============================================================ */

const ReportsScreen = (function () {
  const TYPES = ['daily', 'weekly', 'monthly', 'yearly', 'orderStatus', 'customer', 'invoiceCustomer', 'invoiceDate', 'revenue', 'profit', 'pending', 'delivered', 'category', 'service', 'expense'];
  let currentType = 'daily';
  let currentReport = null;
  let customersCache = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function needsParams(type) {
    return ['daily', 'weekly', 'monthly', 'yearly', 'revenue', 'profit', 'delivered', 'orderStatus', 'invoiceCustomer', 'invoiceDate', 'expense'].includes(type);
  }

  function customerOptions(includeAll) {
    const opts = includeAll ? [`<option value="" data-i18n="report.allCustomers"></option>`] : [];
    return opts.concat(customersCache.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)).join('');
  }

  function statusOptions() {
    return OrderService.ALL_STATUSES.map((s) => `<option value="${s}" data-i18n="status.${s}"></option>`).join('');
  }

  function paramsHtml(type) {
    const today = Format.todayIso();
    const monthStart = today.slice(0, 8) + '01';
    if (type === 'daily' || type === 'weekly') {
      return `<div class="field"><label data-i18n="report.${type === 'daily' ? 'daily' : 'weekly'}"></label><input type="date" id="p-date" value="${today}" /></div>`;
    }
    if (type === 'monthly') {
      return `<div class="field"><label data-i18n="report.monthly"></label><input type="month" id="p-month" value="${today.slice(0, 7)}" /></div>`;
    }
    if (type === 'yearly') {
      return `<div class="field"><label data-i18n="report.yearly"></label><input type="number" id="p-year" value="${new Date().getFullYear()}" /></div>`;
    }
    if (type === 'revenue' || type === 'profit' || type === 'delivered' || type === 'expense') {
      return `
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" value="${monthStart}" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>`;
    }
    if (type === 'orderStatus') {
      return `<div class="field"><label data-i18n="report.selectStatus"></label><select id="p-status">${statusOptions()}</select></div>`;
    }
    if (type === 'invoiceCustomer') {
      return `
        <div class="field"><label data-i18n="report.selectCustomer"></label><select id="p-customer">${customerOptions(false)}</select></div>
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>`;
    }
    if (type === 'invoiceDate') {
      return `
        <div class="field-row">
          <div class="field"><label data-i18n="report.fromDate"></label><input type="date" id="p-from" value="${monthStart}" /></div>
          <div class="field"><label data-i18n="report.toDate"></label><input type="date" id="p-to" value="${today}" /></div>
        </div>
        <div class="field"><label data-i18n="report.selectCustomer"></label><select id="p-customer">${customerOptions(true)}</select></div>`;
    }
    return '';
  }

  function readParams(type) {
    if (type === 'daily' || type === 'weekly') return { date: document.getElementById('p-date').value };
    if (type === 'monthly') return { yearMonth: document.getElementById('p-month').value };
    if (type === 'yearly') return { year: document.getElementById('p-year').value };
    if (type === 'revenue' || type === 'profit' || type === 'delivered' || type === 'expense') return { from: document.getElementById('p-from').value, to: document.getElementById('p-to').value };
    if (type === 'orderStatus') return { status: document.getElementById('p-status').value };
    if (type === 'invoiceCustomer') return { customerId: parseInt(document.getElementById('p-customer').value, 10), from: document.getElementById('p-from').value || null, to: document.getElementById('p-to').value || null };
    if (type === 'invoiceDate') {
      const custVal = document.getElementById('p-customer').value;
      return { from: document.getElementById('p-from').value, to: document.getElementById('p-to').value, customerId: custVal ? parseInt(custVal, 10) : null };
    }
    return {};
  }

  async function render(app) {
    const currency = await SettingsService.get('currency_symbol', 'Rs.');
    Format.setCurrencySymbol(currency);
    customersCache = await CustomerService.list();

    app.innerHTML = `
      <header class="app-header"><h1 data-i18n="nav.reports"></h1></header>
      <div class="tabs" id="type-tabs">
        ${TYPES.map((t) => `<div class="tab-chip ${t === currentType ? 'active' : ''}" data-type="${t}" data-i18n="report.${t}"></div>`).join('')}
      </div>
      <div class="page-pad">
        <div class="card" id="params-card" style="margin-bottom:14px"></div>
        <div id="report-summary" class="stat-grid" style="padding:0;margin-bottom:14px"></div>
        <div class="flex gap-8" style="margin-bottom:14px">
          <button class="btn btn-outline btn-block" id="btn-print">${Icons.svg('printer', 16)} <span data-i18n="common.print"></span></button>
          <button class="btn btn-primary btn-block" id="btn-export-pdf">${Icons.svg('download', 16)} <span data-i18n="report.exportPdf"></span></button>
        </div>
        <div class="card" style="overflow-x:auto">
          <div id="report-table"></div>
        </div>
      </div>
    `;
    I18n.apply(app);

    app.querySelectorAll('#type-tabs .tab-chip').forEach((el) => {
      el.onclick = () => {
        currentType = el.getAttribute('data-type');
        app.querySelectorAll('#type-tabs .tab-chip').forEach((c) => c.classList.remove('active'));
        el.classList.add('active');
        renderParams();
        runReport();
      };
    });

    app.querySelector('#btn-print').onclick = () => openPreview();
    app.querySelector('#btn-export-pdf').onclick = () => openPreview();

    renderParams();
    await runReport();
  }

  function renderParams() {
    const card = document.getElementById('params-card');
    if (!needsParams(currentType)) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    card.innerHTML = paramsHtml(currentType) + `<button class="btn btn-primary btn-block mt-8" id="btn-run" data-i18n="common.search"></button>`;
    I18n.apply(card);
    card.querySelector('#btn-run').onclick = runReport;
  }

  async function runReport() {
    if (currentType === 'invoiceCustomer' && !customersCache.length) {
      currentReport = { title: I18n.t('report.invoiceCustomer'), columns: [], rows: [], totals: [] };
      renderSummary(currentReport);
      renderTable(currentReport);
      return;
    }
    const params = needsParams(currentType) ? readParams(currentType) : {};
    currentReport = await ReportService.generate(currentType, params);
    renderSummary(currentReport);
    renderTable(currentReport);
  }

  function renderSummary(report) {
    const el = document.getElementById('report-summary');
    const palette = ['stat-c1', 'stat-c3', 'stat-c5', 'stat-c7'];
    el.innerHTML = report.totals.map((t, i) => `
      <div class="stat-card ${palette[i % palette.length]}">
        <div class="stat-value">${t.money ? Format.money(t.value) : t.value}</div>
        <div class="stat-label">${escapeHtml(t.label)}</div>
      </div>
    `).join('');
  }

  function renderTable(report) {
    const el = document.getElementById('report-table');
    if (!report.rows.length) {
      el.innerHTML = `<div class="empty-state"><div class="ei">📊</div><p data-i18n="report.noData"></p></div>`;
      I18n.apply(el);
      return;
    }
    el.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${report.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${report.rows.map((r) => `<tr>${report.columns.map((c) => `<td>${c.money ? Format.money(r[c.key]) : escapeHtml(r[c.key])}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function cellText(report, row, col) {
    const val = row[col.key];
    return col.money ? Format.money(val) : String(val == null ? '' : val);
  }

  function buildReportPdfA4(report) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(report.title, 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(report.totals.map((t) => `${t.label}: ${t.money ? Format.money(t.value) : t.value}`).join('   |   '), 14, 23);
    doc.autoTable({
      startY: 29,
      margin: { left: 14, right: 14 },
      head: [report.columns.map((c) => c.label)],
      body: report.rows.map((r) => report.columns.map((c) => cellText(report, r, c))),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [37, 99, 235] }
    });
    return doc;
  }

  function buildReportPdfThermal(report, paperSize) {
    const { jsPDF } = window.jspdf;
    const width = paperSize === 'thermal58' ? 58 : 80;

    // Draw twice: once on a generously tall scratch page just to
    // measure where content actually ends (rows/labels can wrap),
    // then again on a page sized exactly to that content so nothing
    // gets cut off past the bottom edge.
    function draw(doc) {
      const marginX = 4;
      let y = 7;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(report.title, width / 2, y, { align: 'center', maxWidth: width - 8 });
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      report.totals.forEach((t) => {
        doc.text(String(t.label), marginX, y);
        doc.text(t.money ? Format.money(t.value) : String(t.value), width - marginX, y, { align: 'right' });
        y += 4.2;
      });
      y += 1;
      doc.setDrawColor(150);
      doc.line(marginX, y, width - marginX, y);
      y += 4;

      report.rows.forEach((r, idx) => {
        report.columns.forEach((c) => {
          doc.setFont('helvetica', 'normal');
          doc.text(c.label + ':', marginX, y);
          doc.text(cellText(report, r, c), width - marginX, y, { align: 'right', maxWidth: width - 30 });
          y += 4.2;
        });
        if (idx < report.rows.length - 1) {
          doc.setDrawColor(220);
          doc.line(marginX, y, width - marginX, y);
          y += 3;
        }
      });
      return y;
    }

    const scratch = new jsPDF({ unit: 'mm', format: [width, 3000] });
    const finalY = draw(scratch);
    const doc = new jsPDF({ unit: 'mm', format: [width, Math.max(60, Math.ceil(finalY) + 6)] });
    draw(doc);
    return doc;
  }

  function buildReportPdf(report, paperSize) {
    return paperSize === 'a4' ? buildReportPdfA4(report) : buildReportPdfThermal(report, paperSize);
  }

  function buildReportPreviewHtml(report) {
    const rows = report.rows.map((r) => `<tr>${report.columns.map((c) => `<td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${escapeHtml(cellText(report, r, c))}</td>`).join('')}</tr>`).join('');
    const totals = report.totals.map((t) => `<span style="margin-right:14px"><b>${escapeHtml(t.label)}:</b> ${escapeHtml(t.money ? Format.money(t.value) : t.value)}</span>`).join('');
    return `
      <div style="background:#fff;color:#111;padding:16px;font-family:Arial,sans-serif;font-size:12px;min-width:100%">
        <div style="font-weight:700;font-size:16px;margin-bottom:6px">${escapeHtml(report.title)}</div>
        <div style="margin-bottom:10px;color:#555">${totals}</div>
        <table style="border-collapse:collapse;width:100%">
          <thead><tr>${report.columns.map((c) => `<th style="text-align:left;padding:4px 6px;border-bottom:2px solid #2563eb;white-space:nowrap">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  async function openPreview() {
    if (!currentReport || !currentReport.rows.length) { Toast.error(I18n.t('report.noData')); return; }
    await PrintPreview.open({
      title: currentReport.title,
      filename: currentReport.title.replace(/[^a-z0-9]+/gi, '_') + '.pdf',
      defaultSize: 'a4',
      buildDoc: (size) => buildReportPdf(currentReport, size),
      buildHtml: () => buildReportPreviewHtml(currentReport)
    });
  }

  return { render };
})();
