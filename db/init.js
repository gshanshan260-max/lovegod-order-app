const { DatabaseSync } = require('node:sqlite')
const bcrypt = require('bcryptjs')
const path = require('path')
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite')
const db = new DatabaseSync(DB_PATH)

db.exec(`
CREATE TABLE IF NOT EXISTS casts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  photo_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cast_id INTEGER NOT NULL,
  drink_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  message TEXT,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cast_id) REFERENCES casts(id),
  FOREIGN KEY (drink_id) REFERENCES drinks(id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Seed default settings if empty
const settingDefaults = {
  paypay_id: 'あなたのPayPay ID',
  bank_info: '〇〇銀行 〇〇支店 普通 1234567 名義：ヤマダタロウ',
  shop_name: 'LoveGod',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(settingDefaults)) insertSetting.run(k, v);

// Seed sample cast/drink rows only if tables are empty, so first run isn't blank
const castCount = db.prepare('SELECT COUNT(*) AS c FROM casts').get().c;
if (castCount === 0) {
  const insertCast = db.prepare('INSERT INTO casts (name, photo_url, sort_order) VALUES (?, ?, ?)');
  insertCast.run('サンプルキャストA', '', 0);
  insertCast.run('サンプルキャストB', '', 1);
}
const drinkCount = db.prepare('SELECT COUNT(*) AS c FROM drinks').get().c;
if (drinkCount === 0) {
  const insertDrink = db.prepare('INSERT INTO drinks (name, price, sort_order) VALUES (?, ?, ?)');
  insertDrink.run('シャンパン(ミニ)', 3000, 0);
  insertDrink.run('カクテル', 1500, 1);
  insertDrink.run('ソフトドリンク', 800, 2);
}

// Seed admin user from env if no admin exists yet
function ensureAdmin(username, plainPassword) {
  const existing = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(plainPassword, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log(`[init] 管理者アカウントを作成しました: ${username}`);
  }
}

module.exports = { db, ensureAdmin };
