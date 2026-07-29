/* ============================================================
   OrderService — tracking-number generation, order CRUD, status
   pipeline, search/filtering.
   ============================================================ */

const OrderService = (function () {
  const STATUS_FLOW = ['Pending', 'Processing', 'Washing', 'Ironing', 'Ready', 'Delivered'];
  const ALL_STATUSES = STATUS_FLOW.concat(['Cancelled']);

  function currentYear() { return new Date().getFullYear(); }

  async function peekNextTrackingNo() {
    const year = currentYear();
    const rows = await DB.query('SELECT value FROM settings WHERE key = ?', ['tracking_seq_' + year]);
    const next = (rows.length ? parseInt(rows[0].value, 10) : 0) + 1;
    return 'DC-' + year + '-' + String(next).padStart(6, '0');
  }

  async function reserveNextTrackingNo() {
    const year = currentYear();
    const key = 'tracking_seq_' + year;
    const rows = await DB.query('SELECT value FROM settings WHERE key = ?', [key]);
    const next = (rows.length ? parseInt(rows[0].value, 10) : 0) + 1;
    if (rows.length) await DB.run('UPDATE settings SET value = ? WHERE key = ?', [String(next), key]);
    else await DB.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(next)]);
    return 'DC-' + year + '-' + String(next).padStart(6, '0');
  }

  function computeTotals(items, discount, extraCharges, deliveryCharges, advancePaid) {
    const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.rate)), 0);
    const grandTotal = Math.max(0, subtotal - Number(discount || 0) + Number(extraCharges || 0) + Number(deliveryCharges || 0));
    const remaining = Math.max(0, grandTotal - Number(advancePaid || 0));
    return { subtotal, grandTotal, remaining };
  }

  async function createOrder(order, items) {
    const totals = computeTotals(items, order.discount, order.extra_charges, order.delivery_charges, order.advance_paid);
    const trackingNo = await reserveNextTrackingNo();

    const res = await DB.run(
      `INSERT INTO orders (
        tracking_no, customer_id, order_date, return_date, urgent, status,
        subtotal, discount, extra_charges, delivery_charges, grand_total,
        advance_paid, remaining_balance, payment_method, notes
      ) VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trackingNo, order.customer_id, order.order_date, order.return_date || null, order.urgent ? 1 : 0,
        totals.subtotal, order.discount || 0, order.extra_charges || 0, order.delivery_charges || 0, totals.grandTotal,
        order.advance_paid || 0, totals.remaining, order.payment_method || 'Cash', order.notes || ''
      ]
    );
    const orderId = res.lastId;

    for (const it of items) {
      await DB.run(
        `INSERT INTO order_items (order_id, category_id, service_id, category_name, service_name, quantity, rate, subtotal, photo_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, it.category_id || null, it.service_id || null, it.category_name || '', it.service_name || '', it.quantity, it.rate, Number(it.quantity) * Number(it.rate), it.photo_data || null]
      );
    }

    await DB.run(`INSERT INTO order_status_history (order_id, status) VALUES (?, 'Pending')`, [orderId]);

    return { orderId, trackingNo, ...totals };
  }

  async function updateOrder(orderId, order, items) {
    const totals = computeTotals(items, order.discount, order.extra_charges, order.delivery_charges, order.advance_paid);

    await DB.run(
      `UPDATE orders SET
        customer_id = ?, order_date = ?, return_date = ?, urgent = ?,
        subtotal = ?, discount = ?, extra_charges = ?, delivery_charges = ?, grand_total = ?,
        advance_paid = ?, remaining_balance = ?, payment_method = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        order.customer_id, order.order_date, order.return_date || null, order.urgent ? 1 : 0,
        totals.subtotal, order.discount || 0, order.extra_charges || 0, order.delivery_charges || 0, totals.grandTotal,
        order.advance_paid || 0, totals.remaining, order.payment_method || 'Cash', order.notes || '',
        orderId
      ]
    );

    await DB.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    for (const it of items) {
      await DB.run(
        `INSERT INTO order_items (order_id, category_id, service_id, category_name, service_name, quantity, rate, subtotal, photo_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, it.category_id || null, it.service_id || null, it.category_name || '', it.service_name || '', it.quantity, it.rate, Number(it.quantity) * Number(it.rate), it.photo_data || it.photo_path || null]
      );
    }

    return { orderId, ...totals };
  }

  async function deleteOrder(orderId) {
    await DB.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await DB.run('DELETE FROM payments WHERE order_id = ?', [orderId]);
    await DB.run('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await DB.run('DELETE FROM orders WHERE id = ?', [orderId]);
  }

  async function getById(orderId) {
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp, c.gender AS customer_gender
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
      [orderId]
    );
    if (!rows.length) return null;
    const items = await DB.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    const payments = await DB.query('SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at', [orderId]);
    const history = await DB.query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at', [orderId]);
    return { ...rows[0], items, payments, history };
  }

  async function getByTrackingNo(trackingNo) {
    const rows = await DB.query('SELECT id FROM orders WHERE tracking_no = ?', [trackingNo]);
    if (!rows.length) return null;
    return getById(rows[0].id);
  }

  async function updateStatus(orderId, status) {
    await DB.run(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, orderId]);
    await DB.run('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)', [orderId, status]);
  }

  async function recordDelivery(orderId, data) {
    if (data.paymentAmount && data.paymentAmount > 0) {
      await DB.run(
        `INSERT INTO payments (order_id, amount, method, note) VALUES (?, ?, ?, ?)`,
        [orderId, data.paymentAmount, data.paymentMethod || 'Cash', data.note || 'Final payment on delivery']
      );
    }
    const rows = await DB.query('SELECT remaining_balance FROM orders WHERE id = ?', [orderId]);
    const newRemaining = Math.max(0, (rows[0].remaining_balance || 0) - Number(data.paymentAmount || 0));
    await DB.run(
      `UPDATE orders SET status = 'Delivered', remaining_balance = ?, delivered_at = ?, delivered_by = ?, signature_data = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [newRemaining, data.deliveredAt || new Date().toISOString(), data.deliveredBy || '', data.signatureData || null, orderId]
    );
    await DB.run('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)', [orderId, 'Delivered']);
  }

  async function recordPayment(orderId, data) {
    const amount = Number(data.amount || 0);
    if (amount <= 0) return;
    await DB.run(
      `INSERT INTO payments (order_id, amount, method, note) VALUES (?, ?, ?, ?)`,
      [orderId, amount, data.method || 'Cash', data.note || '']
    );
    const rows = await DB.query('SELECT remaining_balance FROM orders WHERE id = ?', [orderId]);
    const newRemaining = Math.max(0, (rows[0].remaining_balance || 0) - amount);
    await DB.run(
      `UPDATE orders SET remaining_balance = ?, updated_at = datetime('now') WHERE id = ?`,
      [newRemaining, orderId]
    );
  }

  async function search(filters) {
    filters = filters || {};
    const clauses = [];
    const params = [];

    if (filters.trackingNo) { clauses.push('o.tracking_no LIKE ?'); params.push('%' + filters.trackingNo + '%'); }
    if (filters.customerName) { clauses.push('c.name LIKE ?'); params.push('%' + filters.customerName + '%'); }
    if (filters.phone) { clauses.push('(c.phone LIKE ? OR c.whatsapp LIKE ?)'); params.push('%' + filters.phone + '%', '%' + filters.phone + '%'); }
    if (filters.status) { clauses.push('o.status = ?'); params.push(filters.status); }
    if (filters.returnDate) { clauses.push('o.return_date = ?'); params.push(filters.returnDate); }
    if (filters.category) {
      clauses.push('o.id IN (SELECT order_id FROM order_items WHERE category_name = ?)');
      params.push(filters.category);
    }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ${where}
       ORDER BY o.order_date DESC, o.id DESC
       LIMIT 300`,
      params
    );
    return rows;
  }

  return {
    STATUS_FLOW, ALL_STATUSES,
    peekNextTrackingNo, reserveNextTrackingNo, computeTotals,
    createOrder, updateOrder, deleteOrder, getById, getByTrackingNo, updateStatus, recordDelivery, recordPayment, search
  };
})();
