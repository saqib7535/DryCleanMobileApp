/* ============================================================
   Services screen — wash/iron/dry-clean service catalog management.
   ============================================================ */

const ServicesScreen = (function () {
  async function render(app) {
    app.innerHTML = `
      <header class="app-header">
        <button class="icon-btn back-btn" id="btn-back">${Icons.svg('back', 22)}</button>
        <h1 data-i18n="svc.title"></h1>
        <button class="icon-btn" id="btn-add-svc">${Icons.svg('plus', 24)}</button>
      </header>
      <div id="svc-list" class="page-pad" style="padding-top:12px"></div>
    `;
    I18n.apply(app);
    app.querySelector('#btn-back').onclick = () => Router.navigate('/settings');
    app.querySelector('#btn-add-svc').onclick = () => openForm();
    await loadList();
  }

  async function loadList() {
    const listEl = document.getElementById('svc-list');
    if (!listEl) return;
    const rows = await ServiceCatalog.list(true);
    if (!rows.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="ei">🧼</div><p data-i18n="svc.empty"></p></div>`;
      I18n.apply(listEl);
      return;
    }
    listEl.innerHTML = rows.map(rowHtml).join('');
    listEl.querySelectorAll('[data-toggle]').forEach((el) => {
      el.onclick = async (e) => {
        e.stopPropagation();
        const id = parseInt(el.getAttribute('data-toggle'), 10);
        const enabled = el.getAttribute('data-enabled') === '1';
        await ServiceCatalog.toggleEnabled(id, !enabled);
        loadList();
      };
    });
    listEl.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = async () => {
        const svc = await ServiceCatalog.getById(parseInt(el.getAttribute('data-edit'), 10));
        openForm(svc);
      };
    });
  }

  function rowHtml(s) {
    return `
      <div class="card flex-between" style="margin-bottom:10px;cursor:pointer" data-edit="${s.id}">
        <div>
          <div style="font-weight:700">${s.name}</div>
          <div class="text-muted" style="font-size:12.5px">${Format.money(s.price)}</div>
        </div>
        <button class="btn btn-sm ${s.enabled ? 'btn-success' : 'btn-outline'}" data-toggle="${s.id}" data-enabled="${s.enabled}">
          ${s.enabled ? I18n.t('cat.enabled') : I18n.t('common.no')}
        </button>
      </div>
    `;
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="${isEdit ? 'svc.edit' : 'svc.new'}"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="field" id="f-name">
        <label data-i18n="svc.name"></label>
        <input id="in-name" value="${existing ? existing.name : ''}" />
        <div class="error-msg" data-i18n="common.requiredField"></div>
      </div>
      <div class="field">
        <label data-i18n="svc.price"></label>
        <input id="in-price" type="number" min="0" step="1" value="${existing ? existing.price : 0}" />
      </div>
      <div class="checkbox-row mt-8">
        <input type="checkbox" id="in-enabled" ${!existing || existing.enabled ? 'checked' : ''} />
        <label for="in-enabled" style="margin:0;text-transform:none;font-weight:500" data-i18n="cat.enabled"></label>
      </div>
      <div class="flex gap-8 mt-16">
        ${isEdit ? `<button class="btn btn-danger" id="btn-del-svc">${Icons.svg('trash', 18)}</button>` : ''}
        <button class="btn btn-primary btn-block" id="btn-save-svc" data-i18n="common.save"></button>
      </div>
    `);
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    if (isEdit) {
      sheet.querySelector('#btn-del-svc').onclick = async () => {
        const ok = await Modal.confirm({ message: I18n.t('svc.deleteConfirm'), danger: true });
        if (!ok) return;
        await ServiceCatalog.remove(existing.id);
        Modal.close();
        Toast.success(I18n.t('common.deleted'));
        loadList();
      };
    }
    sheet.querySelector('#btn-save-svc').onclick = async () => {
      const name = sheet.querySelector('#in-name').value.trim();
      const fName = sheet.querySelector('#f-name');
      fName.classList.toggle('invalid', !name);
      if (!name) return;
      const data = {
        name,
        price: parseFloat(sheet.querySelector('#in-price').value) || 0,
        enabled: sheet.querySelector('#in-enabled').checked
      };
      if (isEdit) await ServiceCatalog.update(existing.id, data);
      else await ServiceCatalog.create(data);
      Toast.success(I18n.t('common.saved'));
      Modal.close();
      loadList();
    };
  }

  return { render };
})();
