/* ============================================================
   ReportService — generates the dataset for each report type.
   Every report returns { title, columns:[{key,label}], rows:[...],
   totals:[{label,value}] } so the Reports screen and the PDF/print
   exporters can stay completely generic.
   ============================================================ */

const ReportService = (function () {
  function sum(rows, key) { return rows.reduce((s, r) => s + Number(r[key] || 0), 0); }

  async function ordersInRange(fromDate, toDate, extraWhere, extraParams) {
    const clauses = ['o.order_date >= ?', 'o.order_date <= ?'];
    const params = [fromDate, toDate];
    if (extraWhere) { clauses.push(extraWhere); params.push(...(extraParams || [])); }
    return DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE ${clauses.join(' AND ')} ORDER BY o.order_date, o.id`,
      params
    );
  }

  function orderRows(rows) {
    return rows.map((o) => ({
      tracking_no: o.tracking_no, customer_name: o.customer_name, order_date: o.order_date,
      status: o.status, grand_total: o.grand_total, advance_paid: o.advance_paid, remaining_balance: o.remaining_balance
    }));
  }

  const ORDER_COLUMNS = [
    { key: 'tracking_no', label: 'Tracking #' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'order_date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'grand_total', label: 'Total', money: true },
    { key: 'advance_paid', label: 'Advance', money: true },
    { key: 'remaining_balance', label: 'Remaining', money: true }
  ];

  function totalsFor(rows) {
    return [
      { label: 'Orders', value: rows.length },
      { label: 'Total Revenue', value: sum(rows, 'grand_total'), money: true },
      { label: 'Advance Received', value: sum(rows, 'advance_paid'), money: true },
      { label: 'Remaining Balance', value: sum(rows, 'remaining_balance'), money: true }
    ];
  }

  async function daily(dateIso) {
    const rows = await ordersInRange(dateIso, dateIso);
    return { title: 'Daily Report — ' + dateIso, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: totalsFor(rows) };
  }

  async function weekly(endDateIso) {
    const end = new Date(endDateIso);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    const startIso = start.toISOString().slice(0, 10);
    const rows = await ordersInRange(startIso, endDateIso);
    return { title: `Weekly Report — ${startIso} to ${endDateIso}`, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: totalsFor(rows) };
  }

  async function monthly(yearMonth) {
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE strftime('%Y-%m', o.order_date) = ? ORDER BY o.order_date, o.id`,
      [yearMonth]
    );
    return { title: 'Monthly Report — ' + yearMonth, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: totalsFor(rows) };
  }

  async function yearly(year) {
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE strftime('%Y', o.order_date) = ? ORDER BY o.order_date, o.id`,
      [String(year)]
    );
    return { title: 'Yearly Report — ' + year, columns: ORDER_COLUMNS, rows: orderRows(rows), totals: totalsFor(rows) };
  }

  async function customerReport() {
    const rows = await DB.query(`
      SELECT c.name AS customer_name, c.phone,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(o.grand_total),0) AS total_billed,
        COALESCE(SUM(o.advance_paid),0) AS total_advance,
        COALESCE(SUM(o.remaining_balance),0) AS total_remaining
      FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id ORDER BY total_billed DESC
    `);
    return {
      title: 'Customer Report',
      columns: [
        { key: 'customer_name', label: 'Customer' }, { key: 'phone', label: 'Phone' },
        { key: 'total_orders', label: 'Orders' }, { key: 'total_billed', label: 'Billed', money: true },
        { key: 'total_advance', label: 'Advance', money: true }, { key: 'total_remaining', label: 'Remaining', money: true }
      ],
      rows,
      totals: [
        { label: 'Customers', value: rows.length },
        { label: 'Total Billed', value: sum(rows, 'total_billed'), money: true },
        { label: 'Total Remaining', value: sum(rows, 'total_remaining'), money: true }
      ]
    };
  }

  async function revenueReport(fromDate, toDate) {
    const rows = await DB.query(`
      SELECT order_date, COUNT(*) AS orders, COALESCE(SUM(grand_total),0) AS revenue, COALESCE(SUM(advance_paid),0) AS advance
      FROM orders WHERE order_date BETWEEN ? AND ? AND status != 'Cancelled'
      GROUP BY order_date ORDER BY order_date
    `, [fromDate, toDate]);
    return {
      title: `Revenue Report — ${fromDate} to ${toDate}`,
      columns: [
        { key: 'order_date', label: 'Date' }, { key: 'orders', label: 'Orders' },
        { key: 'revenue', label: 'Revenue', money: true }, { key: 'advance', label: 'Advance', money: true }
      ],
      rows,
      totals: [
        { label: 'Total Revenue', value: sum(rows, 'revenue'), money: true },
        { label: 'Total Advance', value: sum(rows, 'advance'), money: true }
      ]
    };
  }

  async function pendingBalance() {
    const rows = await DB.query(`
      SELECT o.tracking_no, c.name AS customer_name, o.order_date, o.status, o.grand_total, o.remaining_balance
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.remaining_balance > 0 AND o.status != 'Cancelled'
      ORDER BY o.remaining_balance DESC
    `);
    return {
      title: 'Pending Balance Report',
      columns: [
        { key: 'tracking_no', label: 'Tracking #' }, { key: 'customer_name', label: 'Customer' },
        { key: 'order_date', label: 'Date' }, { key: 'status', label: 'Status' },
        { key: 'grand_total', label: 'Total', money: true }, { key: 'remaining_balance', label: 'Remaining', money: true }
      ],
      rows,
      totals: [
        { label: 'Orders', value: rows.length },
        { label: 'Total Remaining', value: sum(rows, 'remaining_balance'), money: true }
      ]
    };
  }

  async function deliveredReport(fromDate, toDate) {
    const rows = await DB.query(`
      SELECT o.tracking_no, c.name AS customer_name, o.delivered_at, o.delivered_by, o.grand_total
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.status = 'Delivered' AND date(o.delivered_at) BETWEEN ? AND ?
      ORDER BY o.delivered_at DESC
    `, [fromDate, toDate]);
    return {
      title: `Delivered Report — ${fromDate} to ${toDate}`,
      columns: [
        { key: 'tracking_no', label: 'Tracking #' }, { key: 'customer_name', label: 'Customer' },
        { key: 'delivered_at', label: 'Delivered At' }, { key: 'delivered_by', label: 'Staff' },
        { key: 'grand_total', label: 'Total', money: true }
      ],
      rows,
      totals: [
        { label: 'Delivered Orders', value: rows.length },
        { label: 'Total Value', value: sum(rows, 'grand_total'), money: true }
      ]
    };
  }

  async function categoryReport() {
    const rows = await DB.query(`
      SELECT COALESCE(oi.category_name,'Others') AS category_name, COUNT(*) AS items, SUM(oi.quantity) AS qty, COALESCE(SUM(oi.subtotal),0) AS revenue
      FROM order_items oi GROUP BY category_name ORDER BY revenue DESC
    `);
    return {
      title: 'Category Report',
      columns: [
        { key: 'category_name', label: 'Category' }, { key: 'items', label: 'Line Items' },
        { key: 'qty', label: 'Qty' }, { key: 'revenue', label: 'Revenue', money: true }
      ],
      rows,
      totals: [{ label: 'Total Revenue', value: sum(rows, 'revenue'), money: true }]
    };
  }

  async function serviceReport() {
    const rows = await DB.query(`
      SELECT COALESCE(oi.service_name,'Others') AS service_name, COUNT(*) AS items, SUM(oi.quantity) AS qty, COALESCE(SUM(oi.subtotal),0) AS revenue
      FROM order_items oi GROUP BY service_name ORDER BY revenue DESC
    `);
    return {
      title: 'Service Report',
      columns: [
        { key: 'service_name', label: 'Service' }, { key: 'items', label: 'Line Items' },
        { key: 'qty', label: 'Qty' }, { key: 'revenue', label: 'Revenue', money: true }
      ],
      rows,
      totals: [{ label: 'Total Revenue', value: sum(rows, 'revenue'), money: true }]
    };
  }

  async function expenseReport(fromDate, toDate) {
    const rows = await DB.query(
      'SELECT expense_date, category, description, amount, payment_method FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date DESC',
      [fromDate, toDate]
    );
    return {
      title: `Expense Report — ${fromDate} to ${toDate}`,
      columns: [
        { key: 'expense_date', label: 'Date' }, { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description' }, { key: 'payment_method', label: 'Method' },
        { key: 'amount', label: 'Amount', money: true }
      ],
      rows,
      totals: [
        { label: 'Entries', value: rows.length },
        { label: 'Total Expenses', value: sum(rows, 'amount'), money: true }
      ]
    };
  }

  async function invoiceByCustomer(customerId, fromDate, toDate) {
    const clauses = ['o.customer_id = ?'];
    const params = [customerId];
    if (fromDate) { clauses.push('o.order_date >= ?'); params.push(fromDate); }
    if (toDate) { clauses.push('o.order_date <= ?'); params.push(toDate); }
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE ${clauses.join(' AND ')} ORDER BY o.order_date DESC, o.id DESC`,
      params
    );
    const customerRows = await DB.query('SELECT name FROM customers WHERE id = ?', [customerId]);
    const customerName = customerRows.length ? customerRows[0].name : '';
    return {
      title: `Invoices — ${customerName}`,
      columns: ORDER_COLUMNS,
      rows: orderRows(rows),
      totals: totalsFor(rows)
    };
  }

  async function invoiceByDate(fromDate, toDate, customerId) {
    const clauses = ['o.order_date >= ?', 'o.order_date <= ?'];
    const params = [fromDate, toDate];
    if (customerId) { clauses.push('o.customer_id = ?'); params.push(customerId); }
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE ${clauses.join(' AND ')} ORDER BY o.order_date DESC, o.id DESC`,
      params
    );
    return {
      title: `Invoices — ${fromDate} to ${toDate}`,
      columns: ORDER_COLUMNS,
      rows: orderRows(rows),
      totals: totalsFor(rows)
    };
  }

  async function orderStatusReport(status) {
    const rows = await DB.query(
      `SELECT o.*, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status = ? ORDER BY o.order_date DESC, o.id DESC`,
      [status]
    );
    return {
      title: `Orders — ${status}`,
      columns: ORDER_COLUMNS,
      rows: orderRows(rows),
      totals: totalsFor(rows)
    };
  }

  async function generate(type, params) {
    params = params || {};
    switch (type) {
      case 'daily': return daily(params.date || Format.todayIso());
      case 'weekly': return weekly(params.date || Format.todayIso());
      case 'monthly': return monthly(params.yearMonth || Format.todayIso().slice(0, 7));
      case 'yearly': return yearly(params.year || new Date().getFullYear());
      case 'customer': return customerReport();
      case 'revenue': return revenueReport(params.from || Format.todayIso(), params.to || Format.todayIso());
      case 'pending': return pendingBalance();
      case 'delivered': return deliveredReport(params.from || '1970-01-01', params.to || Format.todayIso());
      case 'category': return categoryReport();
      case 'service': return serviceReport();
      case 'expense': return expenseReport(params.from || Format.todayIso().slice(0, 8) + '01', params.to || Format.todayIso());
      case 'invoiceCustomer': return invoiceByCustomer(params.customerId, params.from, params.to);
      case 'invoiceDate': return invoiceByDate(params.from || Format.todayIso(), params.to || Format.todayIso(), params.customerId);
      case 'orderStatus': return orderStatusReport(params.status || 'Pending');
      default: return { title: 'Report', columns: [], rows: [], totals: [] };
    }
  }

  return { generate };
})();
