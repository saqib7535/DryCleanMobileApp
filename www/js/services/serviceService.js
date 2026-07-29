/* ============================================================
   ServiceCatalog — CRUD for wash/iron/dry-clean service types.
   Named ServiceCatalog (not "ServiceService") to stay readable.
   ============================================================ */

const ServiceCatalog = (function () {
  async function list(includeDisabled) {
    if (includeDisabled) return DB.query('SELECT * FROM services ORDER BY sort_order, name COLLATE NOCASE');
    return DB.query('SELECT * FROM services WHERE enabled = 1 ORDER BY sort_order, name COLLATE NOCASE');
  }

  async function getById(id) {
    const rows = await DB.query('SELECT * FROM services WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async function create(data) {
    const res = await DB.run(
      `INSERT INTO services (name, price, enabled, sort_order) VALUES (?, ?, ?, ?)`,
      [data.name, data.price || 0, data.enabled ? 1 : 0, data.sort_order || 0]
    );
    return res.lastId;
  }

  async function update(id, data) {
    await DB.run('UPDATE services SET name=?, price=?, enabled=? WHERE id=?', [data.name, data.price || 0, data.enabled ? 1 : 0, id]);
  }

  async function toggleEnabled(id, enabled) {
    await DB.run('UPDATE services SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  }

  async function remove(id) {
    await DB.run('DELETE FROM services WHERE id = ?', [id]);
  }

  return { list, getById, create, update, toggleEnabled, remove };
})();
