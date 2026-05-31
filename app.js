(function () {
  const content = document.getElementById('content');
  const title = document.getElementById('title');
  const backBtn = document.getElementById('backBtn');
  const editBtn = document.getElementById('editBtn');
  const search = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');
  const dashboard = document.getElementById('dashboard');
  const searchWrap = document.querySelector('.search-wrap');
  const dashWrap = dashboard;

  // window.TABLES — մուտքային ստատիկ տվյալներ։ Տուրինք յուրաքանչյուր հյուրի կայուն ID։
  function genId() {
    return 'g_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }
  const tables = (window.TABLES || []).map(t => ({
    id: t.id,
    guests: (t.guests || []).map(g =>
      typeof g === 'string' ? { id: genId(), name: g } : { id: g.id || genId(), name: g.name || '' }
    )
  }));

  let currentTableId = null;
  let arrivedView = false;
  let editMode = false;

  // --- Հաճախելիության պահպանում (Supabase + localStorage կեշ) ---
  const STORAGE_KEY = 'arsen_aren_attendance_v2';
  const QUEUE_KEY = 'arsen_aren_queue_v2';
  const REMOTE = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);

  function loadJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }
  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  let attended = loadJson(STORAGE_KEY);   // {guestId: true}
  let queue = loadJson(QUEUE_KEY);

  function saveAttendance() { saveJson(STORAGE_KEY, attended); }
  function saveQueue() { saveJson(QUEUE_KEY, queue); }

  function isAttendedId(id) { return !!attended[id]; }

  function toggleAttendedId(id) {
    const val = !attended[id];
    if (val) attended[id] = true; else delete attended[id];
    saveAttendance();
    updateDashboard();

    if (REMOTE) {
      queue[id] = val;
      saveQueue();
      remoteSet(id, val)
        .then(() => { if (queue[id] === val) { delete queue[id]; saveQueue(); } })
        .catch(() => {});
    }
  }

  // --- Supabase REST ---
  function restHeaders(extra) {
    return Object.assign({
      'apikey': window.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    }, extra || {});
  }
  function restBase() {
    return window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/attendance';
  }
  function rosterBase() {
    return window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/roster';
  }
  async function remoteLoad() {
    const res = await fetch(restBase() + '?select=guest_key,attended', { headers: restHeaders() });
    if (!res.ok) throw new Error('load ' + res.status);
    const rows = await res.json();
    const map = {};
    rows.forEach(r => { if (r.attended) map[r.guest_key] = true; });
    return map;
  }
  async function remoteSet(key, val) {
    const res = await fetch(restBase(), {
      method: 'POST',
      headers: restHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ guest_key: key, attended: val, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error('set ' + res.status);
  }

  async function remoteLoadRoster() {
    try {
      const res = await fetch(rosterBase() + '?select=data&id=eq.1', { headers: restHeaders() });
      if (!res.ok) return null;
      const rows = await res.json();
      if (rows.length && Array.isArray(rows[0].data) && rows[0].data.length) return rows[0].data;
    } catch (e) {}
    return null;
  }
  async function remoteSaveRoster() {
    if (!REMOTE) return;
    const payload = tables.map(t => ({
      id: t.id,
      guests: t.guests.map(g => ({ id: g.id, name: g.name }))
    }));
    try {
      await fetch(rosterBase(), {
        method: 'POST',
        headers: restHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ id: 1, data: payload, updated_at: new Date().toISOString() })
      });
    } catch (e) {}
  }

  async function flushQueue() {
    if (!REMOTE) return;
    for (const k of Object.keys(queue)) {
      try { await remoteSet(k, !!queue[k]); delete queue[k]; saveQueue(); }
      catch (e) { break; }
    }
  }

  function sig(obj) { return Object.keys(obj).sort().join('|'); }

  async function syncFromRemote() {
    if (!REMOTE) return;
    try {
      const remote = await remoteLoad();
      const merged = Object.assign({}, remote);
      Object.keys(queue).forEach(k => { if (queue[k]) merged[k] = true; else delete merged[k]; });
      const changed = sig(merged) !== sig(attended);
      attended = merged;
      saveAttendance();
      if (changed) { updateDashboard(); if (!editMode) rerender(); }
    } catch (e) {}
  }

  function rerender() {
    const q = search.value.trim();
    if (editMode) renderEdit();
    else if (arrivedView) renderArrived();
    else if (q) renderSearch(q);
    else if (currentTableId) renderTable(currentTableId);
    else renderTables();
  }

  function totalGuests() {
    return tables.reduce((s, t) => s + t.guests.length, 0);
  }
  function attendedCount() {
    let n = 0;
    tables.forEach(t => t.guests.forEach(g => { if (isAttendedId(g.id)) n++; }));
    return n;
  }

  function updateDashboard() {
    dashboard.innerHTML = `
      <div class="stat-card stat-card--total">
        <span class="stat-num">${totalGuests()}</span>
        <span class="stat-label">Ընդամենը</span>
      </div>
      <div class="stat-card stat-card--arrived" id="arrivedCard" role="button" tabindex="0">
        <span class="stat-num">${attendedCount()}</span>
        <span class="stat-label">Եկել են</span>
        <svg class="stat-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 6 L15 12 L9 18"/>
        </svg>
      </div>
    `;
    const card = document.getElementById('arrivedCard');
    if (card) card.addEventListener('click', renderArrived);
  }

  // --- Տառադարձում՝ լատիներեն ↔ հայերեն ---
  const ARM_TO_LAT = {
    'ա':'a','բ':'b','գ':'g','դ':'d','ե':'e','զ':'z','է':'e','ը':'y',
    'թ':'t','ժ':'zh','ի':'i','լ':'l','խ':'kh','ծ':'ts','կ':'k','հ':'h',
    'ձ':'dz','ղ':'gh','ճ':'ch','մ':'m','յ':'y','ն':'n','շ':'sh','ո':'o',
    'չ':'ch','պ':'p','ջ':'j','ռ':'r','ս':'s','վ':'v','տ':'t','ր':'r',
    'ց':'ts','փ':'p','ք':'k','օ':'o','ֆ':'f','և':'ev'
  };
  function translit(s) {
    s = (s || '').toString().toLowerCase().replace(/ու/g, 'u');
    let out = '';
    for (const c of s) out += ARM_TO_LAT[c] !== undefined ? ARM_TO_LAT[c] : c;
    return out;
  }
  function normalize(str) { return translit(str).trim(); }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function highlight(name, query) {
    const safe = escapeHtml(name);
    if (!query) return safe;
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp('(' + q + ')', 'ig');
      if (re.test(safe)) return safe.replace(new RegExp('(' + q + ')', 'ig'), '<mark>$1</mark>');
    } catch (e) {}
    return safe;
  }

  function guestRow(g, tableId, indexBadge, opts) {
    opts = opts || {};
    const row = document.createElement('div');
    row.className = 'guest-row' + (isAttendedId(g.id) ? ' attended' : '');
    const left = (indexBadge !== null && indexBadge !== undefined) ? `<span class="idx">${indexBadge}</span>` : '';
    const right = opts.tableTag ? `<span class="table-tag">Սեղան ${tableId}</span>` : '';
    const displayName = opts.query ? highlight(g.name, opts.query) : escapeHtml(g.name);
    row.innerHTML = `
      ${left}
      <span class="check" aria-hidden="true">✓</span>
      <span class="name">${displayName}</span>
      ${right}
    `;
    row.addEventListener('click', () => {
      toggleAttendedId(g.id);
      row.classList.toggle('attended', isAttendedId(g.id));
    });
    return row;
  }

  function setTopbar({ back, edit }) {
    backBtn.hidden = !back;
    editBtn.hidden = !edit;
    editBtn.classList.toggle('active', editMode);
  }
  function setChromeVisible(visible) {
    searchWrap.style.display = visible ? '' : 'none';
    dashWrap.style.display = visible ? '' : 'none';
  }

  function renderTables() {
    currentTableId = null;
    arrivedView = false;
    editMode = false;
    title.textContent = 'Սեղաններ';
    setTopbar({ back: false, edit: true });
    setChromeVisible(true);

    const grid = document.createElement('div');
    grid.className = 'tables-grid';
    tables.forEach(t => {
      const arrived = t.guests.reduce((s, g) => s + (isAttendedId(g.id) ? 1 : 0), 0);
      const card = document.createElement('div');
      card.className = 'table-card';
      card.innerHTML = `
        <span class="num">${t.id}</span>
        <span class="label">Սեղան</span>
        <span class="count"><span class="arrived-num${arrived > 0 ? ' on' : ''}">${arrived}</span>/${t.guests.length} եկել է</span>
      `;
      card.addEventListener('click', () => renderTable(t.id));
      grid.appendChild(card);
    });
    content.innerHTML = '';
    content.appendChild(grid);
  }

  function renderArrived() {
    currentTableId = null;
    arrivedView = true;
    editMode = false;
    title.textContent = 'Եկել են';
    setTopbar({ back: true, edit: false });
    setChromeVisible(true);
    content.innerHTML = '';

    const groups = tables
      .map(t => ({ t, arr: t.guests.filter(g => isAttendedId(g.id)) }))
      .filter(g => g.arr.length > 0);

    if (groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Դեռ ոչ ոք չի եկել';
      content.appendChild(empty);
      return;
    }
    groups.forEach(({ t, arr }) => {
      const head = document.createElement('div');
      head.className = 'section-title';
      head.textContent = `Սեղան ${t.id} · ${arr.length}`;
      content.appendChild(head);
      const list = document.createElement('div');
      list.className = 'guest-list';
      arr.forEach(g => list.appendChild(guestRow(g, t.id, null, {})));
      content.appendChild(list);
    });
  }

  function renderTable(id) {
    const table = tables.find(t => t.id === id);
    if (!table) return renderTables();
    currentTableId = id;
    arrivedView = false;
    editMode = false;
    title.textContent = `Սեղան ${id}`;
    setTopbar({ back: true, edit: false });
    setChromeVisible(true);
    content.innerHTML = '';
    if (table.guests.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Դեռ ոչ ոք չկա';
      content.appendChild(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'guest-list';
    table.guests.forEach((g, i) => list.appendChild(guestRow(g, id, i + 1, {})));
    content.appendChild(list);
  }

  function renderSearch(query) {
    const q = normalize(query);
    const results = [];
    tables.forEach(t => {
      t.guests.forEach(g => {
        if (normalize(g.name).includes(q)) results.push({ g, tableId: t.id });
      });
    });
    results.sort((a, b) => {
      const ai = normalize(a.g.name).indexOf(q);
      const bi = normalize(b.g.name).indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.g.name.localeCompare(b.g.name, 'hy');
    });

    arrivedView = false;
    editMode = false;
    title.textContent = 'Որոնում';
    setTopbar({ back: true, edit: false });
    setChromeVisible(true);
    content.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'section-title';
    titleEl.textContent = results.length ? `Գտնված է՝ ${results.length}` : 'Ոչինչ չի գտնվել';
    content.appendChild(titleEl);
    if (results.length === 0) return;
    const list = document.createElement('div');
    list.className = 'guest-list';
    results.forEach(r => list.appendChild(guestRow(r.g, r.tableId, null, { tableTag: true, query })));
    content.appendChild(list);
  }

  // === Խմբագրման ռեժիմ ===
  let saveTimer = null;
  let statusEl = null;
  function flashStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.add('show');
    clearTimeout(statusEl._t);
    statusEl._t = setTimeout(() => statusEl.classList.remove('show'), 1400);
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await remoteSaveRoster();
      flashStatus('Պահպանված է');
    }, 700);
  }

  function loadSortable() {
    if (window.Sortable) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function rebuildFromDOM() {
    const byId = {};
    tables.forEach(t => t.guests.forEach(g => { byId[g.id] = g; }));
    const newState = {};
    document.querySelectorAll('.edit-list').forEach(ul => {
      const tableId = parseInt(ul.dataset.tableId, 10);
      const arr = [];
      ul.querySelectorAll('.edit-row').forEach(li => {
        const id = li.dataset.id;
        if (byId[id]) arr.push(byId[id]);
      });
      newState[tableId] = arr;
    });
    tables.forEach(t => { if (newState[t.id]) t.guests = newState[t.id]; });
  }

  function editRow(g, tableId) {
    const li = document.createElement('li');
    li.className = 'edit-row';
    li.dataset.id = g.id;
    li.innerHTML = `
      <span class="edit-handle" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
        </svg>
      </span>
      <input class="edit-input" value="${escapeAttr(g.name)}" placeholder="Անուն">
      <button class="edit-remove" aria-label="Հեռացնել" type="button">×</button>
    `;
    const input = li.querySelector('.edit-input');
    input.addEventListener('input', () => { g.name = input.value; scheduleSave(); });
    li.querySelector('.edit-remove').addEventListener('click', () => {
      const t = tables.find(x => x.id === tableId);
      if (!t) return;
      const idx = t.guests.findIndex(x => x.id === g.id);
      if (idx >= 0) t.guests.splice(idx, 1);
      // հաճախելիության նշումը ևս հանենք
      if (attended[g.id]) {
        delete attended[g.id];
        saveAttendance();
        if (REMOTE) {
          queue[g.id] = false; saveQueue();
          remoteSet(g.id, false).then(() => { if (queue[g.id] === false) { delete queue[g.id]; saveQueue(); } }).catch(() => {});
        }
        updateDashboard();
      }
      li.remove();
      scheduleSave();
    });
    return li;
  }

  async function renderEdit() {
    currentTableId = null;
    arrivedView = false;
    editMode = true;
    title.textContent = 'Խմբագրել';
    setTopbar({ back: true, edit: true });
    setChromeVisible(false);
    content.innerHTML = '<div class="empty">Բեռնում…</div>';

    try { await loadSortable(); } catch (e) {}

    content.innerHTML = '';
    tables.forEach(t => {
      const sec = document.createElement('section');
      sec.className = 'edit-section';

      const head = document.createElement('h3');
      head.className = 'edit-head';
      head.textContent = `Սեղան ${t.id}`;
      sec.appendChild(head);

      const ul = document.createElement('ul');
      ul.className = 'edit-list';
      ul.dataset.tableId = t.id;
      t.guests.forEach(g => ul.appendChild(editRow(g, t.id)));
      sec.appendChild(ul);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'edit-add';
      addBtn.textContent = '+ Հյուր';
      addBtn.addEventListener('click', () => {
        const g = { id: genId(), name: '' };
        t.guests.push(g);
        const row = editRow(g, t.id);
        ul.appendChild(row);
        scheduleSave();
        const inp = row.querySelector('.edit-input');
        if (inp) inp.focus();
      });
      sec.appendChild(addBtn);

      content.appendChild(sec);

      if (window.Sortable) {
        new window.Sortable(ul, {
          group: 'guests',
          handle: '.edit-handle',
          animation: 150,
          forceFallback: true,
          fallbackTolerance: 5,
          onEnd: () => { rebuildFromDOM(); scheduleSave(); }
        });
      }
    });

    statusEl = document.createElement('div');
    statusEl.className = 'edit-status';
    content.appendChild(statusEl);
  }

  // --- Իրադարձություններ ---
  function handleSearch() {
    const q = search.value.trim();
    clearBtn.hidden = q.length === 0;
    if (q.length === 0) {
      if (currentTableId) renderTable(currentTableId);
      else renderTables();
      return;
    }
    renderSearch(q);
  }

  search.addEventListener('input', handleSearch);
  clearBtn.addEventListener('click', () => {
    search.value = '';
    clearBtn.hidden = true;
    search.focus();
    handleSearch();
  });
  backBtn.addEventListener('click', () => {
    search.value = '';
    clearBtn.hidden = true;
    renderTables();
  });
  editBtn.addEventListener('click', () => {
    if (editMode) renderTables();
    else renderEdit();
  });

  // --- Մեկնարկ ---
  updateDashboard();
  renderTables();

  if (REMOTE) {
    // 1) Ստանալ ռոստերը, եթե կա՝ կիրառել
    remoteLoadRoster().then(data => {
      if (data) {
        tables.length = 0;
        data.forEach(t => tables.push({
          id: t.id,
          guests: (t.guests || []).map(g => ({ id: g.id || genId(), name: g.name || '' }))
        }));
        updateDashboard();
        if (!editMode) rerender();
      } else {
        remoteSaveRoster();
      }
    });

    flushQueue().then(syncFromRemote);
    setInterval(syncFromRemote, 12000);
    window.addEventListener('focus', syncFromRemote);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncFromRemote();
    });
  }
})();
