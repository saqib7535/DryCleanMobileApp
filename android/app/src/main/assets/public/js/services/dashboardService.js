/* ============================================================
   DashboardService — aggregate stats + chart datasets.
   Orders don't exist until Phase 3, so every query is written to
   degrade gracefully (COALESCE/0) on an empty table.
   ============================================================ */

const DashboardService = (function () {
  async function stats() {
    const [
      customers, active, ready, delivered, pending,
      revenue, advance, remaining, todayOrders, todayDeliveries, monthRevenue
    ] = await Promise.all([
      DB.query('SELECT COUNT(*) AS c FROM customers'),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('Delivered','Cancelled')`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE status = 'Ready'`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE status = 'Delivered'`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE status = 'Pending'`),
      DB.query(`SELECT COALESCE(SUM(grand_total),0) AS s FROM orders WHERE status != 'Cancelled'`),
      DB.query(`SELECT COALESCE(SUM(advance_paid),0) AS s FROM orders WHERE status != 'Cancelled'`),
      DB.query(`SELECT COALESCE(SUM(remaining_balance),0) AS s FROM orders WHERE status != 'Cancelled'`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE date(order_date) = date('now')`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE date(delivered_at) = date('now')`),
      DB.query(`SELECT COALESCE(SUM(grand_total),0) AS s FROM orders WHERE status != 'Cancelled' AND strftime('%Y-%m', order_date) = strftime('%Y-%m','now')`)
    ]);

    return {
      totalCustomers: customers[0].c,
      activeOrders: active[0].c,
      readyOrders: ready[0].c,
      deliveredOrders: delivered[0].c,
      pendingOrders: pending[0].c,
      totalRevenue: revenue[0].s,
      advanceReceived: advance[0].s,
      remainingBalance: remaining[0].s,
      todaysOrders: todayOrders[0].c,
      todaysDeliveries: todayDeliveries[0].c,
      monthRevenue: monthRevenue[0].s
    };
  }

  async function categoryWiseOrders() {
    const rows = await DB.query(`
      SELECT COALESCE(oi.category_name, c.name, 'Others') AS name, COUNT(*) AS cnt
      FROM order_items oi
      LEFT JOIN categories c ON c.id = oi.category_id
      GROUP BY name
      ORDER BY cnt DESC
      LIMIT 8
    `);
    return rows;
  }

  async function monthlyRevenue(months) {
    months = months || 6;
    const rows = await DB.query(`
      SELECT strftime('%Y-%m', order_date) AS ym, COALESCE(SUM(grand_total),0) AS total
      FROM orders
      WHERE status != 'Cancelled' AND order_date >= date('now', '-${months} months')
      GROUP BY ym
      ORDER BY ym ASC
    `);
    return rows;
  }

  async function pendingVsDelivered() {
    const rows = await DB.query(`
      SELECT
        SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status NOT IN ('Delivered','Cancelled') THEN 1 ELSE 0 END) AS pending
      FROM orders
    `);
    return { delivered: rows[0].delivered || 0, pending: rows[0].pending || 0 };
  }

  async function dueAlerts() {
    const [overdue, unpaidDelivered] = await Promise.all([
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE return_date IS NOT NULL AND return_date < date('now') AND status NOT IN ('Delivered','Cancelled')`),
      DB.query(`SELECT COUNT(*) AS c FROM orders WHERE status = 'Delivered' AND remaining_balance > 0`)
    ]);
    return { overdue: overdue[0].c, unpaidDelivered: unpaidDelivered[0].c };
  }

  async function recentOrders(limit) {
    return DB.query(
      `SELECT o.id, o.tracking_no, o.status, o.grand_total, o.order_date, c.name AS customer_name
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.id DESC LIMIT ?`,
      [limit || 5]
    );
  }

  return { stats, categoryWiseOrders, monthlyRevenue, pendingVsDelivered, dueAlerts, recentOrders };
})();
