/* ============================================================
   Customers screen — list/search/CRUD + history detail sheet.
   ============================================================ */

const CustomersScreen = (function () {
  let searchDebounce = null;

  async function render(app) {
    app.innerHTML = `
      <header class="app-header">
        <h1 data-i18n="cust.title"></h1>
        <button class="icon-btn" id="btn-add-customer">${Icons.svg('plus', 24)}</button>
      </header>
      <div class="search-bar">
        ${Icons.svg('search', 18)}
        <input type="text" id="cust-search" data-i18n-placeholder="cust.searchPlaceholder" />
      </div>
      <div id="cust-list"></div>
    `;
    I18n.apply(app);

    app.querySelector('#btn-add-customer').onclick = () => openForm();
    app.querySelector('#cust-search').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value;
      searchDebounce = setTimeout(() => loadList(val), 200);
    });

    await loadList('');
  }

  async function loadList(term) {
    const listEl = document.getElementById('cust-list');
    if (!listEl) return;
    const rows = await CustomerService.list(term);
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">${Icons.svg('customers', 40)}</div><p data-i18n="cust.empty"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    listEl.querySelectorAll('.list-row').forEach((el) => {
      el.onclick = () => openDetail(parseInt(el.getAttribute('data-id'), 10));
    });
  }

  function avatarHtml(c) {
    return c.photo_path
      ? `<div class="avatar" style="padding:0;overflow:hidden"><img src="${c.photo_path}" style="width:100%;height:100%;object-fit:cover" /></div>`
      : `<div class="avatar">${Format.initials(c.name)}</div>`;
  }

  function rowHtml(c) {
    return `
      <div class="list-row" data-id="${c.id}">
        ${avatarHtml(c)}
        <div class="main">
          <div class="title">${escapeHtml(c.name)}</div>
          <div class="subtitle">${escapeHtml(c.phone || '')}</div>
        </div>
        ${Icons.svg('chevron', 18, 'text-muted')}
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function openForm(existing, onSaved) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'cust.edit' : 'cust.new'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="center">
        <div id="cust-photo-preview" class="login-logo" style="cursor:pointer">${existing && existing.photo_path ? `<img src="${existing.photo_path}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />` : Icons.svg('camera', 26)}</div>
        <input type="file" accept="image/*" capture="environment" id="in-cust-photo" class="hidden" />
        <a class="link" id="btn-pick-cust-photo" data-i18n="cust.photo" style="display:inline-block;margin:6px 0 4px"></a>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="cust.name"></label>
        <input id="in-name" value="${existing ? escapeHtml(existing.name) : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="cust.gender"></label>
        <select id="in-gender">
          <option value="" data-i18n="cust.genderUnspecified" ${!existing || !existing.gender ? 'selected' : ''}></option>
          <option value="male" data-i18n="cust.genderMale" ${existing && existing.gender === 'male' ? 'selected' : ''}></option>
          <option value="female" data-i18n="cust.genderFemale" ${existing && existing.gender === 'female' ? 'selected' : ''}></option>
        </select>
      </div>
      <div class="field-row">
        <div class="field" id="f-phone">
          <label data-i18n="cust.phone"></label>
          <input id="in-phone" type="tel" value="${existing ? escapeHtml(existing.phone || '') : ''}" />
          <div class="error-msg" data-i18n="common.invalidPhone"></div>
        </div>
        <div class="field">
          <label data-i18n="cust.whatsapp"></label>
          <input id="in-whatsapp" type="tel" value="${existing ? escapeHtml(existing.whatsapp || '') : ''}" data-i18n-placeholder="cust.sameAsPhone" />
        </div>
      </div>
      <div class="field">
        <label data-i18n="cust.address"></label>
        <textarea id="in-address" rows="2">${existing ? escapeHtml(existing.address || '') : ''}</textarea>
      </div>
      <div class="field">
        <label data-i18n="cust.notes"></label>
        <textarea id="in-notes" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
      <button class="btn btn-primary btn-block" id="btn-save-customer" data-i18n="common.save"></button>
    `);
    I18n.apply(sheet);

    let photoDataUrl = existing && existing.photo_path ? existing.photo_path : null;
    sheet.querySelector('#btn-pick-cust-photo').onclick = () => sheet.querySelector('#in-cust-photo').click();
    sheet.querySelector('#cust-photo-preview').onclick = () => sheet.querySelector('#in-cust-photo').click();
    sheet.querySelector('#in-cust-photo').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        photoDataUrl = reader.result;
        sheet.querySelector('#cust-photo-preview').innerHTML = `<img src="${photoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:22px" />`;
      };
      reader.readAsDataURL(file);
    });

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-save-customer').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      const fName = sheet.querySelector('#f-name');
      fName.classList.toggle('invalid', !name);

      const phone = sheet.querySelector('#in-phone').value.trim();
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneInvalid = phone.length > 0 && phoneDigits.length < 7;
      sheet.querySelector('#f-phone').classList.toggle('invalid', phoneInvalid);

      if (!name || phoneInvalid) return;

      const data = {
        name,
        photo_path: photoDataUrl,
        phone,
        whatsapp: sheet.querySelector('#in-whatsapp').value.trim(),
        gender: sheet.querySelector('#in-gender').value,
        address: sheet.querySelector('#in-address').value.trim(),
        notes: sheet.querySelector('#in-notes').value.trim()
      };

      let newId = existing ? existing.id : null;
      if (isEdit) {
        await CustomerService.update(existing.id, data);
      } else {
        newId = await CustomerService.create(data);
      }
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      if (document.getElementById('cust-list')) {
        loadList(document.getElementById('cust-search') ? document.getElementById('cust-search').value : '');
      }
      if (onSaved) onSaved(newId, data);
    };
  }

  async function openDetail(id) {
    const customer = await CustomerService.getById(id);
    if (!customer) return;
    const stats = await CustomerService.historyStats(id);
    const history = await CustomerService.orderHistory(id);
    const countryCode = await SettingsService.get('country_code', '92');

    const sheet = Modal.open(`
      <div class="modal-header">
        <h3>${escapeHtml(customer.name)}</h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="flex gap-8 mt-8" style="margin-bottom:14px">
        <a class="btn btn-outline btn-sm" href="tel:${escapeHtml(customer.phone || '')}">${Icons.svg('phone', 16)} <span data-i18n="cust.call"></span></a>
        <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="https://wa.me/${Format.toWhatsappNumber(customer.whatsapp || customer.phone, countryCode)}">${Icons.svg('whatsapp', 16)} <span data-i18n="cust.whatsappBtn"></span></a>
      </div>
      <div class="stat-grid" style="padding:0;margin-bottom:14px">
        <div class="stat-card stat-c1"><div class="stat-label" data-i18n="cust.totalOrders"></div><div class="stat-value">${stats.totalOrders}</div></div>
        <div class="stat-card stat-c3"><div class="stat-label" data-i18n="cust.totalPaid"></div><div class="stat-value">${Format.money(stats.totalPaid)}</div></div>
        <div class="stat-card stat-c5" style="grid-column:span 2"><div class="stat-label" data-i18n="cust.totalRemaining"></div><div class="stat-value">${Format.money(stats.totalRemaining)}</div></div>
      </div>
      ${customer.address ? `<p class="text-muted mt-8">${Icons.svg('user', 14)} ${escapeHtml(customer.address)}</p>` : ''}
      ${customer.notes ? `<p class="text-muted mt-8">${escapeHtml(customer.notes)}</p>` : ''}
      <div class="section-header" style="padding:16px 0 8px"><h2 data-i18n="cust.history"></h2></div>
      ${history.length ? history.map(historyRowHtml).join('') : `<p class="text-muted center" data-i18n="common.noResults"></p>`}
      <div class="flex gap-8 mt-16">
        <button class="btn btn-outline btn-block" id="btn-edit-cust">${Icons.svg('edit', 16)} <span data-i18n="common.edit"></span></button>
        <button class="btn btn-danger btn-block" id="btn-del-cust">${Icons.svg('trash', 16)} <span data-i18n="common.delete"></span></button>
      </div>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-edit-cust').onclick = () => { Modal.close(); setTimeout(() => openForm(customer), 200); };
    sheet.querySelector('#btn-del-cust').onclick = async () => {
      const ok = await Modal.confirm({ message: I18n.t('cust.deleteConfirm'), danger: true });
      if (!ok) return;
      await CustomerService.remove(id);
      Modal.close();
      Toast.success(I18n.t('common.deleted'));
      loadList('');
    };
  }

  function historyRowHtml(o) {
    return `
      <div class="list-row" style="margin:0 0 10px">
        <div class="main">
          <div class="title">${escapeHtml(o.tracking_no)}</div>
          <div class="subtitle">${Format.shortDate(o.order_date)}</div>
        </div>
        <div class="end">
          <div class="amount">${Format.money(o.grand_total)}</div>
          <span class="${Format.statusBadgeClass(o.status)}">${escapeHtml(o.status)}</span>
        </div>
      </div>
    `;
  }

  return { render, openNew: (onSaved) => openForm(null, onSaved) };
})();
