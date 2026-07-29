/* ============================================================
   New Order screen — customer picker, dynamic item cart,
   charges/advance calculation, save.
   ============================================================ */

const NewOrderScreen = (function () {
  let categories = [];
  let services = [];
  let items = [];
  let rowSeq = 0;
  let selectedCustomer = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  async function render(app) {
    categories = await CategoryService.list(false);
    services = await ServiceCatalog.list(false);
    items = [];
    rowSeq = 0;
    selectedCustomer = null;
    const trackingPreview = await OrderService.peekNextTrackingNo();
    const currency = await SettingsService.get('currency_symbol', 'Rs.');
    Format.setCurrencySymbol(currency);

    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <div>
          <h1 data-i18n="order.newTitle"></h1>
          <div class="subtitle">${trackingPreview}</div>
        </div>
      </header>
      <div class="page page-pad" style="padding-top:14px;padding-bottom:24px">

        <div class="card" style="margin-bottom:14px">
          <div class="card-title" data-i18n="order.customer"></div>
          <div id="customer-picker"></div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="field-row">
            <div class="field">
              <label data-i18n="order.orderDate"></label>
              <input type="date" id="in-order-date" value="${Format.todayIso()}" />
            </div>
            <div class="field">
              <label data-i18n="order.returnDate"></label>
              <input type="date" id="in-return-date" />
            </div>
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="in-urgent" />
            <label for="in-urgent" style="margin:0;text-transform:none;font-weight:600" data-i18n="order.urgent"></label>
          </div>
        </div>

        <div class="section-header" style="padding:0 0 8px">
          <h2 data-i18n="order.items"></h2>
          <a class="link" id="btn-add-item">+ <span data-i18n="order.addItem"></span></a>
        </div>
        <div id="items-container"></div>

        <div class="card" style="margin:14px 0">
          <div class="field-row">
            <div class="field"><label data-i18n="order.discount"></label><input type="number" min="0" id="in-discount" value="0" /></div>
            <div class="field"><label data-i18n="order.extraCharges"></label><input type="number" min="0" id="in-extra" value="0" /></div>
          </div>
          <div class="field"><label data-i18n="order.deliveryCharges"></label><input type="number" min="0" id="in-delivery" value="0" /></div>
          <div class="flex-between mt-8" style="font-size:14px"><span data-i18n="order.subtotal"></span><b id="sum-subtotal">Rs. 0</b></div>
          <div class="flex-between mt-8" style="font-size:16px;font-weight:800;color:var(--color-primary)"><span data-i18n="order.grandTotal"></span><b id="sum-grand">Rs. 0</b></div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="field-row">
            <div class="field"><label data-i18n="order.advancePaid"></label><input type="number" min="0" id="in-advance" value="0" /></div>
            <div class="field">
              <label data-i18n="order.paymentMethod"></label>
              <select id="in-payment-method">
                <option value="Cash" data-i18n="payment.Cash"></option>
                <option value="JazzCash" data-i18n="payment.JazzCash"></option>
                <option value="EasyPaisa" data-i18n="payment.EasyPaisa"></option>
                <option value="Bank" data-i18n="payment.Bank"></option>
                <option value="Card" data-i18n="payment.Card"></option>
              </select>
            </div>
          </div>
          <div class="flex-between mt-8" style="font-size:14px"><span data-i18n="order.grandTotal"></span><b id="sum-remaining-label">Rs. 0</b></div>
        </div>

        <div class="field">
          <label data-i18n="order.notes"></label>
          <textarea id="in-notes" rows="2"></textarea>
        </div>

        <button class="btn btn-primary btn-block mt-8" id="btn-save-order" data-i18n="order.saveOrder"></button>
      </div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-back').onclick = () => Router.navigate('/dashboard');
    app.querySelector('#btn-add-item').onclick = () => { addItemRow(); renderItems(); };
    app.querySelector('#btn-save-order').onclick = save;

    ['#in-discount', '#in-extra', '#in-delivery', '#in-advance'].forEach((sel) => {
      app.querySelector(sel).addEventListener('input', recomputeTotals);
    });

    renderCustomerPicker();
    addItemRow();
    renderItems();
    recomputeTotals();
  }

  // ---------------- Customer picker ----------------

  function renderCustomerPicker() {
    const el = document.getElementById('customer-picker');
    if (!el) return;
    if (selectedCustomer) {
      el.innerHTML = `
        <div class="list-row" style="margin:0">
          <div class="avatar">${Format.initials(selectedCustomer.name)}</div>
          <div class="main">
            <div class="title">${escapeHtml(selectedCustomer.name)}</div>
            <div class="subtitle">${escapeHtml(selectedCustomer.phone || '')}</div>
          </div>
          <button class="btn btn-sm btn-outline" id="btn-change-cust" data-i18n="common.edit"></button>
        </div>
      `;
      I18n.apply(el);
      el.querySelector('#btn-change-cust').onclick = () => { selectedCustomer = null; renderCustomerPicker(); };
      return;
    }
    el.innerHTML = `
      <input type="text" id="cust-search" data-i18n-placeholder="order.searchCustomer" />
      <div id="cust-suggestions" style="margin-top:8px"></div>
      <a class="link" id="btn-quick-add-cust" data-i18n="order.addNewCustomer" style="display:inline-block;margin-top:8px"></a>
    `;
    I18n.apply(el);
    let debounce = null;
    el.querySelector('#cust-search').addEventListener('input', (e) => {
      clearTimeout(debounce);
      const val = e.target.value;
      debounce = setTimeout(async () => {
        const rows = val.trim() ? await CustomerService.list(val) : [];
        const box = document.getElementById('cust-suggestions');
        if (!box) return;
        box.innerHTML = rows.slice(0, 6).map((c) => `
          <div class="list-row" style="margin:0 0 8px" data-pick="${c.id}">
            <div class="avatar">${Format.initials(c.name)}</div>
            <div class="main"><div class="title">${escapeHtml(c.name)}</div><div class="subtitle">${escapeHtml(c.phone || '')}</div></div>
          </div>
        `).join('');
        box.querySelectorAll('[data-pick]').forEach((row) => {
          row.onclick = () => {
            const id = parseInt(row.getAttribute('data-pick'), 10);
            selectedCustomer = rows.find((r) => r.id === id);
            renderCustomerPicker();
          };
        });
      }, 200);
    });
    el.querySelector('#btn-quick-add-cust').onclick = () => {
      CustomersScreen.openNew((newId, data) => {
        selectedCustomer = { id: newId, name: data.name, phone: data.phone };
        renderCustomerPicker();
      });
    };
  }

  // ---------------- Item rows ----------------

  function addItemRow() {
    const cat = categories[0];
    const svc = services[0];
    items.push({
      rowId: ++rowSeq,
      category_id: cat ? cat.id : null,
      category_name: cat ? cat.name : '',
      service_id: svc ? svc.id : null,
      service_name: svc ? svc.name : '',
      quantity: 1,
      rate: computeRate(cat, svc),
      rateTouched: false
    });
  }

  function computeRate(cat, svc) {
    return (cat ? Number(cat.default_price) : 0) + (svc ? Number(svc.price) : 0);
  }

  function renderItems() {
    const container = document.getElementById('items-container');
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<p class="text-muted center" data-i18n="order.noItems" style="padding:16px 0"></p>`;
      I18n.apply(container);
      return;
    }
    container.innerHTML = items.map(itemRowHtml).join('');
    I18n.apply(container);

    items.forEach((it) => {
      const row = container.querySelector(`[data-row="${it.rowId}"]`);
      if (!row) return;
      row.querySelector('.sel-category').addEventListener('change', (e) => {
        const cat = categories.find((c) => c.id === parseInt(e.target.value, 10));
        it.category_id = cat ? cat.id : null;
        it.category_name = cat ? cat.name : '';
        if (!it.rateTouched) { it.rate = computeRate(cat, services.find((s) => s.id === it.service_id)); }
        renderItems();
        recomputeTotals();
      });
      row.querySelector('.sel-service').addEventListener('change', (e) => {
        const svc = services.find((s) => s.id === parseInt(e.target.value, 10));
        it.service_id = svc ? svc.id : null;
        it.service_name = svc ? svc.name : '';
        if (!it.rateTouched) { it.rate = computeRate(categories.find((c) => c.id === it.category_id), svc); }
        renderItems();
        recomputeTotals();
      });
      row.querySelector('.in-qty').addEventListener('input', (e) => {
        it.quantity = Math.max(0, parseFloat(e.target.value) || 0);
        updateRowSubtotal(it);
        recomputeTotals();
      });
      row.querySelector('.in-rate').addEventListener('input', (e) => {
        it.rateTouched = true;
        it.rate = Math.max(0, parseFloat(e.target.value) || 0);
        updateRowSubtotal(it);
        recomputeTotals();
      });
      row.querySelector('.btn-remove-item').addEventListener('click', () => {
        items = items.filter((x) => x.rowId !== it.rowId);
        renderItems();
        recomputeTotals();
      });
      row.querySelector('.btn-pick-item-photo').addEventListener('click', () => {
        row.querySelector('.in-item-photo').click();
      });
      const photoThumb = row.querySelector('.item-photo-thumb');
      if (photoThumb) photoThumb.addEventListener('click', () => Lightbox.open(it.photo_data));
      row.querySelector('.in-item-photo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          it.photo_data = reader.result;
          renderItems();
        };
        reader.readAsDataURL(file);
      });
    });
  }

  function updateRowSubtotal(it) {
    const el = document.querySelector(`[data-row="${it.rowId}"] .row-subtotal`);
    if (el) el.textContent = Format.money(it.quantity * it.rate);
  }

  function itemRowHtml(it) {
    const catOptions = categories.map((c) => `<option value="${c.id}" ${c.id === it.category_id ? 'selected' : ''}>${Icons.categoryEmoji(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
    const svcOptions = services.map((s) => `<option value="${s.id}" ${s.id === it.service_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    return `
      <div class="card" style="margin-bottom:10px" data-row="${it.rowId}">
        <div class="field-row">
          <div class="field" style="margin-bottom:8px">
            <label data-i18n="order.category"></label>
            <select class="sel-category">${catOptions}</select>
          </div>
          <div class="field" style="margin-bottom:8px">
            <label data-i18n="order.service"></label>
            <select class="sel-service">${svcOptions}</select>
          </div>
        </div>
        <div class="field-row" style="align-items:flex-end">
          <div class="field" style="margin-bottom:0">
            <label data-i18n="order.quantity"></label>
            <input type="number" min="0" step="1" class="in-qty" value="${it.quantity}" />
          </div>
          <div class="field" style="margin-bottom:0">
            <label data-i18n="order.rate"></label>
            <input type="number" min="0" class="in-rate" value="${it.rate}" />
          </div>
          <button class="btn btn-danger btn-icon btn-remove-item" style="width:40px;height:40px;flex-shrink:0">${Icons.svg('trash', 16)}</button>
        </div>
        <div class="flex-between mt-8" style="font-size:13px">
          <span class="text-muted" data-i18n="order.subtotal"></span>
          <b class="row-subtotal">${Format.money(it.quantity * it.rate)}</b>
        </div>
        <div class="flex gap-8 mt-8" style="align-items:center">
          <input type="file" accept="image/*" capture="environment" class="hidden in-item-photo" />
          <button type="button" class="btn btn-outline btn-sm btn-pick-item-photo">${Icons.svg('camera', 14)} <span data-i18n="order.itemPhoto"></span></button>
          ${it.photo_data ? `<img src="${it.photo_data}" class="item-photo-thumb" style="width:32px;height:32px;object-fit:cover;border-radius:6px;cursor:zoom-in" />` : ''}
        </div>
      </div>
    `;
  }

  // ---------------- Totals ----------------

  function recomputeTotals() {
    const discount = parseFloat(document.getElementById('in-discount').value) || 0;
    const extra = parseFloat(document.getElementById('in-extra').value) || 0;
    const delivery = parseFloat(document.getElementById('in-delivery').value) || 0;
    const advance = parseFloat(document.getElementById('in-advance').value) || 0;
    const totals = OrderService.computeTotals(items, discount, extra, delivery, advance);
    document.getElementById('sum-subtotal').textContent = Format.money(totals.subtotal);
    document.getElementById('sum-grand').textContent = Format.money(totals.grandTotal);
    document.getElementById('sum-remaining-label').textContent = Format.money(totals.remaining);
    return totals;
  }

  // ---------------- Save ----------------

  async function save() {
    if (!selectedCustomer) { Toast.error(I18n.t('order.selectCustomerFirst')); return; }
    if (!items.length) { Toast.error(I18n.t('order.addAtLeastOneItem')); return; }

    const btn = document.getElementById('btn-save-order');
    btn.disabled = true;

    const discount = parseFloat(document.getElementById('in-discount').value) || 0;
    const extra = parseFloat(document.getElementById('in-extra').value) || 0;
    const delivery = parseFloat(document.getElementById('in-delivery').value) || 0;
    const advance = parseFloat(document.getElementById('in-advance').value) || 0;

    const orderData = {
      customer_id: selectedCustomer.id,
      order_date: document.getElementById('in-order-date').value || Format.todayIso(),
      return_date: document.getElementById('in-return-date').value || null,
      urgent: document.getElementById('in-urgent').checked,
      discount, extra_charges: extra, delivery_charges: delivery,
      advance_paid: advance,
      payment_method: document.getElementById('in-payment-method').value,
      notes: document.getElementById('in-notes').value.trim()
    };

    try {
      const result = await OrderService.createOrder(orderData, items);
      Toast.success(I18n.t('order.orderCreated') + ': ' + result.trackingNo);
      Router.navigate('/orders/' + result.orderId);
    } catch (err) {
      console.error(err);
      Toast.error(I18n.t('common.error'));
      btn.disabled = false;
    }
  }

  return { render };
})();
