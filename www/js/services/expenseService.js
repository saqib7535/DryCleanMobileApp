/* ============================================================
   ExpenseService — CRUD + summary queries for shop expenses
   (rent, utilities, salaries, supplies, etc).
   ============================================================ */

const ExpenseService = (function () {
  const CATEGORIES_KEY = 'expense_categories';

  async function listCategories() {
    const raw = await SettingsService.get(CATEGORIES_KEY, null);
    if (!raw) return DEFAULT_EXPENSE_CATEGORIES.slice();
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_EXPENSE_CATEGORIES.slice();
    } catch (e) {
      return DEFAULT_EXPENSE_CATEGORIES.slice();
    }
  }

  async function addCategory(name) {
    name = String(name || '').trim();
    if (!name) return listCategories();
    const cats = await listCategories();
    if (!cats.some((c) => c.toLowerCase() === name.toLowerCase())) cats.push(name);
    await SettingsService.set(CATEGORIES_KEY, JSON.stringify(cats));
    return cats;
  }

  async function removeCategory(name) {
    const cats = await listCategories();
    const next = cats.filter((c) => c !== name);
    await SettingsService.set(CATEGORIES_KEY, JSON.stringify(next.length ? next : DEFAULT_EXPENSE_CATEGORIES.slice()));
    return next;
  }

  async function renameCategory(oldName, newName) {
    newName = String(newName || '').trim();
    if (!newName) return listCategories();
    const cats = await listCategories();
    const next = cats.map((c) => (c === oldName ? newName : c));
    await SettingsService.set(CATEGORIES_KEY, JSON.stringify(next));
    // Keep existing expense rows consistent with the renamed category.
    await DB.run('UPDATE expenses SET category = ? WHERE category = ?', [newName, oldName]);
    return next;
  }

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

  return {
    list, getById, create, update, remove, totalForMonth, totalInRange,
    listCategories, addCategory, removeCategory, renameCategory,
    CATEGORIES: DEFAULT_EXPENSE_CATEGORIES
  };
})();
