(function () {
  const content = document.getElementById('content');
  const title = document.getElementById('title');
  const backBtn = document.getElementById('backBtn');
  const search = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');

  const tables = window.TABLES || [];
  let currentTableId = null;

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
