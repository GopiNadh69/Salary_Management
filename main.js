import NaiveBayes from './naiveBayes.js';
import Storage from './storage.js';

const App = (() => {
  // ---------- State ----------
  let transactions = [];
  let budgets = {};
  let seeded = false;
  let currentPeriod = 'monthly';
  let pieChart = null;
  let pendingDeleteId = null;
  let pendingEditId = null;
  let lastAiResult = null;

  const CATEGORY_LABELS = NaiveBayes.CATEGORY_LABELS;
  const EXPENSE_CAT_KEYS = [
    'food', 'transport', 'shopping', 'utilities', 'entertainment',
    'health', 'housing', 'education', 'travel', 'other'
  ];
  const INCOME_CAT_KEYS = ['salary', 'other'];
  const PIE_COLORS = [
    '#f97316', '#fdba74', '#ea580c', '#fb923c', '#c2410c',
    '#fed7aa', '#ffedd5', '#9a3412', '#fdba74', '#f97316', '#d97757'
  ];

  // ---------- Data helpers ----------
  function save() {
    Storage.setState({ transactions, budgets, seeded });
  }

  function load() {
    const data = Storage.getState();
    transactions = data.transactions || [];
    budgets = data.budgets || {};
    seeded = !!data.seeded;
  }

  // ---------- Period filtering ----------
  function isInPeriod(txn, period) {
    const d = new Date(txn.date + 'T00:00:00');
    const now = new Date();
    switch (period) {
      case 'weekly': {
        const start = new Date(now);
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        return d >= start;
      }
      case 'monthly':
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      case 'yearly':
        return d.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  }

  function periodExpenses(period) {
    return transactions.filter(
      (t) => t.type === 'expense' && isInPeriod(t, period)
    );
  }

  // ---------- Rendering: stats ----------
  function renderStats() {
    const income = transactions
      .filter((t) => t.type === 'income' && isInPeriod(t, currentPeriod))
      .reduce((s, t) => s + t.amount, 0);
    const expense = periodExpenses(currentPeriod).reduce((s, t) => s + t.amount, 0);
    const count = transactions.filter((t) => isInPeriod(t, currentPeriod)).length;

    el('statIncome').textContent = fmt(income);
    el('statExpense').textContent = fmt(expense);
    el('statBalance').textContent = fmt(income - expense);
    el('statCount').textContent = count;
  }

  // ---------- Rendering: pie chart ----------
  function renderPie() {
    const expenses = periodExpenses(currentPeriod);
    const byCat = {};
    for (const t of expenses) {
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    }

    const labels = Object.keys(byCat);
    const isEmpty = labels.length === 0;
    const hint = el('pieEmptyHint');
    const canvas = el('pieChart');

    if (typeof Chart === 'undefined') {
      canvas.style.display = 'none';
      hint.textContent = 'Chart library could not load (offline?). Expense data is still available below.';
      hint.style.display = 'flex';
      return;
    }

    hint.textContent = 'No expenses for this period yet';
    canvas.style.display = isEmpty ? 'none' : 'block';

    if (isEmpty) {
      hint.style.display = 'flex';
      if (pieChart) { pieChart.destroy(); pieChart = null; }
      renderCategoryBars([]);
      return;
    }
    hint.style.display = 'none';

    const ctx = canvas.getContext('2d');
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.map((l) => CATEGORY_LABELS[l] || l),
        datasets: [{
          data: labels.map((l) => byCat[l]),
          backgroundColor: labels.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
          borderColor: '#fffaf0',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#805d2a',
              font: { family: 'Poppins', size: 12 },
              padding: 14,
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}: ${fmt(c.raw)}`
            }
          }
        }
      }
    });

    renderCategoryBars(Object.entries(byCat).sort((a, b) => b[1] - a[1]));
  }

  // ---------- Rendering: category bars ----------
  function renderCategoryBars(entries) {
    const wrap = el('categoryBars');
    const hint = el('catEmptyHint');
    wrap.innerHTML = '';

    if (entries.length === 0) {
      hint.style.display = 'block';
      return;
    }
    hint.style.display = 'none';

    const max = entries[0][1] || 1;
    for (const [cat, amt] of entries.slice(0, 5)) {
      const li = document.createElement('li');
      li.className = 'category-bar-item';
      li.innerHTML = `
        <div class="cat-top">
          <span class="cat-label">${escapeHtml(CATEGORY_LABELS[cat] || cat)}</span>
          <span class="cat-amount">${fmt(amt)}</span>
        </div>
        <div class="cat-track"><div class="cat-fill" style="width:${(amt / max) * 100}%"></div></div>
      `;
      wrap.appendChild(li);
    }
  }

  // ---------- Rendering: tables ----------
  function renderRecent() {
    const body = el('recentBody');
    const hint = el('recentEmptyHint');
    const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    body.innerHTML = '';
    if (recent.length === 0) {
      hint.style.display = 'block';
      return;
    }
    hint.style.display = 'none';

    for (const t of recent) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(t.note)}</td>
        <td><span class="cat-badge">${escapeHtml(CATEGORY_LABELS[t.category] || t.category)}</span></td>
        <td>${t.date}</td>
        <td class="align-right amount-${t.type}">${fmt(t.amount)}</td>
      `;
      body.appendChild(tr);
    }
  }

  function renderAll() {
    const body = el('allBody');
    const hint = el('allEmptyHint');
    const search = (el('txnSearch').value || '').toLowerCase();
    const fType = el('filterType').value;
    const fCat = el('filterCategory').value;

    let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

    if (fType !== 'all') list = list.filter((t) => t.type === fType);
    if (fCat !== 'all') list = list.filter((t) => t.category === fCat);
    if (search) list = list.filter((t) => (t.note || '').toLowerCase().includes(search));

    el('txnCount').textContent = `${list.length} transaction${list.length === 1 ? '' : 's'}`;

    body.innerHTML = '';
    if (list.length === 0) {
      hint.style.display = 'block';
      return;
    }
    hint.style.display = 'none';

    for (const t of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(t.note)}</td>
        <td><span class="cat-badge">${escapeHtml(CATEGORY_LABELS[t.category] || t.category)}</span></td>
        <td><span class="type-badge ${t.type}">${t.type}</span></td>
        <td>${t.date}</td>
        <td class="align-right amount-${t.type}">${fmt(t.amount)}</td>
        <td class="align-center">
          <button class="action-btn edit" data-edit="${t.id}" title="Edit">&#9998;</button>
          <button class="action-btn del" data-id="${t.id}" title="Delete">&#128465;</button>
        </td>
      `;
      body.appendChild(tr);
    }
  }

  // ---------- Rendering: budgets ----------
  function renderBudgets() {
    const grid = el('budgetGrid');
    const hint = el('budgetEmptyHint');
    grid.innerHTML = '';

    const keys = Object.keys(budgets);
    if (keys.length === 0) {
      hint.style.display = 'block';
      return;
    }
    hint.style.display = 'none';

    const spentByCat = {};
    const now = new Date();
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date + 'T00:00:00');
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount;
      }
    }

    for (const cat of keys) {
      const limit = budgets[cat];
      const spent = spentByCat[cat] || 0;
      const pct = Math.min(100, (spent / limit) * 100);

      let statusCls = 'ok';
      let statusText = `${Math.round((spent / limit) * 100)}% used`;
      if (pct >= 100) { statusCls = 'over'; statusText = 'Limit exceeded!'; }
      else if (pct >= 75) { statusCls = 'warn'; statusText = `${Math.round((spent / limit) * 100)}% used`; }

      const card = document.createElement('div');
      card.className = 'budget-card';
      card.innerHTML = `
        <div class="budget-card-header">
          <h3>${escapeHtml(CATEGORY_LABELS[cat] || cat)}</h3>
          <button class="budget-remove" data-cat="${cat}" title="Remove">&times;</button>
        </div>
        <div class="budget-nums">
          <span>Spent <strong>${fmt(spent)}</strong></span>
          <span>Limit <strong>${fmt(limit)}</strong></span>
        </div>
        <div class="progress-track"><div class="progress-fill ${pct >= 100 ? 'over' : ''}" style="width:${pct}%"></div></div>
        <p class="budget-status ${statusCls}">${statusText} ${pct >= 100 ? '&#9888;' : ''}</p>
      `;
      grid.appendChild(card);
    }
  }

  // ---------- View switching ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${name}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    document.getElementById('sidebar').classList.remove('open');

    if (name === 'dashboard') renderDashboard();
    if (name === 'transactions') renderAll();
    if (name === 'budget') renderBudgets();
  }

  function renderDashboard() {
    renderStats();
    renderPie();
    renderRecent();
  }

  function refresh() {
    renderDashboard();
    renderBudgets();
    if (document.getElementById('view-transactions').classList.contains('active')) renderAll();
  }

  // ---------- Helpers ----------
  function fmt(n) {
    return '\u20B9' + Number(n || 0).toFixed(2);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function el(id) { return document.getElementById(id); }

  function today() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function openModal(id) { el(id).hidden = false; }
  function closeModal(id) { el(id).hidden = true; }

  function populateCategories(select, selected, type) {
    select.innerHTML = '';
    const keys = type === 'income' ? INCOME_CAT_KEYS : EXPENSE_CAT_KEYS;
    for (const k of keys) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = CATEGORY_LABELS[k] || k;
      if (k === selected) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function toast(msg, type = 'info') {
    const container = el('toastContainer');
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = msg;
    container.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity 0.4s';
      setTimeout(() => node.remove(), 400);
    }, 2600);
  }

  // ---------- Events ----------
  function bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => showView(btn.dataset.goto));
    });
    el('menuBtn').addEventListener('click', () => {
      el('sidebar').classList.toggle('open');
    });
    el('logoutBtn').addEventListener('click', () => {
      if (!confirm('Reset all data? Demo data will be restored on next load.')) return;
      try { localStorage.removeItem(Storage.LS_KEY); } catch (e) {}
      location.reload();
    });

    // Timeframe buttons
    document.querySelectorAll('.tf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;
        renderDashboard();
      });
    });

    // Add transaction
    el('txnType').addEventListener('change', (e) => {
      populateCategories(el('txnCategory'), null, e.target.value);
    });
    el('txnForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const type = el('txnType').value;
      const amount = parseFloat(el('txnAmount').value);
      if (!amount || amount <= 0) { toast('Please enter a valid amount.', 'error'); return; }

      const txn = {
        id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type,
        amount,
        category: el('txnCategory').value,
        date: el('txnDate').value,
        note: el('txnNote').value.trim(),
        createdAt: Date.now()
      };
      transactions.push(txn);
      save();
      e.target.reset();
      el('txnDate').value = today();
      populateCategories(el('txnCategory'), null, 'expense');
      toast(type === 'expense' ? 'Expense added.' : 'Income added.', 'success');
      refresh();
    });

    // Delete / Edit (delegated)
    document.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.action-btn.edit');
      if (editBtn) {
        const txn = transactions.find((t) => t.id === editBtn.dataset.edit);
        if (!txn) return;
        pendingEditId = txn.id;
        el('editType').value = txn.type;
        el('editAmount').value = txn.amount;
        el('editDate').value = txn.date;
        el('editNote').value = txn.note;
        populateCategories(el('editCategory'), txn.category, txn.type);
        openModal('editModalOverlay');
        return;
      }
      const delBtn = e.target.closest('.action-btn.del');
      if (delBtn) {
        pendingDeleteId = delBtn.dataset.id;
        openModal('modalOverlay');
        return;
      }
      const budgetRemove = e.target.closest('.budget-remove');
      if (budgetRemove) {
        delete budgets[budgetRemove.dataset.cat];
        save();
        renderBudgets();
        toast('Budget removed.');
      }
    });

    el('editType').addEventListener('change', (e) => {
      populateCategories(el('editCategory'), null, e.target.value);
    });
    el('editCancelBtn').addEventListener('click', () => {
      pendingEditId = null;
      closeModal('editModalOverlay');
    });
    el('editSaveBtn').addEventListener('click', () => {
      const amount = parseFloat(el('editAmount').value);
      if (!amount || amount <= 0) { toast('Enter a valid amount.', 'error'); return; }
      const txn = transactions.find((t) => t.id === pendingEditId);
      if (!txn) { closeModal('editModalOverlay'); return; }
      txn.type = el('editType').value;
      txn.amount = amount;
      txn.category = el('editCategory').value;
      txn.date = el('editDate').value;
      txn.note = el('editNote').value.trim();
      save();
      refresh();
      closeModal('editModalOverlay');
      pendingEditId = null;
      toast('Transaction updated.', 'success');
    });

    el('modalCancelBtn').addEventListener('click', () => {
      pendingDeleteId = null;
      closeModal('modalOverlay');
    });
    el('modalConfirmBtn').addEventListener('click', () => {
      if (pendingDeleteId) {
        transactions = transactions.filter((t) => t.id !== pendingDeleteId);
        save();
        refresh();
        toast('Transaction deleted.');
      }
      pendingDeleteId = null;
      closeModal('modalOverlay');
    });
    el('modalOverlay').addEventListener('click', (e) => {
      if (e.target === el('modalOverlay')) {
        pendingDeleteId = null;
        closeModal('modalOverlay');
      }
    });
    el('editModalOverlay').addEventListener('click', (e) => {
      if (e.target === el('editModalOverlay')) {
        pendingEditId = null;
        closeModal('editModalOverlay');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!el('modalOverlay').hidden) {
          pendingDeleteId = null;
          closeModal('modalOverlay');
        }
        if (!el('editModalOverlay').hidden) {
          pendingEditId = null;
          closeModal('editModalOverlay');
        }
      }
    });

    // Filters / search
    el('txnSearch').addEventListener('input', renderAll);
    el('filterType').addEventListener('change', renderAll);
    el('filterCategory').addEventListener('change', renderAll);

    // Budget form
    el('budgetForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const cat = el('budgetCategory').value;
      const amt = parseFloat(el('budgetAmount').value);
      if (!amt || amt <= 0) { toast('Enter a valid budget amount.', 'error'); return; }
      budgets[cat] = amt;
      save();
      renderBudgets();
      toast(`Budget set for ${CATEGORY_LABELS[cat]}.`, 'success');
      e.target.reset();
    });

    // SMS AI classification
    el('classifyBtn').addEventListener('click', () => {
      const text = el('smsInput').value.trim();
      if (!text) { toast('Paste a bank SMS message first.', 'error'); return; }
      const result = NaiveBayes.classify(text);

      lastAiResult = { ...result, note: result.merchant };
      const isIncome = result.type === 'income';
      el('aiTypeBadge').textContent = isIncome ? 'INCOME' : 'EXPENSE';
      el('aiTypeBadge').className = `badge type-${result.type}`;
      el('aiCategoryBadge').textContent = CATEGORY_LABELS[result.category] || result.category;
      el('aiCategoryBadge').className = 'badge cat';
      el('aiConfidence').textContent = (result.confidence * 100).toFixed(0) + '%';

      const parts = [];
      if (result.amount != null) parts.push(`Detected amount: <strong>${fmt(result.amount)}</strong>`);
      if (result.date) parts.push(`Detected date: <strong>${result.date}</strong>`);
      if (result.merchant) parts.push(`Merchant: <strong>${escapeHtml(result.merchant)}</strong>`);
      el('aiDetail').innerHTML = parts.join(' &nbsp;&bull;&nbsp; ') || 'Parsed text signature.';

      el('addFromSmsBtn').textContent = isIncome ? 'Add as Income' : 'Add as Expense';
      el('addFromSmsBtn').style.display = 'inline-block';
      el('aiResult').hidden = false;
    });

    // Sample SMS chips
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el('smsInput').value = chip.dataset.sms;
        el('classifyBtn').click();
      });
    });

    // Add classified result
    el('addFromSmsBtn').addEventListener('click', () => {
      if (!lastAiResult) return;
      const amount = lastAiResult.amount || 0;
      if (amount <= 0) {
        toast('No amount detected in this message.', 'error');
        return;
      }
      const txn = {
        id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: lastAiResult.type === 'income' ? 'income' : 'expense',
        amount,
        category: lastAiResult.category,
        date: lastAiResult.date || today(),
        note: lastAiResult.note || 'Bank SMS transaction',
        createdAt: Date.now(),
        viaAI: true
      };
      transactions.push(txn);
      save();
      refresh();
      toast(txn.type === 'income' ? 'Classified income added.' : 'Classified expense added.', 'success');
      el('aiResult').hidden = true;
      el('smsInput').value = '';
    });

    // Global: sync when data changes externally
    window.addEventListener('app:datachanged', () => {
      load();
      refresh();
    });
  }

  // ---------- Sample data ----------
  function ensureSampleData() {
    if (seeded) return;

    const d = new Date();
    const iso = (offset) => {
      const dt = new Date(d);
      dt.setDate(dt.getDate() - offset);
      return dt.toISOString().slice(0, 10);
    };

    const samples = [
      { type: 'income', amount: 4200, category: 'salary', note: 'Monthly salary', date: iso(2) },
      { type: 'expense', amount: 86.4, category: 'food', note: 'Grocery shopping - Tesco', date: iso(0) },
      { type: 'expense', amount: 23.5, category: 'food', note: 'Restaurant dinner', date: iso(1) },
      { type: 'expense', amount: 45.0, category: 'transport', note: 'Uber ride to airport', date: iso(1) },
      { type: 'expense', amount: 16.99, category: 'entertainment', note: 'Netflix subscription', date: iso(3) },
      { type: 'expense', amount: 120.0, category: 'utilities', note: 'Electricity bill', date: iso(4) },
      { type: 'expense', amount: 64.2, category: 'shopping', note: 'Amazon order - headphones', date: iso(5) },
      { type: 'expense', amount: 56.0, category: 'transport', note: 'Fuel refill', date: iso(6) },
      { type: 'expense', amount: 18.75, category: 'health', note: 'Pharmacy - medicines', date: iso(7) },
      { type: 'expense', amount: 250.0, category: 'housing', note: 'Apartment rent', date: iso(8) },
      { type: 'expense', amount: 39.99, category: 'education', note: 'Online course - Udemy', date: iso(10) }
    ];

    transactions = samples.map((s) => ({
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ...s,
      createdAt: Date.now()
    }));

    budgets = { food: 400, transport: 200, entertainment: 80, shopping: 300 };
    seeded = true;
    save();
  }

  // ---------- Init ----------
  function init() {
    // Initialize storage (local). If Firebase config is appended on the page,
    // Storage.init picks it up for real-time sync.
    Storage.init(
      (typeof window.EXPENSEEASE_FIREBASE === 'object' && window.EXPENSEEASE_FIREBASE) ||
      undefined
    );
    load();
    ensureSampleData();

    el('txnDate').value = today();
    bindEvents();
    showView('dashboard');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());