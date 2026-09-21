const express = require('express');
const router = express.Router();
const { client } = require('../db/init');

// GET /api/casts - active casts for the order form
router.get('/casts', async (req, res) => {
  const result = await client.execute('SELECT id, name, photo_url FROM casts WHERE active = 1 ORDER BY sort_order ASC, id ASC');
  res.json(result.rows);
});

// GET /api/drinks - active drinks for the order form
router.get('/drinks', async (req, res) => {
  const result = await client.execute('SELECT id, name, price, photo_url FROM drinks WHERE active = 1 ORDER BY sort_order ASC, id ASC');
  res.json(result.rows);
});

// GET /api/settings - public payment info + shop name
router.get('/settings', async (req, res) => {
  const result = await client.execute('SELECT key, value FROM settings');
  const settings = {};
  for (const r of result.rows) settings[r.key] = r.value;
  res.json(settings);
});

// POST /api/orders - submit a new order
router.post('/orders', async (req, res) => {
  const { cast_id, drink_id, customer_name, message, payment_method } = req.body;

  if (!cast_id || !drink_id || !customer_name || !payment_method) {
    return res.status(400).json({ error: '必須項目が不足しています。' });
  }
  if (!['paypay', 'bank'].includes(payment_method)) {
    return res.status(400).json({ error: '決済方法が不正です。' });
  }

  const castResult = await client.execute({ sql: 'SELECT * FROM casts WHERE id = ? AND active = 1', args: [cast_id] });
  const drinkResult = await client.execute({ sql: 'SELECT * FROM drinks WHERE id = ? AND active = 1', args: [drink_id] });
  const cast = castResult.rows[0];
  const drink = drinkResult.rows[0];
  if (!cast || !drink) {
    return res.status(400).json({ error: '選択されたキャストまたはドリンクが見つかりません。' });
  }

  const insertResult = await client.execute({
    sql: `INSERT INTO orders (cast_id, drink_id, customer_name, message, payment_method, status)
          VALUES (?, ?, ?, ?, ?, 'pending')`,
    args: [cast_id, drink_id, String(customer_name).slice(0, 100), String(message || '').slice(0, 500), payment_method],
  });

  res.json({
    order_id: Number(insertResult.lastInsertRowid),
    cast_name: cast.name,
    drink_name: drink.name,
    price: drink.price,
    payment_method,
  });
});

module.exports = router;
