(function () {
  const content = document.getElementById('content');
  const title = document.getElementById('title');
  const backBtn = document.getElementById('backBtn');
  const search = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');
  const dashboard = document.getElementById('dashboard');

  const tables = window.TABLES || [];
  let currentTableId = null;
  let arrivedView = false;

  // --- Հաճախելիության պահպանում (Supabase + localStorage կեշ) ---
  const STORAGE_KEY = 'arsen_aren_attendance_v1';
  const QUEUE_KEY = 'arsen_aren_queue_v1';
  const REMOTE = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);

  function loadJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }
  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  let attended = loadJson(STORAGE_KEY);   // {key: true}
  let queue = loadJson(QUEUE_KEY);        // չսինխրոնացված գրառումներ {key: bool}

  function saveAttendance() { saveJson(STORAGE_KEY, attended); }
  function saveQueue() { saveJson(QUEUE_KEY, queue); }

  function keyFor(tableId, index) { return tableId + ':' + index; }
  function isAttended(tableId, index) { return !!attended[keyFor(tableId, index)]; }

  function toggleAttended(tableId, index) {
    const k = keyFor(tableId, index);
    const val = !attended[k];
    if (val) attended[k] = true; else delete attended[k];
    saveAttendance();
    updateDashboard();

    if (REMOTE) {
      queue[k] = val;
      saveQueue();
      remoteSet(k, val)
        .then(() => { if (queue[k] === val) { delete queue[k]; saveQueue(); } })
        .catch(() => { /* մնում է հերթում, կփորձենք կրկին */ });
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
      // remote-ը ճշմարտության աղբյուր է, բայց տեղական չսինխրոնացված գրառումները վերևից
      const merged = Object.assign({}, remote);
      Object.keys(queue).forEach(k => { if (queue[k]) merged[k] = true; else delete merged[k]; });
      const changed = sig(merged) !== sig(attended);
      attended = merged;
      saveAttendance();
      if (changed) { updateDashboard(); rerender(); }
    } catch (e) { /* պահում ենք կեշը */ }
  }

  function rerender() {
    const q = search.value.trim();
    if (arrivedView) renderArrived();
    else if (q) renderSearch(q);
    else if (currentTableId) renderTable(currentTableId);
    else renderTables();
  }

  function totalGuests() {
    return tables.reduce((s, t) => s + t.guests.length, 0);
  }
  function attendedCount() {
    let n = 0;
    tables.forEach(t => t.guests.forEach((_, i) => { if (isAttended(t.id, i)) n++; }));
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
        <span class="stat-label">Եկել են ›</span>
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

  function normalize(str) {
    return translit(str).trim();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

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

  // Ստեղծում է հյուրի տող՝ չեկ-նշումով
  function guestRow(name, tableId, index, opts) {
    opts = opts || {};
    const row = document.createElement('div');
    row.className = 'guest-row' + (isAttended(tableId, index) ? ' attended' : '');

    const left = opts.indexBadge
      ? `<span class="idx">${index + 1}</span>`
      : '';
    const right = opts.tableTag
      ? `<span class="table-tag">Սեղան ${tableId}</span>`
      : '';
    const displayName = opts.query ? highlight(name, opts.query) : escapeHtml(name);

    row.innerHTML = `
      ${left}
      <span class="check" aria-hidden="true">✓</span>
      <span class="name">${displayName}</span>
      ${right}
    `;
    row.addEventListener('click', () => {
      toggleAttended(tableId, index);
      row.classList.toggle('attended', isAttended(tableId, index));
    });
    return row;
  }

  function renderTables() {
    currentTableId = null;
    arrivedView = false;
    title.textContent = 'Սեղաններ';
    backBtn.hidden = true;

    const grid = document.createElement('div');
    grid.className = 'tables-grid';
    tables.forEach(t => {
      const arrived = t.guests.reduce((s, _, i) => s + (isAttended(t.id, i) ? 1 : 0), 0);
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

  // Պ.ե-ի ցուցակ՝ ըստ սեղանների (միայն եկածները, դատարկ սեղանները բաց ենք թողնում)
  function renderArrived() {
    currentTableId = null;
    arrivedView = true;
    title.textContent = 'Եկել են';
    backBtn.hidden = false;
    content.innerHTML = '';

    const groups = tables
      .map(t => ({
        t,
        arr: t.guests
          .map((name, i) => ({ name, i }))
          .filter(g => isAttended(t.id, g.i))
      }))
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
      arr.forEach(g => list.appendChild(guestRow(g.name, t.id, g.i, {})));
      content.appendChild(list);
    });
  }

  function renderTable(id) {
    const table = tables.find(t => t.id === id);
    if (!table) return renderTables();
    currentTableId = id;
    arrivedView = false;
    title.textContent = `Սեղան ${id}`;
    backBtn.hidden = false;

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
    table.guests.forEach((name, i) => {
      list.appendChild(guestRow(name, id, i, { indexBadge: true }));
    });
    content.appendChild(list);
  }

  function renderSearch(query) {
    const q = normalize(query);
    const results = [];
    tables.forEach(t => {
      t.guests.forEach((name, i) => {
        if (normalize(name).includes(q)) {
          results.push({ name, tableId: t.id, index: i });
        }
      });
    });

    results.sort((a, b) => {
      const ai = normalize(a.name).indexOf(q);
      const bi = normalize(b.name).indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, 'hy');
    });

    arrivedView = false;
    title.textContent = 'Որոնում';
    backBtn.hidden = false;

    content.innerHTML = '';
    const titleEl = document.createElement('div');
    titleEl.className = 'section-title';
    titleEl.textContent = results.length
      ? `Գտնված է՝ ${results.length}`
      : 'Ոչինչ չի գտնվել';
    content.appendChild(titleEl);

    if (results.length === 0) return;

    const list = document.createElement('div');
    list.className = 'guest-list';
    results.forEach(r => {
      list.appendChild(guestRow(r.name, r.tableId, r.index, { tableTag: true, query: query }));
    });
    content.appendChild(list);
  }

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

  updateDashboard();
  renderTables();

  if (REMOTE) {
    flushQueue().then(syncFromRemote);
    setInterval(syncFromRemote, 12000);       // պարբերական սինխրոն
    window.addEventListener('focus', syncFromRemote);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncFromRemote();
    });
  }
})();
