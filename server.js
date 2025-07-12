const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// SQLite DB setup
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
    date_time TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
};
initDB();

// Seed default user (admin/1234) if not exists
db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
  if (err) console.error(err.message);
  if (!row) {
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', ['admin', '1234']);
    console.log('Default admin user created (admin/1234)');
  }
});

// Routes

// Root route (for browser check)
app.get('/', (req, res) => {
  res.send('✅ POS API is running');
});

// Get all products
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add a new product
app.post('/api/products', (req, res) => {
  const { name, price, quantity } = req.body;
  db.run('INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
    [name, price, quantity],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// Checkout (record a sale)
app.post('/api/checkout', (req, res) => {
  const cart = req.body.cart;
  const now = new Date().toISOString();

  db.serialize(() => {
    const stmt = db.prepare(`INSERT INTO sales (product_id, quantity_sold, total_price, date_time)
                              VALUES (?, ?, ?, ?)`);

    cart.forEach(item => {
      db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.id]);
      stmt.run(item.id, item.quantity, item.price * item.quantity, now);
    });

    stmt.finalize();
    res.json({ message: 'Checkout complete' });
  });
});

// Get all sales
app.get('/api/sales', (req, res) => {
  db.all('SELECT * FROM sales', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Login route
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
