# Regressietests

```bash
node test/run.js              # alles
node test/run.js mealie       # alleen bestanden met "mealie" in de naam
```

Er is **geen backend en geen Home Assistant** voor nodig. `run.js` serveert
`lijstjes/frontend/` op poort 8791; de browsertests mocken `window.fetch` in de
pagina zelf, de node-tests mocken de modules van de backend.

De tests **loggen hun bevindingen** in plaats van hard te falen — lees de
uitvoer, een exit-code van 0 zegt niet alles. Regels als `NEE (...)` of
`console errors: [...]` zijn wat je zoekt.

Playwright staat globaal in deze omgeving; de runner zet `NODE_PATH` zelf. Voor
een ander pad naar Chromium: `CHROMIUM_PATH=/pad/naar/chromium node test/run.js`.

## Wat er gedekt is

| Test | Bewaakt |
|---|---|
| `node/ingredient-format` | Mealie-ingrediënt → "Ui (2 stuks)"; breuken, meervoud, afkortingen, vrije tekst, lege regels |
| `node/mealie-backend` | `mealie.*`-serviceaanroepen, uitpakken van `service_response`, maaltijd zonder recept eruit, config entry gecachet |
| `node/watcher-notifications` | Eén melding per lijst: meteen bij de eerste wijziging, daarna pas de eindstand |
| `browser/render` | Achtergrondsync hertekent niet zonder wijziging; scrollpositie, focus en ingetypte tekst blijven |
| `browser/status` + `status-error` | Statusbalk blijft onzichtbaar bij normale sync; toont wél offline en mislukte sync mét wachtende wijzigingen |
| `browser/icons` | Icoon volgt de lijstnaam, voorbeeld beweegt mee tijdens typen en overleeft een her-render |
| `browser/rename` | Hernoemen online en offline; icoon volgt de nieuwe naam |
| `browser/clear-completed` | "Legen" verwijdert alle afgevinkte items |
| `browser/mealie` | Weekmenu + receptzoeken in de "Snel toevoegen"-rij, volgorde, en de melding als de integratie ontbreekt |
| `browser/pwa-update` | Nieuwe versie wordt opgepikt bij hervatten en herlaadt pas als de app uit beeld is |
