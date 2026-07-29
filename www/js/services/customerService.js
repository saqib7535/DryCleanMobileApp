/* ============================================================
   CustomerService — CRUD + search + history rollups.
   ============================================================ */

const CustomerService = (function () {
  async function list(searchTerm) {
    if (searchTerm && searchTerm.trim()) {
      const term = '%' + searchTerm.trim() + '%';
      return DB.query(
        'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR whatsapp LIKE ? ORDER BY name COLLATE NOCASE',
        [term, term, term]
      );
    }
    return DB.query('SELECT * FROM customers ORDER BY name COLLATE NOCASE');
  }

  async function getById(id) {
    const rows = await DB.query('SELECT * FROM customers WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO customers (name, phone, whatsapp, gender, address, notes, photo_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.phone || '', data.whatsapp || '', data.gender || '', data.address || '', data.notes || '', data.photo_path || null]
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE customers SET name=?, phone=?, whatsapp=?, gender=?, address=?, notes=?, photo_path=?, updated_at=datetime('now')
       WHERE id=?`,
      [data.name, data.phone || '', data.whatsapp || '', data.gender || '', data.address || '', data.notes || '', data.photo_path || null, id]
    );
  }

  async function remove(id) {
    await DB.run('DELETE FROM customers WHERE id = ?', [id]);
  }

  async function historyStats(customerId) {
    const rows = await DB.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(grand_total),0) AS total_billed,
              COALESCE(SUM(advance_paid),0) AS total_advance,
              COALESCE(SUM(remaining_balance),0) AS total_remaining
       FROM orders WHERE customer_id = ?`,
      [customerId]
    );
    const paymentsRows = await DB.query(
      `SELECT COALESCE(SUM(p.amount),0) AS total_paid
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE o.customer_id = ?`,
      [customerId]
    );
    const row = rows[0] || {};
    return {
      totalOrders: row.total_orders || 0,
      totalBilled: row.total_billed || 0,
      totalAdvance: row.total_advance || 0,
      totalRemaining: row.total_remaining || 0,
      totalPaid: (row.total_advance || 0) + (paymentsRows[0].total_paid || 0)
    };
  }

  async function orderHistory(customerId) {
    return DB.query(
      `SELECT id, tracking_no, order_date, return_date, status, grand_total, remaining_balance
       FROM orders WHERE customer_id = ? ORDER BY order_date DESC, id DESC`,
      [customerId]
    );
  }

  async function count() {
    const rows = await DB.query('SELECT COUNT(*) AS c FROM customers');
    return rows[0].c;
  }

  return { list, getById, create, update, remove, historyStats, orderHistory, count };
})();
