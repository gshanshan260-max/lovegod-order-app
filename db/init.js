const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');

// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が設定されていればTurso（無料のクラウドDB）に接続。
// 設定されていなければローカルのファイル(data.sqlite)を使う（自分のPCでの動作確認用）。
const client = process.env.TURSO_DATABASE_URL
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : createClient({ url: 'file:' + path.join(__dirname, '..', 'data.sqlite') });

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS casts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    photo_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS drinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    photo_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cast_id INTEGER NOT NULL,
    drink_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    message TEXT,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`,
];

async function initSchema() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt);
  }
  
  // 既存のdrinksテーブルに photo_url 列が無ければ追加する（後から追加した列のため。既にあればエラーになるので無視する）
  try {
    await client.execute('ALTER TABLE drinks ADD COLUMN photo_url TEXT');
  } catch (e) {
    // already exists - ignore
  }

  const settingDefaults = {
    paypay_id: 'あなたのPayPay ID',
    bank_info: '〇〇銀行 〇〇支店 普通 1234567 名義：ヤマダタロウ',
    shop_name: 'LoveGod',
  };
  for (const [k, v] of Object.entries(settingDefaults)) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [k, v],
    });
  }

  const castCount = (await client.execute('SELECT COUNT(*) AS c FROM casts')).rows[0].c;
  if (Number(castCount) === 0) {
    await client.execute({ sql: 'INSERT INTO casts (name, photo_url, sort_order) VALUES (?, ?, ?)', args: ['サンプルキャストA', '', 0] });
    await client.execute({ sql: 'INSERT INTO casts (name, photo_url, sort_order) VALUES (?, ?, ?)', args: ['サンプルキャストB', '', 1] });
  }

  const drinkCount = (await client.execute('SELECT COUNT(*) AS c FROM drinks')).rows[0].c;
  if (Number(drinkCount) === 0) {
    await client.execute({ sql: 'INSERT INTO drinks (name, price, sort_order) VALUES (?, ?, ?)', args: ['シャンパン(ミニ)', 3000, 0] });
    await client.execute({ sql: 'INSERT INTO drinks (name, price, sort_order) VALUES (?, ?, ?)', args: ['カクテル', 1500, 1] });
    await client.execute({ sql: 'INSERT INTO drinks (name, price, sort_order) VALUES (?, ?, ?)', args: ['ソフトドリンク', 800, 2] });
  }
}

async function ensureAdmin(username, plainPassword) {
  const existing = await client.execute({ sql: 'SELECT * FROM admin_users WHERE username = ?', args: [username] });
  if (existing.rows.length === 0) {
    const hash = bcrypt.hashSync(plainPassword, 10);
    await client.execute({ sql: 'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', args: [username, hash] });
    console.log(`[init] 管理者アカウントを作成しました: ${username}`);
  }
}

module.exports = { client, initSchema, ensureAdmin };
