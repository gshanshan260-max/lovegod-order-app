const express = require('express');
const router = express.Router();
const { db } = require('../db/init');

// GET /api/casts - active casts for the order form
router.get('/casts', (req, res) => {
  const casts = db.prepare('SELECT id, name, photo_url FROM casts WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json(casts);
});

// GET /api/drinks - active drinks for the order form
router.get('/drinks', (req, res) => {
  const drinks = db.prepare('SELECT id, name, price FROM drinks WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
  res.json(drinks);
});

// GET /api/settings - public payment info + shop name
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

// POST /api/orders - submit a new order
router.post('/orders', (req, res) => {
  const { cast_id, drink_id, customer_name, message, payment_method } = req.body;

  if (!cast_id || !drink_id || !customer_name || !payment_method) {
    return res.status(400).json({ error: '必須項目が不足しています。' });
  }
  if (!['paypay', 'bank'].includes(payment_method)) {
    return res.status(400).json({ error: '決済方法が不正です。' });
  }

  const cast = db.prepare('SELECT * FROM casts WHERE id = ? AND active = 1').get(cast_id);
  const drink = db.prepare('SELECT * FROM drinks WHERE id = ? AND active = 1').get(drink_id);
  if (!cast || !drink) {
    return res.status(400).json({ error: '選択されたキャストまたはドリンクが見つかりません。' });
  }

  const info = db.prepare(`
    INSERT INTO orders (cast_id, drink_id, customer_name, message, payment_method, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(cast_id, drink_id, String(customer_name).slice(0, 100), String(message || '').slice(0, 500), payment_method);

  res.json({
    order_id: info.lastInsertRowid,
    cast_name: cast.name,
    drink_name: drink.name,
    price: drink.price,
    payment_method,
  });
});

module.exports = router;
