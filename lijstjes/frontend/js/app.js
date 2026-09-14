import api from './api.js';
import * as storage from './storage.js';
import * as sync from './sync.js';
import * as push from './push.js';
import { uiIcon, listIconChip } from './icons.js';

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
  // Wordt ook rechtstreeks aangeroepen (met een foutmelding) buiten de router
  // om; de getekende DOM hoort dan bij geen enkele berekende signature meer.
  lastSignature = null;
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

function listSubtitle(list, total, openCount) {
  if (list.pending) return 'Wordt aangemaakt…';
  if (!total) return 'Leeg';
  if (!openCount) return 'Alles afgevinkt';
  const done = total - openCount;
  return done ? `${openCount} open · ${done} afgevinkt` : `${openCount} open`;
}

function renderOverview() {
  const snapshot = storage.getSnapshot();
  const lists = storage.getSortedLists();
  appEl.innerHTML = '';

  const header = el(`
    <div class="topbar">
      <h1>Lijstjes</h1>
    </div>
  `);
  appEl.appendChild(header);

  if (!lists.length) {
    appEl.appendChild(el(`<div class="empty">Nog geen lijstjes. Maak er hieronder een.</div>`));
  } else {
    for (const list of lists) {
      const items = snapshot.items[list.entity_id] || [];
      const openCount = items.filter((i) => i.status !== 'completed').length;
      const row = el(`
        <div class="card list-card-row ${list.pending ? 'pending' : ''}" data-entity-id="${escapeHtml(list.entity_id)}">
          <a class="list-card" href="#/list/${encodeURIComponent(list.entity_id)}">
            ${listIconChip(list.name)}
            <span class="list-text">
              <span class="name">${escapeHtml(list.name)}</span>
              <span class="sub">${listSubtitle(list, items.length, openCount)}</span>
            </span>
          </a>
          <div class="list-card-actions">
            <button class="icon-btn" data-action="move-up" title="Omhoog">${uiIcon('chevronUp')}</button>
            <button class="icon-btn" data-action="move-down" title="Omlaag">${uiIcon('chevronDown')}</button>
            <button class="icon-btn danger" data-action="delete" title="Verwijderen">${uiIcon('close')}</button>
          </div>
        </div>
      `);
      appEl.appendChild(row);
    }
  }

  const addForm = el(`
    <form class="card add-list-form" id="add-list-form">
      ${listIconChip('', 22)}
      <input type="text" id="new-list-name" placeholder="Nieuw lijstje…" required />
      <button class="fab" type="submit" title="Lijstje toevoegen">${uiIcon('plus', 24)}</button>
    </form>
  `);
  appEl.appendChild(addForm);

  // Het icoon volgt de titel, dus laat het meteen meebewegen terwijl er
  // getypt wordt -- dan is duidelijk dat een nieuw lijstje er ook een krijgt.
  const nameInput = document.getElementById('new-list-name');
  nameInput.addEventListener('input', () => {
    addForm.querySelector('.list-icon').outerHTML = listIconChip(nameInput.value.trim(), 22);
  });

  document.getElementById('add-list-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-list-name');
    const name = input.value.trim();
    if (!name) return;
    // Leegmaken vóór de mutatie: die tekent direct opnieuw, en neemt daarbij
    // de inhoud van het actieve invoerveld mee over.
    input.value = '';
    sync.mutateAndSync(() => storage.addListLocal(name));
  });

  bindListActions(lists);
  renderPushBanner();
}

function bindListActions(lists) {
  appEl.querySelectorAll('.list-card-row').forEach((row) => {
    const entityId = row.dataset.entityId;
    row.querySelector('[data-action="move-up"]').addEventListener('click', () => moveList(entityId, -1));
    row.querySelector('[data-action="move-down"]').addEventListener('click', () => moveList(entityId, 1));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const list = lists.find((l) => l.entity_id === entityId);
      if (
        !confirm(
          `Lijstje "${list ? list.name : entityId}" volledig verwijderen? Alle items hierin gaan permanent verloren, ook in Home Assistant.`
        )
      )
        return;
      sync.mutateAndSync(() => storage.removeListLocal(entityId));
    });
  });
}

async function moveList(entityId, direction) {
  const order = storage.getSortedLists().map((l) => l.entity_id);
  const idx = order.indexOf(entityId);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= order.length) return;

  const reordered = order.slice();
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(targetIdx, 0, moved);
  storage.setListOrderCache(reordered);
  render();

  try {
    await api.setListOrder(reordered);
  } catch (err) {
    // niet kritiek voor de werking -- de eerstvolgende refreshListOrder
    // haalt gewoon de laatst bekende serverstand weer op.
  }
}

function renderPushBanner() {
  if (viaIngress || !push.isSupported()) return;
  const permission = push.getPermissionState();
  if (permission === 'granted') return;

  const banner = el(`
    <div class="card">
      <div style="margin-bottom:10px;">
        🔔 Zet meldingen aan om lijstjes ook op de achtergrond bij te werken:
        zonder dit staat je offline-kopie pas ververst zodra je de app zelf
        weer opent. Mét meldingen aan verwerkt de app wijzigingen vanuit Home
        Assistant meteen, ook zonder de app open te hebben — handig als je
        straks zonder bereik in de winkel staat.
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

// Home Assistant's todo-items hebben geen eigen "winkel"-veld. We coderen de
// winkel daarom als eerste regel van het bestaande description-veld (blijft
// zo ook gewoon zichtbaar in de HA-app/Assist), met een vaste emoji-prefix
// zodat 'ie betrouwbaar terug te lezen is; de rest van de tekst is de
// gewone, vrije omschrijving.
const STORE_PREFIX = '🏪 ';

function parseItemMeta(description) {
  if (!description) return { store: null, note: '' };
  const [firstLine, ...rest] = description.split('\n');
  if (firstLine.startsWith(STORE_PREFIX)) {
    return { store: firstLine.slice(STORE_PREFIX.length).trim(), note: rest.join('\n').trim() };
  }
  return { store: null, note: description };
}

function buildDescription(store, note) {
  const parts = [];
  if (store) parts.push(`${STORE_PREFIX}${store}`);
  if (note) parts.push(note);
  return parts.length ? parts.join('\n') : '';
}

function renderListDetail(entityId) {
  const snapshot = storage.getSnapshot();
  const list = storage.findList(entityId);
  const items = snapshot.items[entityId] || [];
  const settings = storage.getListSettings(entityId);
  appEl.innerHTML = '';

  const listName = list ? list.name : 'Lijstje';
  appEl.appendChild(
    el(`
    <div class="topbar">
      <a class="back" href="#/" title="Terug">${uiIcon('back', 26)}</a>
      ${listIconChip(listName, 20)}
      <h1>${escapeHtml(listName)}</h1>
      <a class="back" href="#/list/${encodeURIComponent(entityId)}/settings" title="Instellingen">${uiIcon('cog', 22)}</a>
    </div>
  `)
  );

  if (settings.storesEnabled) renderStoreManagement(entityId);

  const stores = settings.storesEnabled ? storage.getStores(entityId) : [];
  const addForm = el(`
    <form class="add-form" id="add-item-form">
      <input type="text" id="new-item-summary" placeholder="Item toevoegen…" required />
      ${stores.length ? `
        <select id="new-item-store">
          <option value="">Winkel</option>
          ${stores.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('')}
        </select>
      ` : ''}
      <button class="primary" type="submit">+</button>
    </form>
  `);
  appEl.appendChild(addForm);

  if (settings.templatesEnabled) renderTemplates(entityId);

  const open = items.filter((i) => i.status !== 'completed');
  const done = items.filter((i) => i.status === 'completed');

  appEl.appendChild(settings.storesEnabled ? renderGroupedItems(entityId, open, stores) : renderItemList(entityId, open));

  if (done.length) {
    appEl.appendChild(el(`
      <div class="section-title-row">
        <span class="section-title">Afgevinkt</span>
        <button type="button" class="link-btn" id="clear-completed-btn">Legen</button>
      </div>
    `));
    appEl.appendChild(renderItemList(entityId, done));
    document.getElementById('clear-completed-btn').addEventListener('click', () => {
      if (!confirm(`${done.length} afgevinkt item${done.length === 1 ? '' : 's'} verwijderen?`)) return;
      sync.mutateAndSync(() => storage.clearCompletedLocal(entityId));
    });
  }

  if (!items.length) {
    appEl.appendChild(el(`<div class="empty">Nog geen items in dit lijstje.</div>`));
  }

  document.getElementById('add-item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('new-item-summary');
    const summary = input.value.trim();
    if (!summary) return;
    const storeSelect = document.getElementById('new-item-store');
    const store = storeSelect ? storeSelect.value : '';
    // Leegmaken vóór de mutatie: die tekent direct opnieuw, en neemt daarbij
    // de inhoud van het actieve invoerveld mee over.
    input.value = '';
    if (storeSelect) storeSelect.value = '';
    sync.mutateAndSync(() => storage.addItemLocal(entityId, { summary, description: buildDescription(store, '') }));
  });

  bindItemActions(entityId);
}

// Winkels ("waar moet dit gehaald worden") beheren voor deze lijst. Zonder
// winkels aangemaakt blijft dit onopvallend -- gewoon één "+ Winkel"-chip,
// geen aparte sectie die in de weg zit voor lijstjes die dit niet gebruiken.
function renderStoreManagement(entityId) {
  const stores = storage.getStores(entityId);
  const row = el(`<div class="template-chips"></div>`);
  appEl.appendChild(row);

  for (const store of stores) {
    const chip = el(`
      <span class="template-chip">
        <span class="chip-apply" style="cursor:default;">${escapeHtml(store.name)}</span>
        <button type="button" class="chip-delete" data-id="${escapeHtml(store.id)}" title="Winkel verwijderen">✕</button>
      </span>
    `);
    row.appendChild(chip);
  }
  row.appendChild(el(`<button type="button" class="chip-new" id="new-store-btn">+ Winkel</button>`));

  row.querySelectorAll('.chip-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const store = stores.find((s) => s.id === btn.dataset.id);
      if (!store || !confirm(`Winkel "${store.name}" verwijderen? (items blijven staan, verliezen alleen het label)`)) return;
      try {
        await api.deleteStore(store.id);
        await sync.refreshStores();
        render();
      } catch (err) {
        alert(`Kon winkel niet verwijderen: ${err.message}`);
      }
    });
  });

  document.getElementById('new-store-btn').addEventListener('click', async () => {
    const name = prompt('Naam van de winkel (bv. Albert Heijn):');
    if (!name || !name.trim()) return;
    try {
      await api.createStore({ name: name.trim(), entity_id: entityId });
      await sync.refreshStores();
      render();
    } catch (err) {
      alert(`Kon winkel niet opslaan: ${err.message}`);
    }
  });
}

// Groepeert open items per winkel zodat je overzichtelijk per winkel kunt
// afvinken. Gebruikt de winkel niet (of helemaal geen winkels aangemaakt),
// dan ziet dit er exact zo uit als een gewone platte lijst.
function renderGroupedItems(entityId, items, stores) {
  const groups = new Map();
  for (const item of items) {
    const { store } = parseItemMeta(item.description);
    const key = store || null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const wrap = document.createElement('div');
  if (!groups.size) return wrap;

  const onlyUnassigned = groups.size === 1 && groups.has(null);
  if (onlyUnassigned) {
    wrap.appendChild(renderItemList(entityId, groups.get(null)));
    return wrap;
  }

  const orderedKeys = stores.map((s) => s.name).filter((name) => groups.has(name));
  for (const key of groups.keys()) {
    if (key !== null && !orderedKeys.includes(key)) orderedKeys.push(key); // verwijderde winkel, item heeft 'm nog
  }
  if (groups.has(null)) orderedKeys.push(null);

  for (const key of orderedKeys) {
    wrap.appendChild(el(`<div class="section-title">${key ? escapeHtml(key) : 'Zonder winkel'}</div>`));
    wrap.appendChild(renderItemList(entityId, groups.get(key)));
  }
  return wrap;
}

function renderItemList(entityId, items) {
  const wrap = el(`<div class="card" style="padding:0 16px;"></div>`);
  if (!items.length) return el(`<div></div>`);
  for (const item of items) {
    const due = formatDue(item);
    const { store, note } = parseItemMeta(item.description);
    const row = el(`
      <div class="item-row ${item.status === 'completed' ? 'completed' : ''}" data-uid="${escapeHtml(item.uid)}">
        <button class="checkbox ${item.status === 'completed' ? 'checked' : ''}" data-action="toggle">${item.status === 'completed' ? '✓' : ''}</button>
        <div class="item-body" data-action="edit">
          <div class="item-summary">${escapeHtml(item.summary)}</div>
          ${note || due || (store && item.status === 'completed') ? `
            <div class="item-meta">
              ${due ? `<span>📅 ${escapeHtml(due)}</span>` : ''}
              ${store && item.status === 'completed' ? `<span>🏪 ${escapeHtml(store)}</span>` : ''}
              ${note ? `<span>${escapeHtml(note)}</span>` : ''}
            </div>
          ` : ''}
        </div>
        <div class="item-actions">
          <button class="icon-btn" data-action="move-up" title="Omhoog">${uiIcon('chevronUp', 18)}</button>
          <button class="icon-btn" data-action="move-down" title="Omlaag">${uiIcon('chevronDown', 18)}</button>
          <button class="icon-btn danger" data-action="delete" title="Verwijderen">${uiIcon('close', 18)}</button>
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

// ---------- Sjablonen (snel meerdere items tegelijk toevoegen) ----------

function renderTemplates(entityId) {
  const templates = storage.getTemplates(entityId);

  appEl.appendChild(el(`<div class="section-title">Snel toevoegen</div>`));
  const row = el(`<div class="template-chips"></div>`);
  appEl.appendChild(row);

  for (const tpl of templates) {
    const chip = el(`
      <span class="template-chip">
        <button type="button" class="chip-apply" data-id="${escapeHtml(tpl.id)}">${escapeHtml(tpl.name)}</button>
        <button type="button" class="chip-delete" data-id="${escapeHtml(tpl.id)}" title="Sjabloon verwijderen">✕</button>
      </span>
    `);
    row.appendChild(chip);
  }
  row.appendChild(el(`<button type="button" class="chip-new" id="new-template-btn">+ Sjabloon</button>`));

  row.querySelectorAll('.chip-apply').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = templates.find((t) => t.id === btn.dataset.id);
      if (!tpl) return;
      sync.mutateAndSync(() => {
        for (const summary of tpl.items) storage.addItemLocal(entityId, { summary });
      });
    });
  });

  row.querySelectorAll('.chip-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tpl = templates.find((t) => t.id === btn.dataset.id);
      if (!tpl || !confirm(`Sjabloon "${tpl.name}" verwijderen?`)) return;
      try {
        await api.deleteTemplate(tpl.id);
        await sync.refreshTemplates();
      } catch (err) {
        alert(`Kon sjabloon niet verwijderen: ${err.message}`);
      }
    });
  });

  document.getElementById('new-template-btn').addEventListener('click', () => {
    location.hash = `#/list/${encodeURIComponent(entityId)}/new-template`;
  });
}

function renderTemplateNew(entityId) {
  const list = storage.findList(entityId);
  appEl.innerHTML = '';

  appEl.appendChild(
    el(`
    <div class="topbar">
      <a class="back" href="#/list/${encodeURIComponent(entityId)}">‹ Terug</a>
      <h1>Nieuw sjabloon</h1>
      <span></span>
    </div>
  `)
  );

  const form = el(`
    <form class="item-form" id="template-form">
      <p style="margin:0 0 4px;color:var(--muted);font-size:13.5px;">
        Voor ${escapeHtml(list ? list.name : 'dit lijstje')}. Bv. een maaltijd
        ("Pasta-avond") of iets dat je vaak in één keer toevoegt.
      </p>
      <label for="tpl-name">Naam</label>
      <input id="tpl-name" type="text" placeholder="Bv. Pasta-avond" required />

      <label for="tpl-items">Items (één per regel)</label>
      <textarea id="tpl-items" rows="6" placeholder="Spaghetti
Gehakt
Tomatenblokjes
Ui" required></textarea>

      <div class="row">
        <button class="primary" type="submit">Opslaan</button>
        <button class="secondary" type="button" id="cancel-template">Annuleren</button>
      </div>
    </form>
  `);
  appEl.appendChild(form);

  document.getElementById('cancel-template').addEventListener('click', () => {
    location.hash = `#/list/${encodeURIComponent(entityId)}`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('tpl-name').value.trim();
    const items = document
      .getElementById('tpl-items')
      .value.split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name || !items.length) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig…';
    try {
      await api.createTemplate({ name, entity_id: entityId, items });
      await sync.refreshTemplates();
      location.hash = `#/list/${encodeURIComponent(entityId)}`;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Opslaan';
      alert(`Kon sjabloon niet opslaan: ${err.message}`);
    }
  });
}

// ---------- Lijst-instellingen ----------

function renderListSettings(entityId) {
  const list = storage.findList(entityId);
  const settings = storage.getListSettings(entityId);
  appEl.innerHTML = '';

  appEl.appendChild(
    el(`
    <div class="topbar">
      <a class="back" href="#/list/${encodeURIComponent(entityId)}">‹ Terug</a>
      <h1>Instellingen</h1>
      <span></span>
    </div>
  `)
  );

  const form = el(`
    <form class="item-form" id="list-settings-form">
      <p style="margin:0 0 4px;color:var(--muted);font-size:13.5px;">
        Voor ${escapeHtml(list ? list.name : 'dit lijstje')}. Niet elk lijstje heeft dit nodig — zet
        alleen aan wat je hier wilt gebruiken.
      </p>
      <label class="toggle-row">
        <input type="checkbox" id="settings-templates" ${settings.templatesEnabled ? 'checked' : ''} />
        <span>Sjablonen — snel meerdere items in één keer toevoegen (bv. een maaltijd)</span>
      </label>
      <label class="toggle-row">
        <input type="checkbox" id="settings-stores" ${settings.storesEnabled ? 'checked' : ''} />
        <span>Winkels — items groeperen op waar je ze moet halen</span>
      </label>
      <div class="row">
        <button class="primary" type="submit">Opslaan</button>
      </div>
    </form>
  `);
  appEl.appendChild(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const templatesEnabled = document.getElementById('settings-templates').checked;
    const storesEnabled = document.getElementById('settings-stores').checked;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig…';
    try {
      const saved = await api.setListSettings({ entity_id: entityId, templatesEnabled, storesEnabled });
      storage.setListSettingsCache(entityId, saved);
      location.hash = `#/list/${encodeURIComponent(entityId)}`;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Opslaan';
      alert(`Kon instellingen niet opslaan: ${err.message}`);
    }
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
  const { store: currentStore, note: currentNote } = parseItemMeta(item.description);
  const settings = storage.getListSettings(entityId);
  const stores = settings.storesEnabled ? storage.getStores(entityId) : [];

  const form = el(`
    <form class="item-form" id="item-edit-form">
      <label for="summary">Tekst</label>
      <input id="summary" type="text" value="${escapeHtml(item.summary)}" required />

      ${stores.length ? `
        <label for="store">Winkel (optioneel)</label>
        <select id="store">
          <option value="">Geen winkel</option>
          ${stores.map((s) => `<option value="${escapeHtml(s.name)}" ${s.name === currentStore ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      ` : ''}

      <label for="description">Omschrijving (optioneel)</label>
      <textarea id="description" rows="2">${escapeHtml(currentNote)}</textarea>

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
    const note = document.getElementById('description').value.trim();
    const storeSelect = document.getElementById('store');
    const store = storeSelect ? storeSelect.value : currentStore;
    const dueDate = document.getElementById('due_date').value;
    sync.mutateAndSync(() =>
      storage.updateItemLocal(entityId, uid, {
        summary,
        description: buildDescription(store, note),
        due_date: dueDate,
      })
    );
    location.hash = `#/list/${encodeURIComponent(entityId)}`;
  });
}

// ---------- Router ----------

// De achtergrondsync roept render() aan na élke poll (elke 15 seconden) en bij
// elke tabwissel/terugkeer naar de app -- meestal zonder dat er inhoudelijk
// iets gewijzigd is. Omdat render() de hele DOM weggooit en opnieuw opbouwt,
// voelde dat als een pagina die telkens herlaadt: de scrollpositie sprong
// terug naar boven en half ingetypte tekst was weg. Daarom nu twee dingen:
// eerst kijken of het scherm er überhaupt anders uit zou komen te zien (zo
// niet: de DOM volledig met rust laten), en als er wél iets wijzigt de
// scrollpositie en het actieve invoerveld eroverheen bewaren.
let lastSignature = null;

function viewSignature() {
  return JSON.stringify({
    hash: location.hash || '#/',
    paired,
    viaIngress,
    needsHaUrl,
    online: navigator.onLine,
    pushPermission: push.isSupported() ? push.getPermissionState() : 'unsupported',
    state: storage.getStateSignature(),
  });
}

function captureUiState() {
  const active = document.activeElement;
  const focus =
    active && active.id && appEl.contains(active)
      ? {
          id: active.id,
          value: 'value' in active ? active.value : undefined,
          start: active.selectionStart,
          end: active.selectionEnd,
        }
      : null;
  return { scrollY: window.scrollY, focus };
}

function restoreUiState(ui) {
  if (ui.focus) {
    const next = document.getElementById(ui.focus.id);
    if (next) {
      // Wat er stond is wat de gebruiker zelf aan het typen was -- dat wint
      // van de opnieuw opgebouwde (lege) waarde.
      if (ui.focus.value !== undefined && 'value' in next) {
        next.value = ui.focus.value;
        // Opmaak die van de ingetypte waarde afhangt (zoals het icoonvoorbeeld
        // bij een nieuw lijstje) hangt aan het input-event; dat komt bij een
        // programmatische toekenning niet vanzelf.
        next.dispatchEvent(new Event('input', { bubbles: true }));
      }
      next.focus({ preventScroll: true });
      if (ui.focus.start != null && next.setSelectionRange) {
        // Niet elk invoertype ondersteunt een selectiebereik (date e.d.).
        try {
          next.setSelectionRange(ui.focus.start, ui.focus.end);
        } catch (err) {
          /* niet van belang */
        }
      }
    }
  }
  if (window.scrollY !== ui.scrollY) window.scrollTo({ top: ui.scrollY });
}

function render() {
  const signature = viewSignature();
  if (signature === lastSignature) return;
  lastSignature = signature;

  const ui = captureUiState();
  renderView();
  restoreUiState(ui);
}

function renderView() {
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
  const newTemplateMatch = hash.match(/^#\/list\/([^/]+)\/new-template$/);
  const settingsMatch = hash.match(/^#\/list\/([^/]+)\/settings$/);
  const listMatch = hash.match(/^#\/list\/([^/]+)$/);

  if (itemMatch) {
    renderItemEdit(decodeURIComponent(itemMatch[1]), decodeURIComponent(itemMatch[2]));
  } else if (newTemplateMatch) {
    renderTemplateNew(decodeURIComponent(newTemplateMatch[1]));
  } else if (settingsMatch) {
    renderListSettings(decodeURIComponent(settingsMatch[1]));
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
