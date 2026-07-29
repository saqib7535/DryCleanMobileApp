/* ============================================================
   PaymentModal — receive a partial or full payment against an
   order's remaining balance at any point (not tied to delivery).
   Just records a payment row and reduces remaining_balance.
   ============================================================ */

const PaymentModal = (function () {
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function open(order, onDone) {
    const sheet = Modal.open(`
      <div class="modal-header">
        <h3 data-i18n="order.receivePaymentBtn"></h3>
        <button class="icon-btn" id="m-close">${Icons.svg('close', 20)}</button>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="flex-between"><span class="text-muted">${escapeHtml(order.tracking_no)}</span><b>${escapeHtml(order.customer_name)}</b></div>
        <div class="flex-between mt-8" style="font-weight:800"><span class="text-danger" data-i18n="dash.remainingBalance"></span><b class="text-danger">${Format.money(order.remaining_balance)}</b></div>
      </div>

      <div class="field" id="f-amount">
        <label data-i18n="delivery.receivePayment"></label>
        <input type="number" min="0.01" max="${order.remaining_balance}" step="0.01" id="in-pay-amount" value="${order.remaining_balance}" />
        <div class="error-msg" data-i18n="order.invalidPaymentAmount"></div>
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
      <div class="field">
        <label data-i18n="common.notes"></label>
        <input id="in-pay-note" data-i18n-placeholder="common.optional" />
      </div>
      <button class="btn btn-success btn-block mt-8" id="btn-submit-payment" data-i18n="order.receivePaymentBtn"></button>
    `, { center: true });
    I18n.apply(sheet);

    sheet.querySelector('#m-close').onclick = () => Modal.close();
    sheet.querySelector('#btn-submit-payment').onclick = async () => {
      const amount = parseFloat(sheet.querySelector('#in-pay-amount').value);
      const fAmount = sheet.querySelector('#f-amount');
      const valid = amount > 0 && amount <= order.remaining_balance + 0.001;
      fAmount.classList.toggle('invalid', !valid);
      if (!valid) return;

      const method = sheet.querySelector('#in-pay-method').value;
      const note = sheet.querySelector('#in-pay-note').value.trim();

      const btn = sheet.querySelector('#btn-submit-payment');
      btn.disabled = true;
      await OrderService.recordPayment(order.id, { amount, method, note });
      Toast.success(I18n.t('order.paymentRecorded'));
      Modal.close();
      if (onDone) onDone();
    };
  }

  return { open };
})();
