/* ============================================================
   Orders screen — list (with status filter chips) + detail view
   with the status pipeline (Pending -> ... -> Delivered/Cancelled).
   ============================================================ */

const OrdersScreen = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function rowHtml(o) {
    return `
      <div class="list-row" data-order="${o.id}">
        <div class="avatar">${Format.initials(o.customer_name)}</div>
        <div class="main">
          <div class="title">${escapeHtml(o.tracking_no)} ${o.urgent ? `<span class="badge badge-urgent">!</span>` : ''}</div>
          <div class="subtitle">${escapeHtml(o.customer_name)} · ${Format.shortDate(o.order_date)}</div>
        </div>
        <div class="end">
          <div class="amount">${Format.money(o.grand_total)}</div>
          <span class="${Format.statusBadgeClass(o.status)}">${I18n.t('status.' + o.status)}</span>
        </div>
        <div class="row-actions" style="display:flex;gap:4px;margin-left:6px">
          <button class="icon-btn row-action-btn" data-edit-order="${o.id}" title="${I18n.t('common.edit')}">${Icons.svg('edit', 16)}</button>
          <button class="icon-btn row-action-btn" data-delete-order="${o.id}" title="${I18n.t('common.delete')}">${Icons.svg('trash', 16)}</button>
        </div>
      </div>
    `;
  }

  function wireRows(container) {
    container.querySelectorAll('[data-order]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest('[data-edit-order]') || e.target.closest('[data-delete-order]')) return;
        Router.navigate('/orders/' + el.getAttribute('data-order'));
      };
    });
    container.querySelectorAll('[data-edit-order]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        Router.navigate('/orders/edit/' + btn.getAttribute('data-edit-order'));
      };
    });
    container.querySelectorAll('[data-delete-order]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-delete-order'), 10);
        const ok = await Modal.confirm({ message: I18n.t('order.deleteConfirm'), danger: true });
        if (!ok) return;
        await OrderService.deleteOrder(id);
        Toast.success(I18n.t('common.deleted'));
        const activeTab = document.querySelector('#status-tabs .tab-chip.active');
        loadList(activeTab ? activeTab.getAttribute('data-status') : '');
      };
    });
  }

  // ---------------- List ----------------

  async function renderList(app) {
    const query = Router.getQuery();
    const initialStatus = query.get('status') || '';

    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="order.listTitle"></h1>
      </header>
      <div class="tabs" id="status-tabs">
        <div class="tab-chip ${!initialStatus ? 'active' : ''}" data-status="">${I18n.t('common.all')}</div>
        ${OrderService.ALL_STATUSES.map((s) => `<div class="tab-chip ${s === initialStatus ? 'active' : ''}" data-status="${s}">${I18n.t('status.' + s)}</div>`).join('')}
      </div>
      <div id="orders-list"></div>
    `;
    I18n.apply(app);

    app.querySelectorAll('#status-tabs .tab-chip').forEach((el) => {
      el.onclick = () => {
        app.querySelectorAll('#status-tabs .tab-chip').forEach((c) => c.classList.remove('active'));
        el.classList.add('active');
        loadList(el.getAttribute('data-status'));
      };
    });

    await loadList(initialStatus);
  }

  async function loadList(status) {
    const listEl = document.getElementById('orders-list');
    if (!listEl) return;
    const rows = await OrderService.search(status ? { status } : {});
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('orders', 40)}</div><p data-i18n="order.noOrders"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    wireRows(listEl);
  }

  // ---------------- Detail ----------------

  async function renderDetail(app, params) {
    const order = await OrderService.getById(parseInt(params.id, 10));
    const countryCode = await SettingsService.get('country_code', '92');
    if (!order) {
      app.innerHTML = `<div class="empty-state"><div class="ei">🔍</div><p data-i18n="order.noOrders"></p></div>`;
      I18n.apply(app);
      return;
    }

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <div>
          <h1>${escapeHtml(order.tracking_no)}</h1>
          <div class="subtitle">${Format.shortDate(order.order_date)}${order.urgent ? ' · ⚡' : ''}</div>
        </div>
        <span class="${Format.statusBadgeClass(order.status)}">${I18n.t('status.' + order.status)}</span>
        <button class="icon-btn" id="btn-edit-order" title="${I18n.t('common.edit')}">${Icons.svg('edit', 20)}</button>
        <button class="icon-btn" id="btn-delete-order" title="${I18n.t('common.delete')}">${Icons.svg('trash', 20)}</button>
      </header>

      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">
        <div class="card" style="margin-bottom:14px">
          <div class="flex-between">
            <div>
              <div style="font-weight:700">${escapeHtml(order.customer_name)}</div>
              <div class="text-muted" style="font-size:12.5px">${escapeHtml(order.customer_phone || '')}</div>
            </div>
            <div class="flex gap-8">
              <a class="btn btn-outline btn-sm btn-icon" href="tel:${escapeHtml(order.customer_phone || '')}">${Icons.svg('phone', 16)}</a>
              <a class="btn btn-outline btn-sm btn-icon" target="_blank" rel="noopener" href="https://wa.me/${Format.toWhatsappNumber(order.customer_whatsapp || order.customer_phone, countryCode)}">${Icons.svg('whatsapp', 16)}</a>
            </div>
          </div>
          <div class="flex-between mt-8" style="font-size:12.5px" class="text-muted">
            <span class="text-muted" data-i18n="order.returnDate"></span>
            <b>${order.return_date ? Format.shortDate(order.return_date) : '—'}</b>
          </div>
        </div>

        ${order.status === 'Ready' ? `
        <div class="card" style="margin-bottom:14px;border-color:var(--status-ready)">
          <div class="flex-between" style="gap:10px;flex-wrap:wrap">
            <p class="text-muted" style="font-size:11.5px;margin:0;flex:1;min-width:140px" data-i18n="order.sendWhatsappHint"></p>
            <button class="btn btn-success" style="flex-shrink:0" id="btn-send-whatsapp">${Icons.svg('whatsapp', 18)} <span data-i18n="order.sendWhatsapp"></span></button>
          </div>
        </div>` : ''}

        <div class="flex gap-8" style="margin-bottom:14px">
          <button class="btn btn-outline btn-block" id="btn-print-label">${Icons.svg('qr', 16)} <span data-i18n="order.printLabel"></span></button>
          <button class="btn btn-outline btn-block" id="btn-print-receipt">${Icons.svg('printer', 16)} <span data-i18n="order.printReceipt"></span></button>
        </div>
        ${order.status !== 'Delivered' && order.status !== 'Cancelled' ? `
        <button class="btn btn-accent btn-block" id="btn-confirm-delivery" style="margin-bottom:14px">${Icons.svg('truck', 18)} <span data-i18n="order.confirmDelivery"></span></button>` : ''}
        ${order.status === 'Delivered' ? `
        <div class="card" style="margin-bottom:14px">
          <div class="flex-between"><span class="text-muted" data-i18n="order.deliveredOn"></span><b>${Format.dateTime(order.delivered_at)}</b></div>
          ${order.delivered_by ? `<div class="flex-between mt-8"><span class="text-muted" data-i18n="delivery.staffName"></span><b>${escapeHtml(order.delivered_by)}</b></div>` : ''}
          ${order.signature_data ? `<div class="mt-8"><img src="${order.signature_data}" style="max-width:100%;border:1px solid var(--color-border);border-radius:8px" /></div>` : ''}
        </div>` : ''}

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.items"></div>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th data-i18n="order.category"></th><th data-i18n="order.service"></th><th data-i18n="order.quantity"></th><th data-i18n="order.rate"></th><th data-i18n="order.subtotal"></th><th></th></tr></thead>
              <tbody>
                ${order.items.map((it) => `<tr><td>${escapeHtml(it.category_name)}</td><td>${escapeHtml(it.service_name)}</td><td>${it.quantity}</td><td>${Format.money(it.rate)}</td><td>${Format.money(it.subtotal)}</td><td>${it.photo_path ? `<img class="item-photo-thumb" src="${it.photo_path}" style="width:28px;height:28px;object-fit:cover;border-radius:6px;cursor:zoom-in" />` : ''}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="flex-between"><span class="text-muted" data-i18n="order.subtotal"></span><b>${Format.money(order.subtotal)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.discount"></span><b>-${Format.money(order.discount)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.extraCharges"></span><b>${Format.money(order.extra_charges)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.deliveryCharges"></span><b>${Format.money(order.delivery_charges)}</b></div>
          <div class="flex-between mt-8" style="font-weight:800;color:var(--color-primary)"><span data-i18n="order.grandTotal"></span><b>${Format.money(order.grand_total)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.advancePaid"></span><b>${Format.money(order.advance_paid)}</b></div>
          <div class="flex-between mt-8"><span class="text-muted text-danger" data-i18n="dash.remainingBalance"></span><b class="text-danger">${Format.money(order.remaining_balance)}</b></div>
        </div>

        ${order.remaining_balance > 0 && order.status !== 'Cancelled' ? `
        <button class="btn btn-success btn-block" id="btn-receive-payment" style="margin-bottom:14px">${Icons.svg('money', 18)} <span data-i18n="order.receivePaymentBtn"></span></button>` : ''}

        ${order.notes ? `<div class="card" style="margin-bottom:14px"><div class="card-title" data-i18n="order.notes"></div><p>${escapeHtml(order.notes)}</p></div>` : ''}

        ${order.payments.length ? `
        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.paymentHistory"></div>
          ${order.payments.map((p) => `<div class="flex-between mt-8" style="font-size:13px"><span class="text-muted">${Format.dateTime(p.paid_at)} · ${escapeHtml(p.method)}</span><b>${Format.money(p.amount)}</b></div>`).join('')}
        </div>` : ''}

        ${order.history && order.history.length ? `
        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.timeline"></div>
          ${order.history.map((h) => `<div class="flex-between mt-8" style="font-size:13px"><span class="${Format.statusBadgeClass(h.status)}">${I18n.t('status.' + h.status)}</span><span class="text-muted">${Format.dateTime(h.changed_at)}</span></div>`).join('')}
        </div>` : ''}

        <div class="card">
          <div class="card-title" data-i18n="order.changeStatus"></div>
          <div class="tabs" style="padding:0;flex-wrap:wrap" id="status-changer">
            ${OrderService.ALL_STATUSES.map((s) => `<div class="tab-chip ${s === order.status ? 'active' : ''}" data-set-status="${s}">${I18n.t('status.' + s)}</div>`).join('')}
          </div>
        </div>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/orders');
    app.querySelector('#btn-edit-order').onclick = () => Router.navigate('/orders/edit/' + order.id);
    app.querySelector('#btn-delete-order').onclick = async () => {
      const ok = await Modal.confirm({ message: I18n.t('order.deleteConfirm'), danger: true });
      if (!ok) return;
      await OrderService.deleteOrder(order.id);
      Toast.success(I18n.t('common.deleted'));
      Router.navigate('/orders');
    };

    app.querySelectorAll('.item-photo-thumb').forEach((img) => {
      img.onclick = () => Lightbox.open(img.src);
    });

    const whatsappBtn = app.querySelector('#btn-send-whatsapp');
    if (whatsappBtn) {
      whatsappBtn.onclick = async () => {
        const message = await Documents.buildReadyWhatsappMessage(order);
        const phone = Format.toWhatsappNumber(order.customer_whatsapp || order.customer_phone, countryCode);
        if (!phone) { Toast.error(I18n.t('cust.noWhatsappNumber')); return; }
        window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank');
      };
    }

    app.querySelector('#btn-print-label').onclick = () => Documents.openLabelPreview(order);
    app.querySelector('#btn-print-receipt').onclick = () => Documents.openReceiptPreview(order);

    const deliveryBtn = app.querySelector('#btn-confirm-delivery');
    if (deliveryBtn) {
      deliveryBtn.onclick = () => DeliveryModal.open(order, () => renderDetail(app, params));
    }

    const paymentBtn = app.querySelector('#btn-receive-payment');
    if (paymentBtn) {
      paymentBtn.onclick = () => PaymentModal.open(order, () => renderDetail(app, params));
    }

    app.querySelectorAll('[data-set-status]').forEach((el) => {
      el.onclick = async () => {
        const status = el.getAttribute('data-set-status');
        if (status === order.status) return;
        await OrderService.updateStatus(order.id, status);
        Toast.success(I18n.t('common.saved'));
        renderDetail(app, params);
      };
    });
  }

  return { renderList, renderDetail, rowHtml, wireRows, escapeHtml };
})();
