const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/init');

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'ログインが必要です。' });
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
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
router.get('/orders', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && status !== 'all') {
    rows = db.prepare(`
      SELECT o.*, c.name AS cast_name, d.name AS drink_name, d.price AS price
      FROM orders o
      JOIN casts c ON c.id = o.cast_id
      JOIN drinks d ON d.id = o.drink_id
      WHERE o.status = ?
      ORDER BY o.created_at DESC
    `).all(status);
  } else {
    rows = db.prepare(`
      SELECT o.*, c.name AS cast_name, d.name AS drink_name, d.price AS price
      FROM orders o
      JOIN casts c ON c.id = o.cast_id
      JOIN drinks d ON d.id = o.drink_id
      ORDER BY o.created_at DESC
    `).all();
  }
  res.json(rows);
});

// PATCH /api/admin/orders/:id  { status }
router.patch('/orders/:id', (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'paid', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: '不正なステータスです。' });
  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '注文が見つかりません。' });
  res.json({ ok: true });
});

// DELETE /api/admin/orders/:id
router.delete('/orders/:id', (req, res) => {
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- casts CRUD ----
router.get('/casts', (req, res) => {
  res.json(db.prepare('SELECT * FROM casts ORDER BY sort_order ASC, id ASC').all());
});
router.post('/casts', (req, res) => {
  const { name, photo_url, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: '名前は必須です。' });
  const info = db.prepare('INSERT INTO casts (name, photo_url, sort_order) VALUES (?, ?, ?)')
    .run(name, photo_url || '', sort_order || 0);
  res.json({ id: info.lastInsertRowid });
});
router.patch('/casts/:id', (req, res) => {
  const { name, photo_url, active, sort_order } = req.body;
  const existing = db.prepare('SELECT * FROM casts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '見つかりません。' });
  db.prepare('UPDATE casts SET name=?, photo_url=?, active=?, sort_order=? WHERE id=?').run(
    name ?? existing.name,
    photo_url ?? existing.photo_url,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    sort_order ?? existing.sort_order,
    req.params.id
  );
  res.json({ ok: true });
});
router.delete('/casts/:id', (req, res) => {
  db.prepare('DELETE FROM casts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- drinks CRUD ----
router.get('/drinks', (req, res) => {
  res.json(db.prepare('SELECT * FROM drinks ORDER BY sort_order ASC, id ASC').all());
});
router.post('/drinks', (req, res) => {
  const { name, price, sort_order } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: '名前と価格は必須です。' });
  const info = db.prepare('INSERT INTO drinks (name, price, sort_order) VALUES (?, ?, ?)')
    .run(name, price, sort_order || 0);
  res.json({ id: info.lastInsertRowid });
});
router.patch('/drinks/:id', (req, res) => {
  const { name, price, active, sort_order } = req.body;
  const existing = db.prepare('SELECT * FROM drinks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '見つかりません。' });
  db.prepare('UPDATE drinks SET name=?, price=?, active=?, sort_order=? WHERE id=?').run(
    name ?? existing.name,
    price ?? existing.price,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    sort_order ?? existing.sort_order,
    req.params.id
  );
  res.json({ ok: true });
});
router.delete('/drinks/:id', (req, res) => {
  db.prepare('DELETE FROM drinks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- settings ----
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});
router.put('/settings', (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(req.body || {})) {
    upsert.run(k, String(v));
  }
  res.json({ ok: true });
});

// ---- change own password ----
router.post('/change-password', (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.adminId);
  if (!user || !bcrypt.compareSync(current_password || '', user.password_hash)) {
    return res.status(401).json({ error: '現在のパスワードが違います。' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: '新しいパスワードは6文字以上にしてください。' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

module.exports = router;
