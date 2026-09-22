(function () {
  const state = { casts: [], drinks: [], settings: {}, selectedCast: null, selectedDrink: null };

  const el = (id) => document.getElementById(id);

  function showStep(n) {
    for (let i = 1; i <= 5; i++) {
      el('step-' + i).style.display = i === n ? '' : 'none';
    }
    document.querySelectorAll('.step-dot').forEach((d, idx) => {
      d.classList.toggle('active', idx < n && n <= 4 ? idx <= n - 1 : idx <= 3);
    });
  }

  async function loadInitial() {
    const [casts, drinks, settings] = await Promise.all([
      fetch('/api/casts').then(r => r.json()),
      fetch('/api/drinks').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]);
    state.casts = casts;
    state.drinks = drinks;
    state.settings = settings;
    // ヘッダーはロゴ画像表示に固定。shop_name はページタイトル/alt表示にのみ反映する。
    if (settings.shop_name) {
      const logoImg = el('shopName').querySelector('img');
      if (logoImg) logoImg.alt = settings.shop_name;
      else el('shopName').textContent = settings.shop_name;
    }
    renderCasts();
    renderDrinks();
  }

  function renderCasts() {
    const grid = el('castGrid');
    grid.innerHTML = '';
    if (state.casts.length === 0) {
      grid.innerHTML = '<p class="empty-state">現在受付中のキャストがいません</p>';
      return;
    }
    state.casts.forEach(c => {
      const tile = document.createElement('div');
      tile.className = 'option-tile';
      tile.dataset.id = c.id;
      tile.innerHTML = `
        <div class="avatar">${c.photo_url ? `<img src="${c.photo_url}" alt="">` : '👤'}</div>
        <div class="name">${escapeHtml(c.name)}</div>
      `;
      tile.addEventListener('click', () => {
        state.selectedCast = c;
        document.querySelectorAll('#castGrid .option-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        setTimeout(() => showStep(2), 150);
      });
      grid.appendChild(tile);
    });
  }

  function renderDrinks() {
    const grid = el('drinkGrid');
    grid.innerHTML = '';
    if (state.drinks.length === 0) {
      grid.innerHTML = '<p class="empty-state">現在注文可能なドリンクがありません</p>';
      return;
    }
    state.drinks.forEach(d => {
      const tile = document.createElement('div');
      tile.className = 'option-tile';
      tile.dataset.id = d.id;
      tile.innerHTML = `
        <div class="name">${escapeHtml(d.name)}</div>
        <div class="price">¥${d.price.toLocaleString()}</div>
      `;
      tile.addEventListener('click', () => {
        state.selectedDrink = d;
        document.querySelectorAll('#drinkGrid .option-tile').forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        setTimeout(() => showStep(3), 150);
      });
      grid.appendChild(tile);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  document.querySelectorAll('.pay-choice input').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.pay-choice label').forEach(l => l.classList.remove('selected'));
      r.closest('label').classList.add('selected');
    });
  });

  el('backTo1').addEventListener('click', () => showStep(1));
  el('backTo2').addEventListener('click', () => showStep(2));
  el('backTo3').addEventListener('click', () => showStep(3));

  el('toStep4').addEventListener('click', () => {
    const name = el('customerName').value.trim();
    const pay = document.querySelector('input[name=pay]:checked');
    const errEl = el('step3Error');
    if (!name) { errEl.textContent = 'お名前を入力してください。'; errEl.style.display = ''; return; }
    if (!pay) { errEl.textContent = '決済方法を選択してください。'; errEl.style.display = ''; return; }
    errEl.style.display = 'none';

    el('sumCast').textContent = state.selectedCast.name;
    el('sumDrink').textContent = state.selectedDrink.name;
    el('sumPrice').textContent = '¥' + state.selectedDrink.price.toLocaleString();
    el('sumName').textContent = name;
    el('sumPay').textContent = pay.value === 'paypay' ? 'PayPay' : '銀行振込';
    showStep(4);
  });

  el('submitOrder').addEventListener('click', async () => {
    const btn = el('submitOrder');
    btn.disabled = true;
    const name = el('customerName').value.trim();
    const message = el('message').value.trim();
    const pay = document.querySelector('input[name=pay]:checked').value;
    const errEl = el('step4Error');
    errEl.style.display = 'none';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cast_id: state.selectedCast.id,
          drink_id: state.selectedDrink.id,
          customer_name: name,
          message,
          payment_method: pay,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '注文に失敗しました。');

      el('doneOrderId').textContent = '#' + data.order_id;
      const box = el('paymentBox');
      if (pay === 'paypay') {
        box.textContent = `PayPay ID: ${state.settings.paypay_id}\n金額: ¥${data.price.toLocaleString()}\n\n上記PayPay IDへ送金をお願いします。備考欄に注文番号(#${data.order_id})を入れていただけるとスムーズです。`;
      } else {
        box.textContent = `${state.settings.bank_info}\n金額: ¥${data.price.toLocaleString()}\n\n振込人名義に注文番号(#${data.order_id})を入れていただけるとスムーズです。`;
      }
      showStep(5);
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = '';
    } finally {
      btn.disabled = false;
    }
  });

  el('restart').addEventListener('click', () => {
    state.selectedCast = null;
    state.selectedDrink = null;
    el('customerName').value = '';
    el('message').value = '';
    document.querySelectorAll('input[name=pay]').forEach(r => r.checked = false);
    document.querySelectorAll('.pay-choice label').forEach(l => l.classList.remove('selected'));
    document.querySelectorAll('.option-tile').forEach(t => t.classList.remove('selected'));
    showStep(1);
  });

  loadInitial();
  showStep(1);
})();
