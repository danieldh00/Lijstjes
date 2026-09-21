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

// De synchronisatie hoort onzichtbaar te zijn. Er wordt elke 15 seconden en
// bij elke wijziging gesynchroniseerd; daar telkens "Synchroniseren…" of een
// telling van wachtende wijzigingen voor laten opflitsen is alleen maar ruis,
// want het gaat vanzelf goed. De balk verschijnt daarom alleen nog als er
// iets is wat je moet weten: dat je offline bent (relevant als je in een
// winkel zonder bereik staat), of dat wijzigingen niet weggeschreven konden
// worden en dus nog alleen op dit toestel staan.
function renderStatus(status) {
  const wachtend = `${status.pending} wijziging${status.pending === 1 ? '' : 'en'} wachten`;

  if (status.state === 'offline') {
    statusEl.hidden = false;
    statusEl.className = 'statusbar offline';
    statusEl.textContent = status.pending ? `Offline — ${wachtend}` : 'Offline — lokaal werken';
    return;
  }

  // Een mislukte poll zonder wachtende wijzigingen kost niets -- de volgende
  // ronde haalt het gewoon opnieuw op. Alleen melden als er iets van de
  // gebruiker zelf nog niet in Home Assistant staat.
  if (status.state === 'error' && status.pending > 0) {
    statusEl.hidden = false;
    statusEl.className = 'statusbar error';
    statusEl.textContent = `Synchroniseren mislukt — ${wachtend}`;
    return;
  }

  statusEl.hidden = true;
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
      ${viaIngress ? '' : `<a class="back" href="#/instellingen" title="Instellingen">${uiIcon('cog', 22)}</a>`}
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

// ---------- Instellingen (app-breed) ----------

// Alleen bereikbaar op de directe poort-3100-route (het tandwiel op het
// overzicht is er niet via ingress, zie renderOverview): via ingress is er
// geen eigen koppeling om los te koppelen. Op een eigen scherm in plaats van
// een knop direct op het overzicht -- die werd te makkelijk per ongeluk
// aangetikt.
function renderSettings() {
  if (viaIngress) {
    // Rechtstreeks ingetypte hash e.d. -- via ingress is er niets in te
    // stellen (geen eigen koppeling), gewoon terug naar het overzicht.
    location.hash = '#/';
    return;
  }
  appEl.innerHTML = '';

  appEl.appendChild(
    el(`
    <div class="topbar">
      <a class="back" href="#/" title="Terug">${uiIcon('back', 26)}</a>
      <h1>Instellingen</h1>
      <span></span>
    </div>
  `)
  );

  const card = el(`
    <div class="card">
      <p style="margin:0 0 12px;color:var(--muted);font-size:13.5px;">
        Koppelt dit toestel los van Home Assistant. Lokale gegevens op dit
        toestel worden gewist; je kunt daarna opnieuw koppelen met een
        Long-Lived Access Token.
      </p>
      <button class="secondary" id="unpair-btn">Ontkoppel dit toestel</button>
    </div>
  `);
  appEl.appendChild(card);

  document.getElementById('unpair-btn').addEventListener('click', async () => {
    if (!confirm('Dit toestel loskoppelen van Home Assistant?')) return;
    try {
      await api.unpair();
    } catch (err) {
      // Ook zonder netwerk lokaal loskoppelen -- de gebruiker vroeg hier
      // expliciet om, en de server-kant koppeling verliest hooguit een
      // toestel dat toch al niet meer gebruikt wordt.
    }
    storage.clearAll();
    paired = false;
    lastSignature = null;
    render();
  });
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

// Welke winkel hoort er bij deze itemnaam? Eerst het expliciet onthouden
// geheugen (overleeft ook het afvinken en opruimen van het oude item), en
// anders terugvallen op een item met dezelfde naam dat nu nog op de lijst
// staat (bv. nog niet opgeruimd afgevinkt item) -- zo werkt de suggestie ook
// meteen voor bestaand gebruik, zonder dat er al iets expliciet onthouden is.
function suggestStoreForItem(entityId, name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;

  const remembered = storage.getItemStoreMemory(entityId)[key];
  if (remembered) return remembered;

  const items = storage.getSnapshot().items[entityId] || [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].summary.trim().toLowerCase() !== key) continue;
    const { store } = parseItemMeta(items[i].description);
    if (store) return store;
  }
  return null;
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
      <div class="field">
        <input type="text" id="new-item-summary" placeholder="Item toevoegen…" autocomplete="off" required />
        <div class="suggestions" id="item-suggestions" hidden></div>
      </div>
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

  const nameInput = document.getElementById('new-item-summary');
  const storeSelect = document.getElementById('new-item-store');

  // Winkel live voorstellen terwijl je typt (net als het icoonvoorbeeld bij
  // een nieuw lijstje) -- zodra de naam een eerder bekend item is, staat de
  // winkel meteen goed en hoef je 'm niet elke keer opnieuw te kiezen.
  if (storeSelect) {
    nameInput.addEventListener('input', () => {
      storeSelect.value = suggestStoreForItem(entityId, nameInput.value) || '';
    });
  }

  bindItemNameSuggestions(entityId, nameInput, storeSelect);

  if (settings.templatesEnabled || settings.mealsEnabled) renderQuickAdd(entityId, settings);

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
    if (store) sync.rememberItemStore(entityId, summary, store);
    sync.bumpItemHistory(entityId, summary);
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

// Voorspellende suggesties terwijl je een itemnaam typt, op basis van wat
// ooit eerder in dít lijstje is getypt (zie storage.getItemSuggestions) --
// ook items die inmiddels afgevinkt en opgeruimd zijn. Los van de
// winkel-suggestie hierboven; bij het overnemen van een suggestie laten we
// die wel meteen meelopen zodat de winkel ook meteen klopt.
function bindItemNameSuggestions(entityId, nameInput, storeSelect) {
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
    nameInput.value = text;
    close();
    if (storeSelect) storeSelect.value = suggestStoreForItem(entityId, text) || '';
    nameInput.focus();
  }

  nameInput.addEventListener('input', () => {
    suggestState.items = nameInput.value.trim() ? storage.getItemSuggestions(entityId, nameInput.value) : [];
    suggestState.activeIndex = -1;
    paint();
  });

  nameInput.addEventListener('keydown', (e) => {
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

  nameInput.addEventListener('blur', () => setTimeout(close, 100));
}

// ---------- Maaltijden uit Mealie ----------
//
// Haalt het weekmenu en recepten live op via Home Assistant's
// Mealie-integratie, dus dit deel werkt alleen met verbinding. Dat is precies
// het moment waarop je het gebruikt: thuis je lijst samenstellen. De items die
// eruit komen gaan daarna via de gewone wachtrij en zijn dus in de winkel ook
// zonder bereik gewoon beschikbaar.
//
// De opgehaalde maaltijden worden per lijst onthouden zolang de pagina open
// staat, zodat een her-render (achtergrondsync) ze niet telkens opnieuw
// ophaalt en de sectie niet loopt te knipperen.
const mealCache = new Map();

// Sjablonen en maaltijden doen hetzelfde: met één tik een setje items op de
// lijst zetten. Ze staan daarom in één "Snel toevoegen"-rij, sjablonen eerst
// en de maaltijden daarachter -- niet als twee aparte blokken boven elkaar.
function renderQuickAdd(entityId, settings) {
  appEl.appendChild(el(`<div class="section-title">Snel toevoegen</div>`));
  const row = el(`<div class="template-chips" id="quick-add-chips"></div>`);
  appEl.appendChild(row);

  if (settings.templatesEnabled) {
    renderTemplateChips(entityId, row);
    // Sluit de rij af; maaltijden schuiven hier vóór, zodat de volgorde
    // sjablonen -> maaltijden -> knop blijft, ook al komen de maaltijden pas
    // binnen als het ophalen klaar is.
    const nieuw = el(`<button type="button" class="chip-new" id="new-template-btn">+ Sjabloon</button>`);
    row.appendChild(nieuw);
    nieuw.addEventListener('click', () => {
      location.hash = `#/list/${encodeURIComponent(entityId)}/new-template`;
    });
  }

  if (settings.mealsEnabled) renderMeals(entityId);
}

function renderMeals(entityId) {
  const extra = el(`<div id="meals-extra"></div>`);
  appEl.appendChild(extra);

  const cached = mealCache.get(entityId);
  if (cached) {
    paintMealChips(entityId, cached);
    paintMealSearch(entityId);
    return;
  }

  extra.appendChild(el(`<div class="meals-hint">Weekmenu ophalen…</div>`));
  api
    .mealieMealplan()
    .then(({ meals }) => {
      mealCache.set(entityId, meals);
      paintMealChips(entityId, meals);
      paintMealSearch(entityId);
    })
    .catch((err) => {
      const live = document.getElementById('meals-extra');
      if (!live) return;
      live.innerHTML = '';
      live.appendChild(el(`<div class="meals-hint">${escapeHtml(err.message)}</div>`));
    });
}

// Het ophalen is asynchroon, dus de pagina kan intussen opnieuw getekend zijn;
// daarom de rij hier opnieuw opzoeken in plaats van een oude verwijzing
// gebruiken.
function paintMealChips(entityId, meals) {
  const row = document.getElementById('quick-add-chips');
  if (!row) return;

  // Dit kan meer dan eens langskomen: als de pagina opnieuw getekend wordt
  // terwijl het ophalen nog loopt, start er een tweede ophaalactie en tekenen
  // ze allebei in dezelfde rij. Daarom eerst de vorige maaltijdknoppen weg,
  // zodat het resultaat hetzelfde is hoe vaak dit ook draait.
  row.querySelectorAll('.meal-chip').forEach((chip) => chip.remove());

  const nieuwKnop = document.getElementById('new-template-btn');
  for (const meal of meals) {
    const chip = el(`
      <span class="template-chip meal-chip">
        <button type="button" class="chip-apply" data-recipe="${escapeHtml(meal.recipe_id)}">
          ${escapeHtml(mealDayLabel(meal.date))} · ${escapeHtml(meal.name)}
        </button>
      </span>
    `);
    chip.querySelector('button').addEventListener('click', (e) => addRecipeIngredients(entityId, e.currentTarget));
    if (nieuwKnop) row.insertBefore(chip, nieuwKnop);
    else row.appendChild(chip);
  }
}

function paintMealSearch(entityId) {
  const wrap = document.getElementById('meals-extra');
  if (!wrap) return;
  wrap.innerHTML = '';

  const zoek = el(`
    <form class="add-form" id="meal-search-form">
      <input type="text" id="meal-search" placeholder="Zoek een recept…" />
      <button class="secondary" type="submit">Zoek</button>
    </form>
  `);
  wrap.appendChild(zoek);
  const resultaten = el(`<div class="template-chips" id="meal-results"></div>`);
  wrap.appendChild(resultaten);

  zoek.addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = document.getElementById('meal-search').value.trim();
    resultaten.innerHTML = '';
    resultaten.appendChild(el(`<div class="meals-hint">Zoeken…</div>`));
    try {
      const { recipes } = await api.mealieRecipes(term);
      resultaten.innerHTML = '';
      if (!recipes.length) {
        resultaten.appendChild(el(`<div class="meals-hint">Geen recepten gevonden.</div>`));
        return;
      }
      for (const recipe of recipes) {
        const chip = el(`
          <span class="template-chip">
            <button type="button" class="chip-apply" data-recipe="${escapeHtml(recipe.recipe_id)}">${escapeHtml(recipe.name)}</button>
          </span>
        `);
        chip.querySelector('button').addEventListener('click', (ev) => addRecipeIngredients(entityId, ev.currentTarget));
        resultaten.appendChild(chip);
      }
    } catch (err) {
      resultaten.innerHTML = '';
      resultaten.appendChild(el(`<div class="meals-hint">${escapeHtml(err.message)}</div>`));
    }
  });
}

function mealDayLabel(isoDate) {
  const dagen = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  const datum = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return isoDate;
  const vandaag = new Date();
  vandaag.setHours(12, 0, 0, 0);
  const verschil = Math.round((datum - vandaag) / 86400000);
  if (verschil === 0) return 'vandaag';
  if (verschil === 1) return 'morgen';
  return `${dagen[datum.getDay()]} ${datum.getDate()}`;
}

async function addRecipeIngredients(entityId, btn) {
  const origineel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Ophalen…';
  try {
    const { ingredients } = await api.mealieIngredients(btn.dataset.recipe);
    if (!ingredients.length) {
      alert('Dit recept heeft geen ingrediënten in Mealie staan.');
      return;
    }
    sync.mutateAndSync(() => {
      for (const summary of ingredients) {
        sync.bumpItemHistory(entityId, summary);
        storage.addItemLocal(entityId, { summary });
      }
    });
  } catch (err) {
    alert(`Kon de ingrediënten niet ophalen: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = origineel;
  }
}

// ---------- Sjablonen (snel meerdere items tegelijk toevoegen) ----------

function renderTemplateChips(entityId, row) {
  const templates = storage.getTemplates(entityId);

  for (const tpl of templates) {
    const chip = el(`
      <span class="template-chip">
        <button type="button" class="chip-apply" data-id="${escapeHtml(tpl.id)}">${escapeHtml(tpl.name)}</button>
        <button type="button" class="chip-delete" data-id="${escapeHtml(tpl.id)}" title="Sjabloon verwijderen">✕</button>
      </span>
    `);
    row.appendChild(chip);
  }
  // Maaltijdknoppen delen dezelfde opmaakklasse, dus hier expliciet alleen de
  // sjabloonknoppen (die een data-id hebben) aanhaken.
  row.querySelectorAll('.chip-apply[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = templates.find((t) => t.id === btn.dataset.id);
      if (!tpl) return;
      sync.mutateAndSync(() => {
        for (const summary of tpl.items) {
          const store = suggestStoreForItem(entityId, summary);
          sync.bumpItemHistory(entityId, summary);
          storage.addItemLocal(entityId, { summary, description: buildDescription(store, '') });
        }
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
      <label for="settings-name">Naam van het lijstje</label>
      <input type="text" id="settings-name" value="${escapeHtml(list ? list.name : '')}" required />
      <p style="margin:6px 0 4px;color:var(--muted);font-size:13.5px;">
        De naam wordt ook in Home Assistant zelf aangepast. Het icoon volgt de nieuwe naam.
      </p>
      <p style="margin:14px 0 4px;color:var(--muted);font-size:13.5px;">
        Niet elk lijstje heeft het onderstaande nodig — zet alleen aan wat je hier wilt gebruiken.
      </p>
      <label class="toggle-row">
        <input type="checkbox" id="settings-templates" ${settings.templatesEnabled ? 'checked' : ''} />
        <span>Sjablonen — snel meerdere items in één keer toevoegen (bv. een maaltijd)</span>
      </label>
      <label class="toggle-row">
        <input type="checkbox" id="settings-stores" ${settings.storesEnabled ? 'checked' : ''} />
        <span>Winkels — items groeperen op waar je ze moet halen</span>
      </label>
      <label class="toggle-row">
        <input type="checkbox" id="settings-meals" ${settings.mealsEnabled ? 'checked' : ''} />
        <span>Maaltijden — je Mealie-weekmenu en recepten, om de ingrediënten in één tik toe te voegen</span>
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
    const mealsEnabled = document.getElementById('settings-meals').checked;
    const naam = document.getElementById('settings-name').value.trim();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig…';
    try {
      const saved = await api.setListSettings({ entity_id: entityId, templatesEnabled, storesEnabled, mealsEnabled });
      storage.setListSettingsCache(entityId, saved);
      // De naam loopt wél via de gewone wachtrij, zodat hernoemen net als elke
      // andere wijziging offline gewoon werkt en later vanzelf doorkomt.
      if (naam) sync.mutateAndSync(() => storage.renameListLocal(entityId, naam));
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
    if (store) sync.rememberItemStore(entityId, summary, store);
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
  } else if (hash === '#/instellingen') {
    renderSettings();
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

// ---------- App-updates ophalen ----------
//
// Een geïnstalleerde PWA (zeker op iOS) wordt bij het openen meestal *hervat*
// en niet opnieuw geladen: er is dan geen navigatie, dus de browser haalt
// sw.js niet opnieuw op en merkt een nieuwe versie niet op. En ook als er wel
// een nieuwe service worker actief wordt, blijft de al geladen JS/CSS van de
// oude versie gewoon draaien tot de pagina herlaadt -- in een geïnstalleerde
// webapp is er geen adresbalk om dat zelf te doen. In een Safari-tab gebeurt
// allebei vanzelf (een tab navigeert en ververst regelmatig), waardoor de site
// daar wél bijwerkte en de webapp op een oude versie bleef hangen.
//
// Daarom hier expliciet: bij elke keer dat de app weer in beeld komt op een
// nieuwe versie controleren, en de pagina herladen zodra een nieuwe service
// worker het overneemt.
//
// Dat herladen gebeurt bewust pas zodra de app uit beeld is. Meteen herladen
// terwijl je ernaar kijkt geeft een zichtbare knipper, en dat is precies wat
// een app niet hoort te doen. Door te wachten tot de app naar de achtergrond
// gaat, gebeurt het ongezien en staat de nieuwe versie er klaar de volgende
// keer dat je 'm opent. Alle gegevens staan in localStorage, dus er gaat bij
// zo'n herlaad niets verloren.
if ('serviceWorker' in navigator) {
  // Werd deze pagina al door een service worker bestuurd? Zo niet, dan is de
  // eerstvolgende wissel gewoon de allereerste installatie die deze pagina
  // overneemt -- dat is geen update en hoeft niet te herladen. Wél de vlag
  // bijwerken, want elke wissel dáárna is wel degelijk een nieuwe versie.
  let hasController = !!navigator.serviceWorker.controller;
  let updateReady = false;
  let reloading = false;

  function reloadWhenOutOfSight() {
    if (!updateReady || reloading) return;
    if (document.visibilityState !== 'hidden') return;
    reloading = true;
    window.location.reload();
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    updateReady = true;
    // Staat de app nu al op de achtergrond, dan kan het meteen.
    reloadWhenOutOfSight();
  });

  document.addEventListener('visibilitychange', reloadWhenOutOfSight);

  // pageshow, focus en visibilitychange gaan bij één keer hervatten alle drie
  // vlak na elkaar af; deze drempel bundelt die tot één controle. Hij moet
  // kort blijven: elke échte hervatting hoort te controleren, ook als je de
  // app even wegklikt en meteen weer opent.
  let lastCheck = 0;
  function checkForUpdate() {
    if (Date.now() - lastCheck < 3000) return;
    lastCheck = Date.now();
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration && registration.update())
      .catch(() => {
        // Geen netwerk -- de volgende keer dat de app in beeld komt opnieuw.
      });
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Geen secure context (plain http op een niet-localhost-adres) --
      // de app werkt gewoon door, alleen zonder shell-caching.
    });
  });

  // Zelfde drietal als bij de datasynchronisatie in sync.js: op iOS is er niet
  // één gebeurtenis die bij het hervatten betrouwbaar afgaat.
  window.addEventListener('pageshow', checkForUpdate);
  window.addEventListener('focus', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}
