/* ============================================================
   CategoryService — CRUD for the custom item-category system.
   ============================================================ */

const CategoryService = (function () {
  async function list(includeDisabled) {
    if (includeDisabled) return DB.query('SELECT * FROM categories ORDER BY sort_order, name COLLATE NOCASE');
    return DB.query('SELECT * FROM categories WHERE enabled = 1 ORDER BY sort_order, name COLLATE NOCASE');
  }

  async function getById(id) {
    const rows = await DB.query('SELECT * FROM categories WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO categories (name, icon, color, default_price, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.icon || 'others', data.color || '#2563eb', data.default_price || 0, data.enabled ? 1 : 0, data.sort_order || 0]
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run(
      `UPDATE categories SET name=?, icon=?, color=?, default_price=?, enabled=? WHERE id=?`,
      [data.name, data.icon || 'others', data.color || '#2563eb', data.default_price || 0, data.enabled ? 1 : 0, id]
    );
  }

  async function toggleEnabled(id, enabled) {
    await DB.run('UPDATE categories SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  }

  async function remove(id) {
    await DB.run('DELETE FROM categories WHERE id = ?', [id]);
  }

  return { list, getById, create, update, toggleEnabled, remove };
})();
