# Lijstjes — werkgeheugen

Home Assistant add-on: offline-first PWA voor HA's to-do-lijsten.
Repo `danieldh00/Lijstjes`, ontwikkelbranch `claude/offline-lists-home-assistant-v9v6rf`.

De add-on staat op de HA van de gebruiker met **auto_update aan** (slug
`196a7da8_lijstjes`): na een push naar die branch werkt hij zichzelf bij, er is
geen handmatige stap. Bump dus altijd `lijstjes/config.yaml` → `version`.

## Uitgangspunten

- **Home Assistant is de enige bron van waarheid.** Geen eigen database, geen
  eigen accounts. Nieuwe koppelingen lopen via HA, niet rechtstreeks naar een
  andere dienst (zo praat de Mealie-functie met HA's `mealie.*`-services en
  niet met Mealie zelf).
- **Local-first.** Alles staat in `localStorage` (`snapshot` + `outbox`) en
  werkt offline; elke mutatie heeft een `clientMutationId` voor idempotente
  verwerking. Nieuwe acties horen via de outbox te lopen zodat ze offline
  werken.
- **UI-teksten, commentaar, changelog en docs zijn Nederlands.**

## Structuur

```
lijstjes/config.yaml        versie + add-on-opties        lijstjes/apparmor.txt
lijstjes/backend/src/
  server.js                 routes, rate limiter, /sw.js met cache-hash, static
  config.js                 HA-credential (Supervisor-token of pairing)
  middleware.js             ingress alleen vanaf Supervisor-IP, of gekoppeld toestel
  rateLimit.js              in-memory rate limiter (pair-endpoint + generiek per API-route)
  auth/session.js           ondertekende sessie-cookie   auth/revocations.js  unpair
  ha/client.js              REST-wrapper      ha/todo.js    items
  ha/lists.js               lijst aanmaken/verwijderen/hernoemen
  ha/websocket.js           korte WS-sessie (alleen voor hernoemen)
  ha/mealie.js              weekmenu/recepten + ingrediëntnotatie
  ha/snapshot.js            volledige inhoud in één keer
  watcher.js                WS state_changed (near-instant) + 20s-poll-vangnet → pushmeldingen
  templates.js stores.js itemStoreMemory.js listSettings.js listOrder.js   → JSON in /data
  routes/                   auth content sync push templates stores
                            item-stores listSettings listOrder mealie
  test/                     node --test (auth/session, rate limiter, ingress-IP, sync-validatie)
lijstjes/frontend/
  js/app.js                 router + alle views
  js/storage.js             snapshot + outbox + signature
  js/sync.js                achtergrondsync        js/icons.js  MDI + naam→icoon
  sw.js                     app-shell cache, push, achtergrond-snapshot
.github/workflows/ci.yml    npm ci/test/audit bij elke push/PR
```

## Valkuilen (duur om opnieuw te ontdekken)

1. **HA's REST-API kan een config entry niet hernoemen** — alleen GET, DELETE
   en reload. Hernoemen gaat via WebSocket (`config_entries/update` +
   `config/entity_registry/update`). Dat laatste bepaalt `friendly_name`.
2. **`http://supervisor/core/api` relayt geen gebruikerstokens.** Een
   Long-Lived Access Token van de gebruiker valideer je tegen
   `http://homeassistant:8123`.
3. **Entiteit → config entry is niet opvraagbaar via REST.** We matchen de
   titel van de config entry op `friendly_name` (`findListEntry` in
   `ha/lists.js`). Hernoemen zet daarom titel én entiteitsnaam, anders breekt
   verwijderen.
4. **`syncedAt` verandert bij élke poll.** Die staat bewust niet in
   `getStateSignature()`; anders hertekent de app continu.
5. **Een nieuw bestand in `frontend/js/` moet in twee lijsten**:
   `APP_SHELL_FILES` (server.js, bepaalt de cache-hash) én `SHELL_FILES`
   (sw.js). Vergeet je er één, dan komt de update niet door of faalt de
   service-worker-installatie stil (`cache.addAll` breekt op één 404).
6. **iOS-PWA wordt hervat, niet genavigeerd.** Daarom expliciet
   `registration.update()` op pageshow/focus/visibilitychange.
7. **Herladen mag alleen als `visibilityState === 'hidden'`** — uitdrukkelijke
   wens: nooit een zichtbare verversing.
8. **De synchronisatie is onzichtbaar.** De statusbalk toont alleen offline, of
   een mislukte sync mét wachtende wijzigingen. Nooit "Synchroniseren…".
9. **HA-serviceresponses zijn `asdict()`** → snake_case veldnamen, niet de
   JSON-aliassen uit de bibliotheek.
10. **Per-lijst-instellingen** (`templatesEnabled`, `storesEnabled`,
    `mealsEnabled`) staan standaard uit; sjablonen/winkels hebben een
    auto-detect-fallback voor bestaand gebruik.
11. **`X-Ingress-Path` alleen vertrouwen mét een IP-check.** De header zelf is
    door elke client op poort 3100 na te bootsen; `middleware.js` vertrouwt
    'm daarom alleen als het TCP-bronadres ook echt Supervisors vaste IP
    (`172.30.32.2`) is. Die twee losstaan is precies hoe pairing volledig
    was te omzeilen — raak ze niet los van elkaar.
12. **Winkel-suggestie matcht exact op genormaliseerde naam** (trim +
    lowercase), niet fuzzy. Bewust: Mealie-ingrediënten hebben een
    hoeveelheid in de naam ("Gehakt (500 g)") en zouden toch nooit matchen,
    dus die krijgen geen suggestie — alleen het handmatige toevoegformulier
    en sjablonen (`suggestStoreForItem` in app.js).

## Werkwijze per wijziging

1. Code aanpassen; `node --check` (frontend-ES-modules eerst naar `.mjs`
   kopiëren).
2. `node test/run.js` — de regressietests draaien (zie `test/README.md`).
3. Versie bumpen in `lijstjes/config.yaml` + entry in `lijstjes/CHANGELOG.md`;
   `DOCS.md`/`README.md` bij als gedrag zichtbaar wijzigt.
4. Committen met de gevraagde attributie-footer, pushen naar de ontwikkelbranch.

## Open punt

De **Mealie-integratie in HA is nog niet geconfigureerd** (de Mealie-add-on
draait wel). Tot dat gebeurt bestaan de `mealie.*`-services niet en toont de
app een nette melding. De Mealie-code is getest tegen nagebootste responses,
niet tegen de echte integratie.
