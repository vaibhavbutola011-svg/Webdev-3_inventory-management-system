/* StockPilot – Inventory dashboard (vanilla JS) */
(() => {
  // Same-origin API (Express serves this frontend). Falls back to localhost:5000
  // if the page is opened directly from the filesystem.
  const API_BASE = location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmtMoney = (n) =>
    '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');

  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const titles = {
    dashboard: 'Dashboard',
    products: 'All Products',
    add: 'Add Product',
    lowstock: 'Low Stock',
    reports: 'Inventory Reports',
  };

  const state = {
    view: 'dashboard',
    page: 1,
    products: [], // current page, for modal lookups
    summary: [],
    lowItems: [],
  };

  /* ---------------- API helper ---------------- */
  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(API_BASE + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
    } catch (e) {
      throw new Error('Cannot reach the server. Is the backend running?');
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || `Request failed (${res.status})`);
      err.errors = data && data.errors;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ---------------- Toasts ---------------- */
  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  }

  /* ---------------- Navigation ---------------- */
  function showView(name) {
    state.view = name;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === name));
    $('#pageTitle').textContent = titles[name];
    $('#sidebar').classList.remove('open');
    window.scrollTo({ top: 0 });

    if (name === 'dashboard' || name === 'reports') loadSummary();
    if (name === 'dashboard' || name === 'lowstock') loadLowStock();
    if (name === 'products') loadProducts();
  }

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav) {
      e.preventDefault();
      showView(nav.dataset.view);
    }
  });
  $('#statLowCard').addEventListener('click', () => showView('lowstock'));
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  /* ---------------- Stock status ---------------- */
  function statusOf(p) {
    if (p.quantity === 0) return { cls: 'out', label: 'Out of Stock' };
    if (p.quantity <= p.reorderLevel) return { cls: 'low', label: 'Low Stock' };
    return { cls: 'ok', label: 'In Stock' };
  }

  /* ---------------- Products table ---------------- */
  function filterParams() {
    const p = new URLSearchParams();
    const search = $('#globalSearch').value.trim();
    const category = $('#filterCategory').value;
    const min = $('#filterMin').value;
    const max = $('#filterMax').value;
    if (search) p.set('search', search);
    if (category) p.set('category', category);
    if (min !== '') p.set('minPrice', min);
    if (max !== '') p.set('maxPrice', max);
    p.set('sortBy', $('#sortBy').value);
    p.set('order', $('#sortOrder').value);
    p.set('limit', $('#pageLimit').value);
    p.set('page', state.page);
    return p;
  }

  async function loadProducts() {
    const body = $('#productsBody');
    body.innerHTML = `<tr><td colspan="9" class="empty">Loading…</td></tr>`;
    try {
      const data = await api('/products?' + filterParams().toString());
      // If the page became empty (e.g. after deleting the last item on it), step back
      if (data.products.length === 0 && data.total > 0 && state.page > 1) {
        state.page = data.totalPages;
        return loadProducts();
      }
      state.products = data.products;
      renderProducts(data);
    } catch (err) {
      body.innerHTML = `<tr><td colspan="9" class="empty">${esc(err.message)}</td></tr>`;
    }
  }

  function renderProducts(data) {
    const body = $('#productsBody');
    if (!data.products.length) {
      body.innerHTML = `<tr><td colspan="9" class="empty">No products found. Try changing the filters or add a new product.</td></tr>`;
    } else {
      body.innerHTML = data.products
        .map((p) => {
          const st = statusOf(p);
          return `<tr>
            <td class="pname">${esc(p.name)}</td>
            <td class="sku">${esc(p.sku)}</td>
            <td><span class="tag">${esc(p.category)}</span></td>
            <td class="num">${fmtMoney(p.price)}</td>
            <td class="num ${st.cls !== 'ok' ? 'qty-low' : ''}">${fmtNum(p.quantity)}</td>
            <td class="num">${fmtNum(p.reorderLevel)}</td>
            <td>${esc(p.supplier)}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
            <td><div class="actions">
              <button class="icon-btn stock" data-act="stock" data-id="${p.id}">± Stock</button>
              <button class="icon-btn" data-act="edit" data-id="${p.id}">Edit</button>
              <button class="icon-btn danger" data-act="delete" data-id="${p.id}">Delete</button>
            </div></td>
          </tr>`;
        })
        .join('');
    }
    renderPagination(data);
  }

  function renderPagination({ total, page, totalPages, count }) {
    const el = $('#pagination');
    if (!total) { el.innerHTML = ''; return; }
    const limit = Number($('#pageLimit').value);
    const from = (page - 1) * limit + 1;
    const to = from + count - 1;

    const pages = [];
    const add = (n) => pages.push(`<button class="${n === page ? 'on' : ''}" data-page="${n}">${n}</button>`);
    const dots = () => pages.push('<button disabled>…</button>');
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) add(i);
    } else {
      add(1);
      if (page > 3) dots();
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) add(i);
      if (page < totalPages - 2) dots();
      add(totalPages);
    }

    el.innerHTML = `
      <div class="info">Showing ${from}–${to} of ${total} products</div>
      <div class="pager">
        <button data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>
        ${pages.join('')}
        <button data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>›</button>
      </div>`;
  }

  $('#pagination').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-page]');
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    loadProducts();
  });

  // Filter controls
  const resetAndLoad = () => { state.page = 1; loadProducts(); };
  ['filterCategory', 'sortBy', 'sortOrder', 'pageLimit'].forEach((id) => $('#' + id).addEventListener('change', resetAndLoad));
  let debounce;
  const debounced = (fn) => { clearTimeout(debounce); debounce = setTimeout(fn, 300); };
  ['filterMin', 'filterMax'].forEach((id) => $('#' + id).addEventListener('input', () => debounced(resetAndLoad)));
  $('#clearFilters').addEventListener('click', () => {
    $('#globalSearch').value = '';
    $('#filterCategory').value = '';
    $('#filterMin').value = '';
    $('#filterMax').value = '';
    $('#sortBy').value = 'createdAt';
    $('#sortOrder').value = 'asc';
    resetAndLoad();
  });

  // Global search: jump to the products table and filter
  $('#globalSearch').addEventListener('input', () => {
    debounced(() => {
      state.page = 1;
      if (state.view !== 'products') showView('products');
      else loadProducts();
    });
  });

  /* ---------------- Row actions ---------------- */
  $('#productsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    handleAction(btn.dataset.act, btn.dataset.id, state.products);
  });
  $('#lowBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    handleAction(btn.dataset.act, btn.dataset.id, state.lowItems);
  });
  $('#dashLow').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    handleAction(btn.dataset.act, btn.dataset.id, state.lowItems);
  });

  function handleAction(act, id, list) {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    if (act === 'edit') openEdit(p);
    if (act === 'stock') openStock(p);
    if (act === 'delete') openDelete(p);
  }

  /* ---------------- Modals ---------------- */
  function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModals() { $$('.modal-backdrop').forEach((m) => (m.hidden = true)); document.body.style.overflow = ''; }
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
  $$('.modal-backdrop').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModals(); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

  /* ---------------- Form validation ---------------- */
  const RULES = {
    name: { label: 'Product name', type: 'text', min: 2 },
    sku: { label: 'SKU', type: 'text' },
    category: { label: 'Category', type: 'text' },
    supplier: { label: 'Supplier', type: 'text' },
    price: { label: 'Price', type: 'number' },
    quantity: { label: 'Quantity', type: 'int' },
    reorderLevel: { label: 'Reorder level', type: 'int' },
  };

  function validateForm(form) {
    let ok = true;
    const data = {};
    $$('input[name]', form).forEach((input) => {
      const rule = RULES[input.name];
      if (!rule) return;
      const raw = input.value.trim();
      let msg = '';
      if (raw === '') msg = `${rule.label} is required`;
      else if (rule.type === 'text' && rule.min && raw.length < rule.min) msg = `${rule.label} must be at least ${rule.min} characters`;
      else if (rule.type !== 'text') {
        const n = Number(raw);
        if (!Number.isFinite(n)) msg = `${rule.label} must be a number`;
        else if (n < 0) msg = `${rule.label} cannot be negative`;
        else if (rule.type === 'int' && !Number.isInteger(n)) msg = `${rule.label} must be a whole number`;
      }
      setFieldError(input, msg);
      if (msg) ok = false;
      else data[input.name] = rule.type === 'text' ? raw : Number(raw);
    });
    return ok ? data : null;
  }

  function setFieldError(input, msg) {
    input.classList.toggle('invalid', !!msg);
    const small = input.parentElement.querySelector('.err');
    if (small) small.textContent = msg || '';
  }

  function clearErrors(form) {
    $$('input', form).forEach((i) => setFieldError(i, ''));
  }

  // Map server-side errors back onto form fields where possible
  function showServerErrors(form, err) {
    const msgs = err.errors && err.errors.length ? err.errors : [err.message];
    let shown = false;
    if (err.status === 409) {
      const sku = $('input[name="sku"]', form);
      setFieldError(sku, err.message);
      shown = true;
    }
    toast(msgs[0], 'error');
    return shown;
  }

  // live-clear errors while typing
  document.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('invalid')) setFieldError(e.target, '');
  });

  /* ---------------- Add product ---------------- */
  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = validateForm(form);
    if (!data) return;
    const btn = $('#addSubmit');
    btn.disabled = true;
    try {
      const p = await api('/products', { method: 'POST', body: JSON.stringify(data) });
      toast(`"${p.name}" added successfully`, 'success');
      form.reset();
      clearErrors(form);
      await refreshCategories();
      showView('products');
    } catch (err) {
      showServerErrors(form, err);
    } finally {
      btn.disabled = false;
    }
  });
  $('#addForm').addEventListener('reset', () => clearErrors($('#addForm')));

  /* ---------------- Edit product ---------------- */
  function openEdit(p) {
    const form = $('#editForm');
    clearErrors(form);
    $('#editId').value = p.id;
    $('#editName').value = p.name;
    $('#editSku').value = p.sku;
    $('#editCategory').value = p.category;
    $('#editSupplier').value = p.supplier;
    $('#editPrice').value = p.price;
    $('#editQuantity').value = p.quantity;
    $('#editReorder').value = p.reorderLevel;
    openModal('#editModal');
    $('#editName').focus();
  }

  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = validateForm(form);
    if (!data) return;
    const btn = $('#editSubmit');
    btn.disabled = true;
    try {
      const p = await api(`/products/${$('#editId').value}`, { method: 'PUT', body: JSON.stringify(data) });
      toast(`"${p.name}" updated`, 'success');
      closeModals();
      await refreshAll();
    } catch (err) {
      showServerErrors(form, err);
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Delete product ---------------- */
  function openDelete(p) {
    $('#delId').value = p.id;
    $('#delName').textContent = p.name;
    openModal('#deleteModal');
  }

  $('#delConfirm').addEventListener('click', async () => {
    const btn = $('#delConfirm');
    btn.disabled = true;
    try {
      await api(`/products/${$('#delId').value}`, { method: 'DELETE' });
      toast('Product deleted', 'success');
      closeModals();
      await refreshAll();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Stock adjustment ---------------- */
  let stockProduct = null;

  function openStock(p) {
    stockProduct = p;
    $('#stockId').value = p.id;
    $('#stockName').textContent = `${p.name} (${p.sku})`;
    $('#stockCurrent').textContent = fmtNum(p.quantity);
    $('#stockReorder').textContent = fmtNum(p.reorderLevel);
    $('#stockChange').value = 1;
    $('#stockErr').textContent = '';
    updateStockPreview();
    openModal('#stockModal');
    $('#stockChange').focus();
    $('#stockChange').select();
  }

  function stockChangeValue() {
    const raw = $('#stockChange').value.trim();
    if (raw === '') return NaN;
    return Number(raw);
  }

  function updateStockPreview() {
    const el = $('#stockPreview');
    const change = stockChangeValue();
    const apply = $('#stockApply');
    $('#stockErr').textContent = '';
    if (!stockProduct || !Number.isInteger(change) || change === 0) {
      el.textContent = 'Enter a whole number other than 0.';
      apply.disabled = true;
      return;
    }
    const next = stockProduct.quantity + change;
    if (next < 0) {
      el.innerHTML = `<span class="down">Not allowed: stock would drop to ${next}.</span>`;
      apply.disabled = true;
      return;
    }
    apply.disabled = false;
    el.innerHTML = `New stock: <span class="${change > 0 ? 'up' : 'down'}">${fmtNum(stockProduct.quantity)} ${change > 0 ? '+' : '−'} ${fmtNum(Math.abs(change))} = ${fmtNum(next)}</span>`;
  }

  $('#stockChange').addEventListener('input', updateStockPreview);
  $('#stockMinus').addEventListener('click', () => { $('#stockChange').value = (stockChangeValue() || 0) - 1; updateStockPreview(); });
  $('#stockPlus').addEventListener('click', () => { $('#stockChange').value = (stockChangeValue() || 0) + 1; updateStockPreview(); });
  $$('.chip[data-q]').forEach((c) => c.addEventListener('click', () => {
    $('#stockChange').value = (stockChangeValue() || 0) + Number(c.dataset.q);
    updateStockPreview();
  }));

  $('#stockApply').addEventListener('click', async () => {
    const change = stockChangeValue();
    const btn = $('#stockApply');
    btn.disabled = true;
    try {
      const res = await api(`/products/${$('#stockId').value}/stock`, { method: 'PATCH', body: JSON.stringify({ change }) });
      toast(`${res.product.name}: stock is now ${res.product.quantity}`, 'success');
      closeModals();
      await refreshAll();
    } catch (err) {
      $('#stockErr').textContent = err.message;
      btn.disabled = false;
    }
  });

  /* ---------------- Summary / dashboard / reports ---------------- */
  async function loadSummary() {
    try {
      const data = await api('/products/summary');
      state.summary = data.summary;
      renderSummary();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function barRows(rows, key, fmt, alt) {
    if (!rows.length) return '<div class="mini-empty">No data yet.</div>';
    const max = Math.max(...rows.map((r) => r[key]), 1);
    return rows
      .map((r) => `<div class="bar-row">
        <div class="bar-label" title="${esc(r._id)}">${esc(r._id)}</div>
        <div class="bar-track"><div class="bar-fill ${alt ? 'alt' : ''}" data-w="${(r[key] / max) * 100}"></div></div>
        <div class="bar-val">${fmt(r[key])}</div>
      </div>`)
      .join('');
  }

  function animateBars() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$('.bar-fill').forEach((b) => (b.style.width = b.dataset.w + '%'));
    }));
  }

  function renderSummary() {
    const rows = state.summary;
    const totalProducts = rows.reduce((s, r) => s + r.totalItems, 0);
    const totalQty = rows.reduce((s, r) => s + r.totalQuantity, 0);
    const totalValue = rows.reduce((s, r) => s + r.totalStockValue, 0);

    $('#statProducts').textContent = fmtNum(totalProducts);
    $('#statQty').textContent = fmtNum(totalQty);
    $('#statValue').textContent = fmtMoney(totalValue);

    $('#dashChart').innerHTML = barRows(rows, 'totalStockValue', fmtMoney);
    $('#chartValue').innerHTML = barRows(rows, 'totalStockValue', fmtMoney);
    $('#chartQty').innerHTML = barRows(rows, 'totalQuantity', fmtNum, true);

    $('#reportBody').innerHTML = rows.length
      ? rows.map((r) => `<tr>
          <td><span class="tag">${esc(r._id)}</span></td>
          <td class="num">${fmtNum(r.totalItems)}</td>
          <td class="num">${fmtNum(r.totalQuantity)}</td>
          <td class="num">${fmtMoney(r.totalStockValue)}</td>
          <td class="num">${fmtMoney(r.avgPrice)}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty">No inventory data yet.</td></tr>`;

    $('#reportFoot').innerHTML = rows.length
      ? `<tr><td>Total</td><td class="num">${fmtNum(totalProducts)}</td><td class="num">${fmtNum(totalQty)}</td><td class="num">${fmtMoney(totalValue)}</td><td class="num">–</td></tr>`
      : '';

    animateBars();
  }

  /* ---------------- Low stock ---------------- */
  async function loadLowStock() {
    try {
      const data = await api('/products/low-stock');
      state.lowItems = data.lowStockItems;
      renderLowStock(data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderLowStock({ count, lowStockItems }) {
    $('#statLow').textContent = fmtNum(count);
    const badge = $('#navLowBadge');
    badge.textContent = count;
    badge.hidden = count === 0;

    const alert = $('#lowAlert');
    alert.hidden = false;
    if (count > 0) {
      alert.className = 'alert alert-warn';
      alert.textContent = `⚠ Warning: ${count} product${count === 1 ? ' is' : 's are'} at or below the reorder level. Restock soon to avoid running out.`;
    } else {
      alert.className = 'alert alert-ok';
      alert.textContent = '✓ All products are above their reorder levels.';
    }

    $('#lowBody').innerHTML = count
      ? lowStockItems.map((p) => {
          const short = p.reorderLevel - p.quantity;
          return `<tr>
            <td class="pname">${esc(p.name)}</td>
            <td class="sku">${esc(p.sku)}</td>
            <td><span class="tag">${esc(p.category)}</span></td>
            <td class="num qty-low">${fmtNum(p.quantity)}</td>
            <td class="num">${fmtNum(p.reorderLevel)}</td>
            <td class="num">${short >= 0 ? fmtNum(short) : 0}</td>
            <td>${esc(p.supplier)}</td>
            <td><div class="actions">
              <button class="icon-btn stock" data-act="stock" data-id="${p.id}">Restock</button>
              <button class="icon-btn" data-act="edit" data-id="${p.id}">Edit</button>
            </div></td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="8" class="empty">Nothing to restock right now. 🎉</td></tr>`;

    $('#dashLow').innerHTML = count
      ? lowStockItems.slice(0, 6).map((p) => `<div class="mini-item">
          <div><div class="n">${esc(p.name)}</div><div class="s">${esc(p.sku)} · ${fmtNum(p.quantity)} left (reorder at ${fmtNum(p.reorderLevel)})</div></div>
          <button class="icon-btn stock" data-act="stock" data-id="${p.id}">Restock</button>
        </div>`).join('')
      : '<div class="mini-empty">All stock levels look healthy.</div>';
  }

  /* ---------------- Categories (filter + datalist) ---------------- */
  async function refreshCategories() {
    try {
      const data = await api('/products/summary');
      state.summary = data.summary;
      const cats = data.summary.map((r) => r._id).sort((a, b) => a.localeCompare(b));
      const select = $('#filterCategory');
      const current = select.value;
      select.innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if (cats.includes(current)) select.value = current;
      $('#categoryList').innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
    } catch (_) { /* surfaced elsewhere */ }
  }

  /* ---------------- Refresh ---------------- */
  async function refreshAll() {
    await refreshCategories();
    const tasks = [loadLowStock()];
    if (state.view === 'products') tasks.push(loadProducts());
    if (state.view === 'dashboard' || state.view === 'reports') renderSummary();
    await Promise.all(tasks);
  }

  $('#refreshBtn').addEventListener('click', async () => {
    const ico = $('#refreshIco');
    ico.classList.add('spin');
    await refreshAll();
    ico.classList.remove('spin');
    toast('Data refreshed', 'success');
  });

  /* ---------------- Init ---------------- */
  (async function init() {
    await refreshCategories();
    renderSummary();
    showView('dashboard');
  })();
})();
