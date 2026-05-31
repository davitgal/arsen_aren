(function () {
  const content = document.getElementById('content');
  const title = document.getElementById('title');
  const backBtn = document.getElementById('backBtn');
  const search = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');

  const tables = window.TABLES || [];
  let currentTableId = null;

  function normalize(str) {
    return (str || '').toString().toLowerCase().trim();
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
    return safe.replace(new RegExp('(' + q + ')', 'ig'), '<mark>$1</mark>');
  }

  function renderTables() {
    currentTableId = null;
    title.textContent = 'Սեղաններ';
    backBtn.hidden = true;

    const grid = document.createElement('div');
    grid.className = 'tables-grid';
    tables.forEach(t => {
      const card = document.createElement('div');
      card.className = 'table-card';
      card.innerHTML = `
        <span class="num">${t.id}</span>
        <span class="label">Սեղան</span>
        <span class="count">${t.guests.length} հյուր</span>
      `;
      card.addEventListener('click', () => renderTable(t.id));
      grid.appendChild(card);
    });
    content.innerHTML = '';
    content.appendChild(grid);
  }

  function renderTable(id) {
    const table = tables.find(t => t.id === id);
    if (!table) return renderTables();
    currentTableId = id;
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
      const row = document.createElement('div');
      row.className = 'guest-row';
      row.innerHTML = `
        <span class="idx">${i + 1}</span>
        <span class="name">${escapeHtml(name)}</span>
      `;
      list.appendChild(row);
    });
    content.appendChild(list);
  }

  function renderSearch(query) {
    const q = normalize(query);
    const results = [];
    tables.forEach(t => {
      t.guests.forEach(name => {
        if (normalize(name).includes(q)) {
          results.push({ name, tableId: t.id });
        }
      });
    });

    results.sort((a, b) => {
      const ai = normalize(a.name).indexOf(q);
      const bi = normalize(b.name).indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name, 'ru');
    });

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
      const row = document.createElement('div');
      row.className = 'guest-row';
      row.innerHTML = `
        <span class="name">${highlight(r.name, query)}</span>
        <span class="table-tag">Սեղան ${r.tableId}</span>
      `;
      row.addEventListener('click', () => {
        search.value = '';
        clearBtn.hidden = true;
        renderTable(r.tableId);
      });
      list.appendChild(row);
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

  renderTables();
})();
