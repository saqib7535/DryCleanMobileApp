/* ============================================================
   ExpenseService — CRUD + summary queries for shop expenses
   (rent, utilities, salaries, supplies, etc).
   ============================================================ */

const ExpenseService = (function () {
  async function list(fromDate, toDate) {
    if (fromDate && toDate) {
      return DB.query(
        'SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date DESC, id DESC',
        [fromDate, toDate]
      );
    }
    return DB.query('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC LIMIT 300');
  }

  async function getById(id) {
    const rows = await DB.query('SELECT * FROM expenses WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO expenses (expense_date, category, description, amount, payment_method) VALUES (?, ?, ?, ?, ?)`,
      [data.expense_date, data.category || 'Other', data.description || '', data.amount || 0, data.payment_method || 'Cash']
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE expenses SET expense_date=?, category=?, description=?, amount=?, payment_method=? WHERE id=?`,
      [data.expense_date, data.category || 'Other', data.description || '', data.amount || 0, data.payment_method || 'Cash', id]
    );
  }

  async function remove(id) {
    await DB.run('DELETE FROM expenses WHERE id = ?', [id]);
  }

  async function totalForMonth(yearMonth) {
    const ym = yearMonth || Format.todayIso().slice(0, 7);
    const rows = await DB.query(
      `SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE strftime('%Y-%m', expense_date) = ?`,
      [ym]
    );
    return rows[0].s;
  }

  async function totalInRange(fromDate, toDate) {
    const rows = await DB.query(
      'SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE expense_date BETWEEN ? AND ?',
      [fromDate, toDate]
    );
    return rows[0].s;
  }

  return { list, getById, create, update, remove, totalForMonth, totalInRange, CATEGORIES: DEFAULT_EXPENSE_CATEGORIES };
})();
