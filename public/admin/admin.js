(function () {
const el = (id) => document.getElementById(id);
let currentOrderStatus = 'all';

const statusLabel = { pending: '未入金', paid: '入金済み', delivered: '対応済み', cancelled: 'キャンセル' };

function escapeHtml(s) {
return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, opts = {}) {
const res = await fetch('/api/admin' + path, {
headers: { 'Content-Type': 'application/json' },
...opts,
});
const data = await res.json().catch(() => ({}));
if (!res.ok) throw new Error(data.error || 'エラーが発生しました。');
return data;
}

async function checkAuth() {
const me = await api('/me');
if (me.loggedIn) {
el('loginScreen').style.display = 'none';
el('dashboard').style.display = '';
initDashboard();
} else {
el('loginScreen').style.display = '';
el('dashboard').style.display = 'none';
}
}

el('loginBtn').addEventListener('click', async () => {
const username = el('loginUser').value.trim();
const password = el('loginPass').value;
const errEl = el('loginError');
try {
await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
errEl.style.display = 'none';
checkAuth();
} catch (e) {
errEl.textContent = e.message;
errEl.style.display = '';
}
});

el('logoutBtn').addEventListener('click', async () => {
await api('/logout', { method: 'POST' });
checkAuth();
});

// ---- tab switching (top-level) ----
document.querySelectorAll('.tab-bar').forEach(bar => {
if (bar.closest('#dashboard') && bar.parentElement.classList.contains('admin-topbar') === false && bar.parentElement.id !== undefined) {
// handled individually below
}
});

document.querySelectorAll('#dashboard > .tab-bar > .tab-btn').forEach(btn => {
btn.addEventListener('click', () => {
document.querySelectorAll('#dashboard > .tab-bar > .tab-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
el('tab-' + btn.dataset.tab).style.display = '';
});
});

document.querySelectorAll('#tab-orders .tab-bar .tab-btn').forEach(btn => {
btn.addEventListener('click', () => {
document.querySelectorAll('#tab-orders .tab-bar .tab-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
currentOrderStatus = btn.dataset.status;
loadOrders();
});
});

function initDashboard() {
loadOrders();
loadCasts();
loadDrinks();
loadSettings();
}

// ---- Orders ----
async function loadOrders() {
const list = el('ordersList');
list.innerHTML = '<p class="empty-state">読み込み中...</p>';
try {
const orders = await api('/orders?status=' + currentOrderStatus);
if (orders.length === 0) {
list.innerHTML = '<p class="empty-state">注文がありません</p>';
return;
}
list.innerHTML = '';
orders.forEach(o => {
const card = document.createElement('div');
card.className = 'card';
card.innerHTML = `
<div class="order-card">
<div>
<strong>${escapeHtml(o.cast_name)}</strong> ／ ${escapeHtml(o.drink_name)}（¥${o.price.toLocaleString()}）
<div class="meta">${escapeHtml(o.customer_name)} 様 ・ ${o.payment_method === 'paypay' ? 'PayPay' : '銀行振込'} ・ #${o.id}</div>
<div class="meta">${o.created_at}</div>
${o.message ? `<div class="meta">💬 ${escapeHtml(o.message)}</div>` : ''}
</div>
<span class="badge ${o.status}">${statusLabel[o.status] || o.status}</span>
</div>
<div class="order-actions">
${o.status !== 'paid' ? '<button class="mini-btn" data-action="paid">入金済みにする</button>' : ''}
${o.status !== 'delivered' ? '<button class="mini-btn" data-action="delivered">対応済みにする</button>' : ''}
${o.status !== 'cancelled' ? '<button class="mini-btn danger" data-action="cancelled">キャンセル</button>' : ''}
<button class="mini-btn danger" data-action="delete">削除</button>
</div>
`;
card.querySelectorAll('[data-action]').forEach(b => {
b.addEventListener('click', async () => {
const action = b.dataset.action;
if (action === 'delete') {
if (!confirm('この注文を削除しますか？')) return;
await api(`/orders/${o.id}`, { method: 'DELETE' });
} else {
await api(`/orders/${o.id}`, { method: 'PATCH', body: JSON.stringify({ status: action }) });
}
loadOrders();
});
});
list.appendChild(card);
});
} catch (e) {
list.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
}
}

// ---- Casts ----
async function loadCasts() {
const list = el('castsList');
const casts = await api('/casts');
list.innerHTML = '';
casts.forEach((c, idx) => {
const row = document.createElement('div');
row.className = 'card';
row.innerHTML = `
<div class="list-item">
<span>${escapeHtml(c.name)} ${c.active ? '' : '（非表示）'}</span>
<div class="order-actions">
<button class="mini-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
<button class="mini-btn" data-action="down" ${idx === casts.length - 1 ? 'disabled' : ''}>↓</button>
<button class="mini-btn" data-action="toggle">${c.active ? '非表示にする' : '表示する'}</button>
<button class="mini-btn danger" data-action="delete">削除</button>
</div>
</div>
`;
row.querySelector('[data-action=toggle]').addEventListener('click', async () => {
await api(`/casts/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: c.active ? 0 : 1 }) });
loadCasts();
});
row.querySelector('[data-action=delete]').addEventListener('click', async () => {
if (!confirm('削除しますか？')) return;
await api(`/casts/${c.id}`, { method: 'DELETE' });
loadCasts();
});
const upBtn = row.querySelector('[data-action=up]');
const downBtn = row.querySelector('[data-action=down]');
if (upBtn) upBtn.addEventListener('click', () => swapOrder(casts, idx, idx - 1, 'casts', loadCasts));
if (downBtn) downBtn.addEventListener('click', () => swapOrder(casts, idx, idx + 1, 'casts', loadCasts));
list.appendChild(row);
});
}

// 表示順（sort_order）を隣同士で入れ替える共通処理。casts/drinksどちらでも使う
async function swapOrder(items, indexA, indexB, kind, reload) {
if (indexB < 0 || indexB >= items.length) return;
const a = items[indexA];
const b = items[indexB];
await api(`/${kind}/${a.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: indexB }) });
await api(`/${kind}/${b.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: indexA }) });
reload();
}

el('addCastBtn').addEventListener('click', async () => {
const name = el('newCastName').value.trim();
const photo_url = el('newCastPhoto').value.trim();
if (!name) return;
await api('/casts', { method: 'POST', body: JSON.stringify({ name, photo_url }) });
el('newCastName').value = '';
el('newCastPhoto').value = '';
loadCasts();
});

// ---- Drinks ----
async function loadDrinks() {
const list = el('drinksList');
const drinks = await api('/drinks');
list.innerHTML = '';
drinks.forEach((d, idx) => {
const row = document.createElement('div');
row.className = 'card';
row.innerHTML = `
<div class="list-item">
<span>${escapeHtml(d.name)}（¥${d.price.toLocaleString()}）${d.active ? '' : '（非表示）'}</span>
<div class="order-actions">
<button class="mini-btn" data-action="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
<button class="mini-btn" data-action="down" ${idx === drinks.length - 1 ? 'disabled' : ''}>↓</button>
<button class="mini-btn" data-action="toggle">${d.active ? '非表示にする' : '表示する'}</button>
<button class="mini-btn danger" data-action="delete">削除</button>
</div>
</div>
`;
const upBtn = row.querySelector('[data-action=up]');
const downBtn = row.querySelector('[data-action=down]');
if (upBtn) upBtn.addEventListener('click', () => swapOrder(drinks, idx, idx - 1, 'drinks', loadDrinks));
if (downBtn) downBtn.addEventListener('click', () => swapOrder(drinks, idx, idx + 1, 'drinks', loadDrinks));
row.querySelector('[data-action=toggle]').addEventListener('click', async () => {
await api(`/drinks/${d.id}`, { method: 'PATCH', body: JSON.stringify({ active: d.active ? 0 : 1 }) });
loadDrinks();
});
row.querySelector('[data-action=delete]').addEventListener('click', async () => {
if (!confirm('削除しますか？')) return;
await api(`/drinks/${d.id}`, { method: 'DELETE' });
loadDrinks();
});
list.appendChild(row);
});
}

el('addDrinkBtn').addEventListener('click', async () => {
const name = el('newDrinkName').value.trim();
const price = parseInt(el('newDrinkPrice').value, 10);
if (!name || isNaN(price)) return;
await api('/drinks', { method: 'POST', body: JSON.stringify({ name, price }) });
el('newDrinkName').value = '';
el('newDrinkPrice').value = '';
loadDrinks();
});

// ---- Settings ----
async function loadSettings() {
const s = await api('/settings');
el('settingShopName').value = s.shop_name || '';
el('settingPaypay').value = s.paypay_id || '';
el('settingBank').value = s.bank_info || '';
}

el('saveSettingsBtn').addEventListener('click', async () => {
const msg = el('settingsMsg');
try {
await api('/settings', {
method: 'PUT',
body: JSON.stringify({
shop_name: el('settingShopName').value.trim(),
paypay_id: el('settingPaypay').value.trim(),
bank_info: el('settingBank').value.trim(),
}),
});
msg.style.color = 'var(--success)';
msg.textContent = '保存しました。';
msg.style.display = '';
} catch (e) {
msg.style.color = 'var(--danger)';
msg.textContent = e.message;
msg.style.display = '';
}
});

// ---- Account ----
el('changePassBtn').addEventListener('click', async () => {
const msg = el('passMsg');
try {
await api('/change-password', {
method: 'POST',
body: JSON.stringify({
current_password: el('curPass').value,
new_password: el('newPass').value,
}),
});
msg.style.color = 'var(--success)';
msg.textContent = 'パスワードを変更しました。';
msg.style.display = '';
el('curPass').value = '';
el('newPass').value = '';
} catch (e) {
msg.style.color = 'var(--danger)';
msg.textContent = e.message;
msg.style.display = '';
}
});

checkAuth();
})();
