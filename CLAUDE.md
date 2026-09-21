# Lijstjes — werkgeheugen

Home Assistant add-on: offline-first PWA voor HA's to-do-lijsten.
Repo `danieldh00/Lijstjes`.

## Branchmodel

- **`master`** is de productiebranch (én GitHub's default branch) en staat op
  de HA van de gebruiker met **auto_update aan** (slug `196a7da8_lijstjes`):
  na een push naar `master` werkt de add-on zichzelf bij, er is geen
  handmatige stap.
- **`develop`** is de integratiebranch voor lopend werk. Features takken af
  van `develop` als `feature/<naam>` en gaan via een PR terug naar `develop`
  — nooit rechtstreeks naar `master`.
- Een release is een PR van `develop` naar `master`. Pas op dát moment wordt
  de add-on-versie verhoogd (zie hieronder) — dat is ook het moment waarop de
  gebruiker de update krijgt, dus behandel elke merge naar `master` als een
  productie-release.
- Een GitHub Actions-check (`.github/workflows/addon-version.yml` +
  `scripts/check_addon_version.py`) bewaakt dat de versie in
  `lijstjes/config.yaml` bij elke push naar `master` (en elke PR ernaartoe)
  hoger is dan de vorige. Die check vangt alleen afwijkingen t.o.v. de
  git-geschiedenis af — **niet** t.o.v. een live installatie die buiten git
  om is afgeweken (bv. na een geschiedenis-herschrijving). Vraag daarom vóór
  het bumpen altijd (of laat de gebruiker vragen) de `installed_version` op
  via het `update.lijstjes_update`-entity in Home Assistant, en kies een
  nieuw versienummer dat ook daarboven zit. Een versie die niet hoger is dan
  wat al geïnstalleerd staat, biedt Home Assistant nooit aan als update —
  die blijft dan onopgemerkt stil staan, ook na handmatig verversen in de
  add-on store.

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
.github/workflows/addon-version.yml + scripts/check_addon_version.py
                             bewaakt versie-bump richting master (zie Branchmodel)
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
13. **`POST /api/list-settings` moet alle drie de velden doorgeven** —
    `templatesEnabled`, `storesEnabled` én `mealsEnabled`. Het is een
    *vervangende* schrijfactie (`setSettings` in `listSettings.js`), geen
    partial update: een veld weglaten (in de route-handler óf in de
    `api.setListSettings(...)`-aanroep in app.js) zet het stilletjes op
    `false`, ook als het al aanstond. Precies zo verdween "Maaltijden" na
    elke instellingen-opslag.
14. **`sync.js`'s `flush()` moet de wachtrij ná elke await herchecken.**
    Een `api.content()`-aanroep die start terwijl de wachtrij leeg is, kan
    onderweg zijn terwijl er lokaal alsnog iets gewijzigd wordt (een
    bewerking, een 15s-poll die toevallig overlapt) — zonder herchecken
    overschrijft die verouderde snapshot de net gemaakte wijziging zodra
    hij alsnog binnenkomt (het "springt terug na opslaan"-symptoom). Zelfde
    reden dat `applySyncResult` (storage.js) een mislukte mutatie in de
    wachtrij laat staan in plaats van 'm stil te laten vervallen.
15. **`todo.update_item` accepteert geen lege due_date/due_datetime.** HA
    valideert die velden strikt als datum/tijd (`cv.date`/`cv.datetime`);
    een lege string ('geen einddatum') levert een 400 Bad Request op, niet
    een "verwijder de datum"-instructie. Zonder datum hoort het veld dus
    weggelaten (net als in `addItem`), nooit als `''` meegestuurd — anders
    mislukt zo ongeveer elke bewerking van een item zonder einddatum, wat
    zich alleen uitte als een stille terugval dankzij valkuil 14 hierboven.
    Zie `test/node/ha-todo-update-item.js`.
16. **Een push-abonnement dat blijft mislukken zonder 404/410** (401/403 =
    VAPID-sleutel klopt niet meer, bv. na een vervangen `vapid.json`) moet
    ook opgeruimd worden — anders blijft `sendNotificationToAll` 'm bij
    elke poll opnieuw proberen en de log vollopen met "Pushmelding
    mislukt".

## Werkwijze per wijziging

1. Code aanpassen; `node --check` (frontend-ES-modules eerst naar `.mjs`
   kopiëren).
2. `node test/run.js` — de regressietests draaien (zie `test/README.md`).
3. `DOCS.md`/`README.md` bij als gedrag zichtbaar wijzigt; entry in
   `lijstjes/CHANGELOG.md`.
4. Committen met de gevraagde attributie-footer, pushen naar de
   feature-branch en een PR openen naar `develop`.
5. Alleen bij een release (PR `develop` → `master`): versie bumpen in
   `lijstjes/config.yaml` — zie Branchmodel hierboven voor de valkuil met de
   live `installed_version`.

## Open punt

De **Mealie-integratie staat inmiddels in HA geconfigureerd** (`state:
"loaded"`) — de eerdere aanname dat de `mealie.*`-services nog niet bestaan
klopt dus niet meer. De Mealie-code is nog steeds alleen tegen nagebootste
responses getest, niet tegen de echte integratie; controleer bij het
volgende Mealie-gerelateerde issue eerst de add-on-log
(`ha_get_logs(source="supervisor", slug="196a7da8_lijstjes")`) op een
`mealie.*`-foutmelding voordat je een nieuwe bug aanneemt.
