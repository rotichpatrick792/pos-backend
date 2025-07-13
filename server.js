const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// SQLite setup
const db = new sqlite3.Database('./pos.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite database.');
});

// Create Tables
const initDB = () => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    quantity INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    quantity_sold INTEGER,
    total_price INTEGER,
    date_time TEXT,
    payment_mode TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
};
initDB();

// Seed admin
db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
  if (err) console.error(err.message);
  if (!row) {
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', '1234']);
    console.log('Default admin user created (admin/1234)');
  }
});

// Routes

// Root
app.get('/', (req, res) => {
  res.send('✅ POS API is running');
});

// Get products
app.get('/api/products', (req, res) => {
  const search = req.query.search;
  const sql = search
    ? 'SELECT * FROM products WHERE name LIKE ?'
    : 'SELECT * FROM products';
  const params = search ? [`%${search}%`] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add product
app.post('/api/products', (req, res) => {
  const { name, price, quantity } = req.body;
  db.run('INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
    [name, price, quantity],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// 🆕 Update product
app.put('/api/products/:id', (req, res) => {
  const { name, price, quantity } = req.body;
  const id = req.params.id;

  db.run('UPDATE products SET name = ?, price = ?, quantity = ? WHERE id = ?',
    [name, price, quantity, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});

// 🆕 Delete product
app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ✅ Low stock products
app.get('/api/low-stock', (req, res) => {
  db.all('SELECT * FROM products WHERE quantity <= 5', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ Checkout (with payment mode)
app.post('/api/checkout', (req, res) => {
  const cart = req.body.cart;
  const payment_mode = req.body.payment_mode || 'cash';
  const now = new Date().toISOString();

  db.serialize(() => {
    const stmt = db.prepare(`INSERT INTO sales (product_id, quantity_sold, total_price, date_time, payment_mode)
                              VALUES (?, ?, ?, ?, ?)`);

    cart.forEach(item => {
      db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.id]);
      stmt.run(item.id, item.quantity, item.price * item.quantity, now, payment_mode);
    });

    stmt.finalize();
    res.json({ message: 'Checkout complete' });
  });
});

// ✅ All sales
app.get('/api/sales', (req, res) => {
  db.all('SELECT * FROM sales', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ Sales summary
app.get('/api/sales-summary', (req, res) => {
  db.get(`SELECT 
      COUNT(*) AS total_transactions,
      SUM(total_price) AS total_revenue 
    FROM sales`, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// ✅ PDF Receipt (basic endpoint that returns PDF file for download)
app.get('/api/sales/receipt/:id', (req, res) => {
  const saleId = req.params.id;
  db.get('SELECT * FROM sales WHERE id = ?', [saleId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Sale not found' });

    const doc = new PDFDocument();
    const filename = `receipt_${saleId}.pdf`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);
    doc.fontSize(20).text('Receipt', { align: 'center' });
    doc.moveDown();
    doc.text(`Sale ID: ${row.id}`);
    doc.text(`Product ID: ${row.product_id}`);
    doc.text(`Quantity: ${row.quantity_sold}`);
    doc.text(`Total: Ksh ${row.total_price}`);
    doc.text(`Date: ${new Date(row.date_time).toLocaleString()}`);
    doc.text(`Payment Mode: ${row.payment_mode}`);
    doc.end();
  });
});

// ✅ Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ success: true, user: { id: row.id, username: row.username } });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
