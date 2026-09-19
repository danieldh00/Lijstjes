import api from './api.js';
import * as storage from './storage.js';
import * as sync from './sync.js';
import * as push from './push.js';

const appEl = document.getElementById('app');
const statusEl = document.getElementById('statusbar');

let paired = false;
let viaIngress = false;
let needsHaUrl = false;

function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Statusbalk ----------

function renderStatus(status) {
  statusEl.hidden = false;
  if (status.state === 'offline') {
    statusEl.className = 'statusbar offline';
    statusEl.textContent = status.pending
      ? `Offline — ${status.pending} wijziging${status.pending === 1 ? '' : 'en'} wachten op sync`
      : 'Offline — lokaal werken';
  } else if (status.state === 'error') {
    statusEl.className = 'statusbar error';
    statusEl.textContent = `Synchroniseren mislukt (probeer opnieuw zodra je online bent)`;
  } else if (status.state === 'syncing') {
    statusEl.className = 'statusbar';
    statusEl.textContent = 'Synchroniseren…';
  } else if (status.pending > 0) {
    statusEl.className = 'statusbar';
    statusEl.textContent = `${status.pending} wijziging${status.pending === 1 ? '' : 'en'} wachten op sync`;
  } else {
    statusEl.hidden = true;
  }
}

// ---------- Pairing ----------

function renderPairing(error) {
  appEl.innerHTML = '';
  appEl.appendChild(
    el(`
    <div class="pairing">
      <h1>Lijstjes koppelen</h1>
      <p>Dit toestel is nog niet gekoppeld aan je Home Assistant. Plak hieronder
      een <strong>Long-Lived Access Token</strong> (Home Assistant → je profiel →
      tabblad Beveiliging → Long-Lived Access Tokens → Token aanmaken). Er is
      geen apart account nodig — dit token koppelt de app aan je bestaande
      Home Assistant.</p>
      ${needsHaUrl ? `
        <label for="ha_url">Adres van je Home Assistant</label>
        <input id="ha_url" type="url" placeholder="http://homeassistant.local:8123" />
      ` : ''}
      <label for="ha_token">Long-Lived Access Token</label>
      <input id="ha_token" type="text" placeholder="eyJhbGciOi..." />
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <button class="primary" id="pair-btn">Koppelen</button>
      <p class="help">Eenmaal gekoppeld werkt dit toestel voortaan ook offline,
      bijvoorbeeld in de supermarkt zonder bereik — wijzigingen worden
      automatisch gesynchroniseerd zodra er weer internet is.</p>
    </div>
  `)
  );

  document.getElementById('pair-btn').addEventListener('click', async () => {
    const token = document.getElementById('ha_token').value.trim();
    const haUrlInput = document.getElementById('ha_url');
    const haUrl = haUrlInput ? haUrlInput.value.trim() : undefined;
    if (!token) {
      renderPairing('Vul een token in.');
      return;
    }
    try {
      await api.pair(haUrl, token);
      await checkStatusAndStart();
    } catch (err) {
      renderPairing(err.message);
    }
  });
}

// ---------- Overzicht ----------

function renderOverview() {
  const snapshot = storage.getSnapshot();
  appEl.innerHTML = '';

  const header = el(`
    <div class="topbar">
      <h1>Lijstjes</h1>
    </div>
  `);
  appEl.appendChild(header);

  if (!snapshot.lists.length) {
    appEl.appendChild(el(`<div class="empty">Nog geen lijstjes. Maak er hieronder een.</div>`));
  } else {
    for (const list of snapshot.lists) {
      const items = snapshot.items[list.entity_id] || [];
      const openCount = items.filter((i) => i.status !== 'completed').length;
      const card = el(`
        <a class="card list-card ${list.pending ? 'pending' : ''}" href="#/list/${encodeURIComponent(list.entity_id)}">
          <span class="name">${escapeHtml(list.name)}${list.pending ? ' (wordt aangemaakt…)' : ''}</span>
          <span class="count">${openCount}</span>
        </a>
      `);
      appEl.appendChild(card);
    }
  }

  const addForm = el(`
    <form class="add-form" id="add-list-form">
      <input type="text" id="new-list-name" placeholder="Nieuw lijstje, bv. Boodschappen" required />
      <button class="primary" type="submit">Toevoegen</button>
    </form>
  `);
  appEl.appendChild(addForm);

  document.getElementById('add-list-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-list-name');
    const name = input.value.trim();
    if (!name) return;
    sync.mutateAndSync(() => storage.addListLocal(name));
    input.value = '';
  });

  renderPushBanner();
}

function renderPushBanner() {
  if (viaIngress || !push.isSupported()) return;
  const permission = push.getPermissionState();
  if (permission === 'granted') return;

  const banner = el(`
    <div class="card">
      <div style="margin-bottom:10px;">
        🔔 Zet meldingen aan om te zien wanneer een lijstje vanuit Home
        Assistant wordt gewijzigd — ook als je de app niet open hebt staan.
      </div>
      <button class="secondary" id="enable-push-btn">Meldingen aanzetten</button>
    </div>
  `);
  appEl.appendChild(banner);

  document.getElementById('enable-push-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Bezig…';
    const ok = await push.enablePush();
    if (ok) {
      render();
    } else {
      e.target.disabled = false;
      e.target.textContent = 'Meldingen aanzetten';
      banner.querySelector('div').insertAdjacentHTML(
        'beforeend',
        '<br /><span style="color:var(--danger);">Toestemming geweigerd of niet beschikbaar — je kunt dit later alsnog aanzetten via de browserinstellingen van dit toestel.</span>'
      );
    }
  });
}

// ---------- Lijstdetail ----------

function formatDue(item) {
  if (item.due_datetime) return new Date(item.due_datetime).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
  if (item.due_date) return new Date(item.due_date).toLocaleDateString('nl-NL', { dateStyle: 'medium' });
  return null;
}

function renderListDetail(entityId) {
  const snapshot = storage.getSnapshot();
  const list = storage.findList(entityId);
  const items = snapshot.items[entityId] || [];
  appEl.innerHTML = '';

  appEl.appendChild(
    el(`
    <div class="topbar">
      <a class="back" href="#/">‹ Lijstjes</a>
      <h1>${escapeHtml(list ? list.name : 'Lijstje')}</h1>
      <span></span>
    </div>
  `)
  );

  const addForm = el(`
    <form class="add-form" id="add-item-form">
      <div class="field">
        <input type="text" id="new-item-summary" placeholder="Item toevoegen…" autocomplete="off" required />
        <div class="suggestions" id="item-suggestions" hidden></div>
      </div>
      <button class="primary" type="submit">+</button>
    </form>
  `);
  appEl.appendChild(addForm);

  const open = items.filter((i) => i.status !== 'completed');
  const done = items.filter((i) => i.status === 'completed');

  appEl.appendChild(renderItemList(entityId, open));

  if (done.length) {
    appEl.appendChild(el(`<div class="section-title">Afgevinkt</div>`));
    appEl.appendChild(renderItemList(entityId, done));
  }

  if (!items.length) {
    appEl.appendChild(el(`<div class="empty">Nog geen items in dit lijstje.</div>`));
  }

  document.getElementById('add-item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-item-summary');
    const summary = input.value.trim();
    if (!summary) return;
    sync.mutateAndSync(() => storage.addItemLocal(entityId, { summary }));
    input.value = '';
    input.dispatchEvent(new Event('input'));
  });

  bindItemSuggestions(entityId);
  bindItemActions(entityId);
}

// ---------- Voorspellende suggesties bij het toevoegen van een item ----------

function bindItemSuggestions(entityId) {
  const input = document.getElementById('new-item-summary');
  const box = document.getElementById('item-suggestions');
  const suggestState = { items: [], activeIndex: -1 };

  function close() {
    suggestState.items = [];
    suggestState.activeIndex = -1;
    box.hidden = true;
    box.innerHTML = '';
  }

  function paint() {
    box.innerHTML = '';
    if (!suggestState.items.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    suggestState.items.forEach((text, i) => {
      const btn = el(`<button type="button" class="${i === suggestState.activeIndex ? 'active' : ''}">${escapeHtml(text)}</button>`);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // voorkomt blur voordat de klik verwerkt wordt
        choose(text);
      });
      box.appendChild(btn);
    });
  }

  function choose(text) {
    input.value = text;
    close();
    input.focus();
  }

  input.addEventListener('input', () => {
    suggestState.items = input.value.trim() ? storage.getSuggestions(entityId, input.value) : [];
    suggestState.activeIndex = -1;
    paint();
  });

  input.addEventListener('keydown', (e) => {
    if (!suggestState.items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestState.activeIndex = (suggestState.activeIndex + 1) % suggestState.items.length;
      paint();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestState.activeIndex = (suggestState.activeIndex - 1 + suggestState.items.length) % suggestState.items.length;
      paint();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      choose(suggestState.items[Math.max(suggestState.activeIndex, 0)]);
    } else if (e.key === 'Enter' && suggestState.activeIndex >= 0) {
      e.preventDefault();
      choose(suggestState.items[suggestState.activeIndex]);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  input.addEventListener('blur', () => setTimeout(close, 100));
}

function renderItemList(entityId, items) {
  const wrap = el(`<div class="card" style="padding:0 16px;"></div>`);
  if (!items.length) return el(`<div></div>`);
  for (const item of items) {
    const due = formatDue(item);
    const row = el(`
      <div class="item-row ${item.status === 'completed' ? 'completed' : ''}" data-uid="${escapeHtml(item.uid)}">
        <button class="checkbox ${item.status === 'completed' ? 'checked' : ''}" data-action="toggle">${item.status === 'completed' ? '✓' : ''}</button>
        <div class="item-body" data-action="edit">
          <div class="item-summary">${escapeHtml(item.summary)}</div>
          ${item.description || due ? `
            <div class="item-meta">
              ${due ? `<span>📅 ${escapeHtml(due)}</span>` : ''}
              ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}
            </div>
          ` : ''}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-action="move-up" title="Omhoog">↑</button>
          <button class="icon-btn" data-action="move-down" title="Omlaag">↓</button>
          <button class="icon-btn" data-action="delete" title="Verwijderen">✕</button>
        </div>
      </div>
    `);
    wrap.appendChild(row);
  }
  return wrap;
}

function bindItemActions(entityId) {
  appEl.querySelectorAll('.item-row').forEach((row) => {
    const uid = row.dataset.uid;
    row.querySelector('[data-action="toggle"]').addEventListener('click', () => {
      const item = storage.findItem(entityId, uid);
      const nextStatus = item.status === 'completed' ? 'needs_action' : 'completed';
      sync.mutateAndSync(() => storage.updateItemLocal(entityId, uid, { status: nextStatus }));
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm('Item verwijderen?')) return;
      sync.mutateAndSync(() => storage.removeItemLocal(entityId, uid));
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      location.hash = `#/list/${encodeURIComponent(entityId)}/item/${encodeURIComponent(uid)}`;
    });
    row.querySelector('[data-action="move-up"]').addEventListener('click', () =>
      sync.mutateAndSync(() => storage.moveItemLocal(entityId, uid, -1))
    );
    row.querySelector('[data-action="move-down"]').addEventListener('click', () =>
      sync.mutateAndSync(() => storage.moveItemLocal(entityId, uid, 1))
    );
  });
}

// ---------- Item bewerken ----------

function renderItemEdit(entityId, uid) {
  const item = storage.findItem(entityId, uid);
  appEl.innerHTML = '';
  if (!item) {
    location.hash = `#/list/${encodeURIComponent(entityId)}`;
    return;
  }

  appEl.appendChild(
    el(`
    <div class="topbar">
      <a class="back" href="#/list/${encodeURIComponent(entityId)}">‹ Terug</a>
      <h1>Item bewerken</h1>
      <span></span>
    </div>
  `)
  );

  const dueDateValue = item.due_date || (item.due_datetime ? item.due_datetime.slice(0, 10) : '');

  const form = el(`
    <form class="item-form" id="item-edit-form">
      <label for="summary">Tekst</label>
      <input id="summary" type="text" value="${escapeHtml(item.summary)}" required />

      <label for="description">Omschrijving (optioneel)</label>
      <textarea id="description" rows="2">${escapeHtml(item.description || '')}</textarea>

      <label for="due_date">Einddatum (optioneel)</label>
      <input id="due_date" type="date" value="${escapeHtml(dueDateValue)}" />

      <div class="row">
        <button class="primary" type="submit">Opslaan</button>
        <button class="secondary" type="button" id="cancel-edit">Annuleren</button>
      </div>
    </form>
  `);
  appEl.appendChild(form);

  document.getElementById('cancel-edit').addEventListener('click', () => {
    location.hash = `#/list/${encodeURIComponent(entityId)}`;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const summary = document.getElementById('summary').value.trim();
    const description = document.getElementById('description').value.trim();
    const dueDate = document.getElementById('due_date').value;
    sync.mutateAndSync(() =>
      storage.updateItemLocal(entityId, uid, {
        summary,
        description,
        due_date: dueDate,
      })
    );
    location.hash = `#/list/${encodeURIComponent(entityId)}`;
  });
}

// ---------- Router ----------

function render() {
  if (!paired && !viaIngress) {
    renderPairing();
    return;
  }

  if (!storage.hasContent() && !navigator.onLine) {
    appEl.innerHTML = '';
    appEl.appendChild(
      el(`<div class="empty">Dit toestel is nog niet eerder online geweest met deze app.<br />
        Verbind eenmalig met internet om je lijstjes op te halen — daarna werkt alles ook offline.</div>`)
    );
    return;
  }

  const hash = location.hash || '#/';
  const itemMatch = hash.match(/^#\/list\/([^/]+)\/item\/([^/]+)$/);
  const listMatch = hash.match(/^#\/list\/([^/]+)$/);

  if (itemMatch) {
    renderItemEdit(decodeURIComponent(itemMatch[1]), decodeURIComponent(itemMatch[2]));
  } else if (listMatch) {
    renderListDetail(decodeURIComponent(listMatch[1]));
  } else {
    renderOverview();
  }
}

async function checkStatusAndStart() {
  try {
    const status = await api.status();
    paired = status.paired;
    viaIngress = status.viaIngress;
    needsHaUrl = status.needsHaUrl;
  } catch (err) {
    // Geen netwerk om de status te checken -- als er al lokale inhoud is,
    // gaan we er (terecht) van uit dat dit toestel al eerder gekoppeld was.
    paired = storage.hasContent();
  }

  if (paired || viaIngress) {
    sync.onChange(render);
    sync.onStatus(renderStatus);
    sync.init();

    // Toestemming was al eerder gegeven (bv. na een herinstallatie van de
    // app): stil opnieuw abonneren, zonder dat de gebruiker iets hoeft te
    // klikken -- de browser vraagt hier niet opnieuw om toestemming.
    if (!viaIngress && push.isSupported() && push.getPermissionState() === 'granted') {
      push.enablePush().catch(() => {});
    }
  }
  render();
}

window.addEventListener('hashchange', render);
checkStatusAndStart();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Geen secure context (plain http op een niet-localhost-adres) --
      // de app werkt gewoon door, alleen zonder shell-caching.
    });
  });
}
