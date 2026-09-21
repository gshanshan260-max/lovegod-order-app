require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { ensureAdmin } = require('./db/init');

// Create initial admin account from env vars (only if none exists yet)
ensureAdmin(
  process.env.ADMIN_USERNAME || 'admin',
  process.env.ADMIN_PASSWORD || 'changeme123'
);

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.use(session({
  // 管理者1名の小規模利用のため、セッションはメモリ保持（サーバー再起動でログアウトされる程度の影響）
  secret: process.env.SESSION_SECRET || 'lovegod-please-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
    httpOnly: true,
    secure: 'auto', // https proxy (Render/Railway等)なら自動でSecure、httpのローカル検証時は無効化
  },
}));

app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));

app.use(express.static(path.join(__dirname, 'public')));

// SPA-ish fallback for admin routes (login/dashboard are separate static files, this is just safety)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LoveGod 遠隔ドリンクサイト起動中: http://localhost:${PORT}`);
  console.log(`管理画面: http://localhost:${PORT}/admin`);
});
