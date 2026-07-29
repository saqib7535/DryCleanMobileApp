/* ============================================================
   DeliveryModal — receive-remaining-payment + signature capture
   form shown when handing items back to the customer. Confirming
   marks the order Delivered and moves it into history.
   ============================================================ */

const DeliveryModal = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function nowLocalDateTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setupSignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text') || '#0f172a';
    let drawing = false;
    let hasDrawn = false;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener('pointerdown', (e) => {
      drawing = true; hasDrawn = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => {
      canvas.addEventListener(evt, () => { drawing = false; });
    });

    return {
      clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; },
      isEmpty: () => !hasDrawn,
      dataUrl: () => canvas.toDataURL('image/png')
    };
  }

  function open(order, onDone) {
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="order.confirmDelivery">Confirm Delivery</h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="flex-between"><span class="text-muted">${escapeHtml(order.tracking_no)}</span><b>${escapeHtml(order.customer_name)}</b></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.grandTotal"></span><b>${Format.money(order.grand_total)}</b></div>
        <div class="flex-between mt-8"><span class="text-muted" data-i18n="order.advancePaid"></span><b>${Format.money(order.advance_paid)}</b></div>
        <div class="flex-between mt-8" style="font-weight:800"><span class="text-danger" data-i18n="dash.remainingBalance"></span><b class="text-danger">${Format.money(order.remaining_balance)}</b></div>
      </div>

      <div class="field-row">
        <div class="field">
          <label data-i18n="delivery.receivePayment">Receive Payment</label>
          <input type="number" min="0" max="${order.remaining_balance}" id="in-pay-amount" value="${order.remaining_balance}" />
        </div>
        <div class="field">
          <label data-i18n="order.paymentMethod"></label>
          <select id="in-pay-method">
            <option value="Cash" data-i18n="payment.Cash"></option>
            <option value="JazzCash" data-i18n="payment.JazzCash"></option>
            <option value="EasyPaisa" data-i18n="payment.EasyPaisa"></option>
            <option value="Bank" data-i18n="payment.Bank"></option>
            <option value="Card" data-i18n="payment.Card"></option>
          </select>
        </div>
      </div>
      <div class="field">
        <label data-i18n="delivery.deliveredAt">Delivered Date &amp; Time</label>
        <input type="datetime-local" id="in-delivered-at" value="${nowLocalDateTime()}" />
      </div>
      <div class="field">
        <label data-i18n="delivery.staffName">Staff Name</label>
        <input id="in-staff-name" />
      </div>
      <div class="field">
        <label data-i18n="delivery.signature">Customer Signature</label>
        <div class="sig-pad-wrap">
          <canvas id="sig-canvas"></canvas>
          <div class="sig-pad-placeholder" id="sig-placeholder" data-i18n="delivery.signHere">Sign here</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm mt-8" id="btn-clear-sig" data-i18n="delivery.clearSignature">Clear</button>
      </div>
      <button class="btn btn-primary btn-block mt-8" id="btn-confirm-delivery-submit" data-i18n="delivery.confirm">Confirm Delivery</button>
    `, { center: true });
    I18n.apply(sheet);

    const canvas = sheet.querySelector('#sig-canvas');
    const placeholder = sheet.querySelector('#sig-placeholder');
    const pad = setupSignaturePad(canvas);
    canvas.addEventListener('pointerdown', () => { placeholder.style.display = 'none'; });

    sheet.querySelector('#btn-clear-sig').onclick = () => { pad.clear(); placeholder.style.display = 'flex'; };
    sheet.querySelector('#m-close').onclick = () => Modal.close();

    sheet.querySelector('#btn-confirm-delivery-submit').onclick = async () => {
      const amount = parseFloat(sheet.querySelector('#in-pay-amount').value) || 0;
      const method = sheet.querySelector('#in-pay-method').value;
      const deliveredAtLocal = sheet.querySelector('#in-delivered-at').value;
      const staffName = sheet.querySelector('#in-staff-name').value.trim();

      const btn = sheet.querySelector('#btn-confirm-delivery-submit');
      btn.disabled = true;

      await OrderService.recordDelivery(order.id, {
        paymentAmount: amount,
        paymentMethod: method,
        deliveredAt: deliveredAtLocal ? new Date(deliveredAtLocal).toISOString() : new Date().toISOString(),
        deliveredBy: staffName,
        signatureData: pad.isEmpty() ? null : pad.dataUrl()
      });

      Toast.success(I18n.t('delivery.delivered'));
      Modal.close();
      if (onDone) onDone();
    };
  }

  return { open };
})();
