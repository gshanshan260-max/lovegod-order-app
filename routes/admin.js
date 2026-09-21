const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { client } = require('../db/init');

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'ログインが必要です。' });
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await client.execute({ sql: 'SELECT * FROM admin_users WHERE username = ?', args: [username] });
  const user = result.rows[0];
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  }
  req.session.adminId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/admin/me
router.get('/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  res.json({ loggedIn: false });
});

// ---- everything below requires auth ----
router.use(requireAuth);

// GET /api/admin/orders?status=pending
router.get('/orders', async (req, res) => {
  const { status } = req.query;
  const baseSql = `
    SELECT o.*, c.name AS cast_name, d.name AS drink_name, d.price AS price
    FROM orders o
    JOIN casts c ON c.id = o.cast_id
    JOIN drinks d ON d.id = o.drink_id
  `;
  let result;
  if (status && status !== 'all') {
    result = await client.execute({ sql: baseSql + ' WHERE o.status = ? ORDER BY o.created_at DESC', args: [status] });
  } else {
    result = await client.execute(baseSql + ' ORDER BY o.created_at DESC');
  }
  res.json(result.rows);
});

// PATCH /api/admin/orders/:id  { status }
router.patch('/orders/:id', async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'paid', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: '不正なステータスです。' });
  const result = await client.execute({ sql: 'UPDATE orders SET status = ? WHERE id = ?', args: [status, req.params.id] });
  if (Number(result.rowsAffected) === 0) return res.status(404).json({ error: '注文が見つかりません。' });
  res.json({ ok: true });
});

// DELETE /api/admin/orders/:id
router.delete('/orders/:id', async (req, res) => {
  await client.execute({ sql: 'DELETE FROM orders WHERE id = ?', args: [req.params.id] });
  res.json({ ok: true });
});

// ---- casts CRUD ----
router.get('/casts', async (req, res) => {
  const result = await client.execute('SELECT * FROM casts ORDER BY sort_order ASC, id ASC');
  res.json(result.rows);
});
router.post('/casts', async (req, res) => {
  const { name, photo_url, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: '名前は必須です。' });
  const result = await client.execute({
    sql: 'INSERT INTO casts (name, photo_url, sort_order) VALUES (?, ?, ?)',
    args: [name, photo_url || '', sort_order || 0],
  });
  res.json({ id: Number(result.lastInsertRowid) });
});
router.patch('/casts/:id', async (req, res) => {
  const { name, photo_url, active, sort_order } = req.body;
  const existingResult = await client.execute({ sql: 'SELECT * FROM casts WHERE id = ?', args: [req.params.id] });
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: '見つかりません。' });
  await client.execute({
    sql: 'UPDATE casts SET name=?, photo_url=?, active=?, sort_order=? WHERE id=?',
    args: [
      name ?? existing.name,
      photo_url ?? existing.photo_url,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      sort_order ?? existing.sort_order,
      req.params.id,
    ],
  });
  res.json({ ok: true });
});
router.delete('/casts/:id', async (req, res) => {
  await client.execute({ sql: 'DELETE FROM casts WHERE id = ?', args: [req.params.id] });
  res.json({ ok: true });
});

// ---- drinks CRUD ----
router.get('/drinks', async (req, res) => {
  const result = await client.execute('SELECT * FROM drinks ORDER BY sort_order ASC, id ASC');
  res.json(result.rows);
});
router.post('/drinks', async (req, res) => {
  const { name, price, photo_url, sort_order } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: '名前と価格は必須です。' });
  const result = await client.execute({
    sql: 'INSERT INTO drinks (name, price, photo_url, sort_order) VALUES (?, ?, ?, ?)',
    args: [name, price, photo_url || '', sort_order || 0],
  });
  res.json({ id: Number(result.lastInsertRowid) });
});
router.patch('/drinks/:id', async (req, res) => {
  const { name, price, photo_url, active, sort_order } = req.body;
  const existingResult = await client.execute({ sql: 'SELECT * FROM drinks WHERE id = ?', args: [req.params.id] });
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: '見つかりません。' });
  await client.execute({
    sql: 'UPDATE drinks SET name=?, price=?, photo_url=?, active=?, sort_order=? WHERE id=?',
    args: [
      name ?? existing.name,
      price ?? existing.price,
      photo_url ?? existing.photo_url,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      sort_order ?? existing.sort_order,
      req.params.id,
    ],
  });
  res.json({ ok: true });
});
router.delete('/drinks/:id', async (req, res) => {
  await client.execute({ sql: 'DELETE FROM drinks WHERE id = ?', args: [req.params.id] });
  res.json({ ok: true });
});

// ---- settings ----
router.get('/settings', async (req, res) => {
  const result = await client.execute('SELECT key, value FROM settings');
  const settings = {};
  for (const r of result.rows) settings[r.key] = r.value;
  res.json(settings);
});
router.put('/settings', async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    await client.execute({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      args: [k, String(v)],
    });
  }
  res.json({ ok: true });
});

// ---- change own password ----
router.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  const result = await client.execute({ sql: 'SELECT * FROM admin_users WHERE id = ?', args: [req.session.adminId] });
  const user = result.rows[0];
  if (!user || !bcrypt.compareSync(current_password || '', user.password_hash)) {
    return res.status(401).json({ error: '現在のパスワードが違います。' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: '新しいパスワードは6文字以上にしてください。' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  await client.execute({ sql: 'UPDATE admin_users SET password_hash = ? WHERE id = ?', args: [hash, user.id] });
  res.json({ ok: true });
});

module.exports = router;
