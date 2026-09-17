# Lijstjes

Offline-first lijstjes-app (boodschappen, klussen, taken) die rechtstreeks
synchroniseert met je bestaande Home Assistant to-do-lijsten. Geen eigen
account of inlogscherm: de app hergebruikt je Home Assistant-instantie als
enige bron van waarheid — precies zoals gevraagd, in dezelfde stijl
geïntegreerd als de [Russisch Leren-app](https://github.com/danieldh00/Russianlanguageapp)
(zelfde add-on-structuur, dezelfde offline/PWA-aanpak), maar dan zonder een
apart account-systeem.

## Functionaliteit

- **Lijstjes**: elke lijst in de app is een Home Assistant to-do-lijst
  (`todo.*`-entiteit). Bestaande lijsten (bv. `Boodschappen`, `Klussen`)
  verschijnen automatisch; nieuwe lijstjes die je in de app aanmaakt, worden
  ook automatisch als nieuwe `local_todo`-integratie in Home Assistant
  aangemaakt (en andersom: een lijst die je in HA toevoegt, verschijnt in de
  app). Verwijderen (✕, met bevestiging — verwijdert ook echt de
  onderliggende HA-integratie en alle items erin) en herordenen (↑/↓, puur
  een weergavevoorkeur van de app) kan vanaf het overzicht; hernoemen kan via
  het ⚙-icoontje op een lijstje en wordt ook in Home Assistant doorgevoerd.
- **Items**: toevoegen, afvinken, verwijderen, herordenen (↑/↓), en
  optioneel een omschrijving en een einddatum instellen.
- **Sjablonen**: per lijstje bewaarde presets ("Pasta-avond", "Ontbijt",
  of gewoon een vaak terugkerend los item) die met één tik alle items in
  één keer toevoegen — werkt ook offline. Eigen concept van de app, staat
  niet in Home Assistant zelf.
- **Winkels**: per lijstje meerdere winkels toevoegen (handig voor
  boodschappen — Albert Heijn, Jumbo, de bakker), items eraan toewijzen en
  de lijst automatisch per winkel zien gegroepeerd. De koppeling item→winkel
  staat in HA's eigen omschrijving-veld (blijft dus zichtbaar via Assist/de
  HA-app); welke winkels er zijn, staat net als sjablonen in de eigen
  opslag van de add-on. De app **onthoudt welke winkel bij welke itemnaam
  hoort**, dus die hoef je maar één keer te kiezen — ook nadat het oude item
  allang afgevinkt en opgeruimd is.
- **Maaltijden uit Mealie**: je Mealie-weekmenu en een zoekveld over al je
  recepten, boven aan een lijstje. Eén tik zet alle ingrediënten erop, als
  "Gehakt (500 g)" en "Uien (2 stuks)". Loopt via Home Assistant's eigen
  Mealie-integratie, dus de app kent zelf geen Mealie-adres of token; die
  integratie moet wel één keer in HA toegevoegd zijn (zie `lijstjes/DOCS.md`).
- **Per lijstje in-/uitschakelbaar**: Sjablonen, Winkels en Maaltijden staan
  standaard uit (via het ⚙-icoontje op een lijstje aan te zetten) — niet elk
  lijstje (bv. Klussen) heeft er iets aan. Sjablonen/Winkels al gebruikt
  voordat deze instelling bestond? Dan blijven die gewoon zichtbaar.
- **Geen accounts**: in plaats van een eigen inlogsysteem koppel je de app
  eenmalig aan Home Assistant met een **Long-Lived Access Token** — dat ene
  token *is* de koppeling, er is niets anders te beheren.
- **Twee toegangswegen, dezelfde data**:
  - **Ingress** (het "Lijstjes"-paneel in het HA-zijmenu): automatisch
    toegankelijk voor wie al in Home Assistant is ingelogd, geen extra stap.
  - **Directe poort** (3100): voor de installeerbare, offline-vriendelijke
    PWA op je telefoon — hier vraagt de app eenmalig om het Long-Lived
    Access Token.
- **Offline-first + synchronisatie**: eenmaal geopend werkt de app volledig
  zonder netwerk (bv. in de supermarkt zonder bereik) en synchroniseert op
  de achtergrond zodra er weer verbinding is — zie hieronder.
- **Pushmeldingen vanuit Home Assistant**: wijzig je een lijstje rechtstreeks
  in Home Assistant (dashboard, Assist, een automatisering), dan krijgen je
  gekoppelde telefoons daar een melding van — ook als de app niet open
  staat. Zie `lijstjes/DOCS.md` voor de details en de iOS-beperkingen.
- **Automatische lijst-iconen**: elk lijstje krijgt een passend icoon op
  basis van zijn naam (winkelwagen bij Boodschappen, gereedschap bij
  Klussen, koffer bij Inpaklijst, cadeau bij een verjaardag...), met een
  eigen kleur. Bij een nieuw lijstje beweegt het icoon al mee terwijl je de
  naam typt. Zonder herkenbaar trefwoord volgt een neutraal lijstpictogram
  met een vaste kleur per naam. De iconen komen uit Material Design Icons —
  dezelfde set als Home Assistant — en zitten in de app zelf, dus ze werken
  ook offline.
- **Opmaak in HA-stijl**: dezelfde kleuren, kaartvorm en donker/licht-tinten
  als het standaardthema van Home Assistant, zodat de app niet uit de toon
  valt naast je dashboard.
- **Icoon**: het officiële Home Assistant-logo met een groen vinkje/todo-
  badge in de hoek, zodat de app herkenbaar is als HA-integratie op je
  beginscherm en in het browsertabblad.

## Techniek

- **Backend**: Node.js + Express. Geen eigen database: Home Assistant zelf
  is de bron van waarheid, de add-on praat met HA's REST API (via de
  Supervisor-proxy als add-on, of rechtstreeks in standalone-modus).
- **Frontend**: vanille HTML/CSS/JS (ES-modules), geen build-stap, direct
  door Express geserveerd.
- **PWA**: `manifest.webmanifest` + `sw.js` (app-shell caching) maken de app
  installeerbaar en offline bruikbaar, net als de Russisch Leren-app.

## Projectstructuur

```
repository.yaml            Herkenningsbestand: maakt deze repo een HA add-on-repository
docker-compose.yml          Standalone Docker-variant (buiten de add-on-store om)
CLAUDE.md                   Architectuur, valkuilen en werkwijze (voor wie hieraan verder werkt)
test/                       Regressietests, `node test/run.js` — zie test/README.md
lijstjes/
  config.yaml                HA add-on-configuratie (ingress, poort, Supervisor-API)
  apparmor.txt                AppArmor-profiel (beveiligingsscore 8/8 in Home Assistant)
  DOCS.md                     Documentatie zoals getoond in de HA add-on-store
  Dockerfile
  backend/
    src/
      server.js                Express-app: routes, pairing-gate, static hosting van frontend/
      config.js                 Resolvet de HA-credential (Supervisor-token of ha_url/ha_token)
      middleware.js              Toegangscontrole: ingress vertrouwen (Supervisor-IP), of gekoppeld toestel
      rateLimit.js                Lichte in-memory rate limiter voor de API-routes
      auth/
        session.js                 Ondertekende sessie-cookie voor gekoppelde toestellen
        revocations.js              Ingetrokken (unpaired) sessies, overleeft een herstart
      ha/
        client.js                 Dunne REST-wrapper rond Home Assistant's Core API
        todo.js                    add/update/remove/move/get items via de todo.*-services
        lists.js                    Lijst aanmaken/verwijderen/hernoemen via de config-entries-API
        websocket.js                 Korte WebSocket-sessie voor wat de REST-API niet kan (hernoemen)
        mealie.js                    Mealie-weekmenu/recepten via HA's mealie.*-services + ingrediëntnotatie
        snapshot.js                 Volledige inhoud van alle lijstjes in één keer
      push.js                     VAPID-sleutels + push-abonnementen + meldingen versturen
      watcher.js                   Achtergrondpoller: detecteert wijzigingen vanuit HA, triggert pushmeldingen
      recentActors.js               Onthoudt welk toestel net zelf iets wijzigde (geen dubbele melding)
      templates.js                  Sjablonen (eigen concept, niet in HA): opslaan/lezen in /data
      stores.js                     Winkels per lijst (eigen concept, niet in HA): opslaan/lezen in /data
      itemStoreMemory.js             Onthoudt welke winkel bij welke itemnaam hoort (eigen concept, niet in HA)
      listSettings.js               Sjablonen/Winkels/Maaltijden aan/uit per lijst, met auto-detect als default
      listOrder.js                   Volgorde van lijstjes op het overzicht (eigen concept, niet in HA)
      routes/
        auth.js                     Pairing-status, koppelen/ontkoppelen met een Long-Lived Access Token
        content.js                   Volledige snapshot voor de eerste (online) vulling
        sync.js                      Offline-wachtrij van mutaties verwerken (idempotent, entity_id-gevalideerd)
        push.js                       VAPID-sleutel opvragen + toestel (de)abonneren op pushmeldingen
        templates.js                   Sjablonen aanmaken/opvragen/verwijderen
        stores.js                       Winkels aanmaken/opvragen/verwijderen
        itemStoreMemory.js               Winkel per itemnaam opvragen/onthouden
        listSettings.js                 Sjablonen/Winkels aan/uit per lijst opvragen/opslaan
        listOrder.js                     Volgorde van lijstjes opvragen/opslaan
        mealie.js                         Weekmenu, receptzoeken en ingrediënten van een recept
    test/                          Geautomatiseerde tests (node --test)
  frontend/
    index.html, css/               Opmaak
    js/
      app.js                        Router + views (pairing, lijstjes, lijst-detail, item bewerken)
      storage.js                     Lokale offline-opslag (localStorage): snapshot + outbox
      sync.js                        Achtergrondsynchronisatie + online/offline-status
      api.js                         Backend-aanroepen
      push.js                        Meldingen aanzetten: toestemming vragen + push-abonnement registreren
      icons.js                       Lijst-icoon afleiden uit de naam + MDI-paden (gegenereerd uit @mdi/js)
    manifest.webmanifest, sw.js     PWA-installeerbaarheid + app-shell caching + push-/klikafhandeling
    icons/                          Home Assistant-logo + todo-badge (bron: home-assistant/assets)
```

## Installeren op Home Assistant (aanbevolen)

1. Instellingen → Add-ons → Add-on Store → ⋮ (rechtsboven) → **Repositories**.
2. Voeg toe: `https://github.com/danieldh00/lijstjes` (of het pad naar jouw
   fork/branch). Vereist dat de repository **publiek** leesbaar is voor
   Supervisor.
3. Installeer de add-on "Lijstjes" en start 'm — geen configuratie verplicht.
4. Open het **Lijstjes**-paneel in het HA-zijmenu (ingress, automatisch
   ingelogd), of ga naar poort 3100 op het IP-adres van je Home
   Assistant-instantie voor de installeerbare PWA (zie DOCS.md voor het
   koppelen met een Long-Lived Access Token).

## Lokaal draaien (zonder add-on)

```bash
cd lijstjes/backend
npm install
cp .env.example .env        # vul HA_URL en HA_TOKEN in, of laat leeg en koppel via de app zelf
npm start                    # start op http://localhost:3100
```

Of met Docker Compose vanuit de hoofdmap van deze repo:

```bash
docker compose up -d --build
```

De data (de koppeling met je Home Assistant-instantie) staat in een named
volume (`lijstjes-data`) en blijft dus behouden tussen herstarts en updates.

## Offline gebruik & synchronisatie

Zie `lijstjes/DOCS.md` voor de volledige uitleg. Kort samengevat: de eerste
keer op een toestel moet online zijn (de app moet je lijstjes ergens vandaan
halen); daarna werkt alles lokaal — een lijstje openen, een item afvinken of
toevoegen — en komt elke wijziging in een lokale wachtrij die naar Home
Assistant gestuurd wordt zodra er weer verbinding is.

## Over het icoon

Het app-icoon is het officiële Home Assistant-logomerk (bron:
[home-assistant/assets](https://github.com/home-assistant/assets), met een
eigen groene vink-badge erbovenop voor het "todo"-karakter van deze app. Dit
logo is een handelsmerk van de Open Home Foundation; gebruik als icoon van
een persoonlijke, niet-commerciële Home Assistant-integratie zoals deze
add-on valt binnen hun richtlijnen, maar niet binnen commercieel gebruik.
Zie `home-assistant-assets/logo/README.md` (of
[design.home-assistant.io](https://design.home-assistant.io/#brand/logo))
als je dit verder wilt verspreiden.

## Bekende beperkingen

- Pushmeldingen bij een HA-wijziging komen normaal near-instant binnen via
  Home Assistants WebSocket-API; alleen als die verbinding niet lukt, valt
  de add-on terug op periodiek controleren (maximaal de pollinterval van 20
  seconden vertraging) — in beide gevallen volledig automatisch en zonder
  dat de app open hoeft te staan. Een reeks wijzigingen die bij elkaar hoort
  levert één melding per lijstje op (zie DOCS.md), geen melding per
  wijziging.
- Bij een conflict (hetzelfde item op twee toestellen gewijzigd terwijl
  beide een tijd offline waren) is er geen "slimme" merge — de laatst
  binnenkomende wijziging wint, net als bij de Russisch Leren-app. Voor
  persoonlijk/huishoudelijk gebruik is dat in de praktijk geen probleem.
- De directe poort-3100-route (buiten ingress om) is na koppeling met een
  Long-Lived Access Token toegankelijk voor elk toestel op hetzelfde
  netwerk dat het gekoppelde sessie-cookie heeft — er is geen los account
  per gezinslid. Wil je dat wel, dan is een aanvullend account-systeem
  nodig (bewust niet gebouwd, op uitdrukkelijk verzoek). Een kwijtgeraakt of
  niet meer vertrouwd toestel kan je wel direct de toegang ontnemen via het
  tandwiel-icoontje boven het lijstjes-overzicht → "Ontkoppel dit toestel"
  (op dat toestel zelf) — dat trekt alleen de koppeling van dát toestel in.
- Nieuwe lijstjes aanmaken vraagt Home Assistant's config-entries-flow-API
  aan (dezelfde API die het frontend gebruikt om integraties toe te
  voegen); dit is getest tegen de `todo.get_items`-service-respons, maar
  het aanmaken van een nieuwe `local_todo`-lijst kon niet end-to-end tegen
  een echte Home Assistant-instantie getest worden vanuit deze
  ontwikkelomgeving — controleer dit als eerste na installatie.
