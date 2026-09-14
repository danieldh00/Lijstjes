# Changelog

## 0.7.1

- "Legen"-knop boven de Afgevinkt-sectie van een lijstje: met één tik (en
  een bevestiging) alle afgevinkte items in één keer verwijderen, zowel
  lokaal als in Home Assistant.

## 0.7.0

- Lijstjes verwijderen en herordenen vanaf het overzicht: elke lijst-rij
  heeft nu een ✕ (verwijderen, met bevestiging — verwijdert ook echt de
  onderliggende `local_todo`-integratie en alle items erin uit Home
  Assistant) en ↑/↓ (herordenen, puur een weergavevoorkeur van de app,
  bewaard op de add-on zodat de volgorde hetzelfde is op al je gekoppelde
  toestellen).

## 0.6.0

- Sjablonen en Winkels staan nu per lijstje aan of uit (⚙-icoontje boven
  aan een lijstje) — niet elk lijstje (bv. Klussen) heeft er iets aan.
  Standaard uit, behalve voor een lijstje waar je die al voor gebruikte
  vóórdat deze instelling bestond: dat blijft gewoon zichtbaar zonder dat
  je iets hoeft te doen.

## 0.5.2

- Stijlfix: de winkel-dropdown (bij een item toevoegen en bewerken) gebruikte
  de kale standaardstijl van de browser en viel daardoor lelijk uit de toon
  tussen de afgeronde, donkere velden van de rest van de app. Consistente
  styling toegevoegd (zelfde pilvorm, kleuren en een subtiel pijltje) zodat
  het aansluit bij de rest.

## 0.5.1

- Bugfix: een al geïnstalleerde PWA kon op een oude versie van de app
  blijven hangen na een update. `sw.js` gebruikte een vast, met de hand
  ingesteld cachenummer (`lijstjes-shell-v1`) dat nooit veranderde -- de
  browser vergelijkt bij het bepalen of er een nieuwe service worker is de
  bytes van `sw.js` zelf, dus zolang dat bestand toevallig niet meewijzigde
  (bv. bij een update aan alleen `app.js`/`storage.js`/de CSS) zag de
  browser geen aanleiding om opnieuw te installeren en bleven oude
  bestanden in de cache staan. Zelfde fix als bij Russisch Leren: de server
  hasht de app-shell-bestanden bij het opstarten en serveert `/sw.js`
  dynamisch met die hash in de cachenaam verwerkt, plus
  `Cache-Control: no-cache` op die respons zodat ook de browser's eigen
  HTTP-cache het bestand nooit stiekem verouderd teruggeeft. Voegt ook
  netwerk-eerst laden van de pagina zelf toe (in plaats van cache-eerst),
  zodat een online sessie altijd de nieuwste versie ziet.

## 0.5.0

- Winkels: per lijstje ("bij welke winkel moet dit gehaald worden") een of
  meer winkels toevoegen, items eraan toewijzen bij het toevoegen of
  bewerken, en de lijst automatisch per winkel gegroepeerd zien — handig
  om een boodschappenlijstje overzichtelijk te houden als je bij meerdere
  winkels langsgaat. Geen winkels aangemaakt? Dan verandert er niets aan
  hoe een lijstje eruitziet. De koppeling van een item aan een winkel staat
  in Home Assistant's eigen omschrijving-veld van dat item (zichtbaar via
  Assist/de HA-app); welke winkels er per lijst bestaan, staat net als
  sjablonen in de eigen opslag van de add-on.

## 0.4.0

- Sjablonen: per lijstje een naam plus items opslaan (bv. een maaltijd
  als "Pasta-avond" → spaghetti, gehakt, ui, of een los vaak terugkerend
  item) en met één tik in één keer toevoegen — te vinden onder "Snel
  toevoegen" bovenaan elk lijstje. Werkt ook offline (het toevoegen zelf
  loopt via dezelfde outbox als losse items); een sjabloon aanmaken of
  verwijderen vereist online te zijn. Eigen concept van de app, niet van
  Home Assistant, dus opgeslagen in de eigen opslag van de add-on.

## 0.3.0

- Echte achtergrondverversing: tot nu toe kon de offline-kopie alleen
  bijwerken terwijl de app open was (via polling of het heropenen ervan).
  Voortaan ververst de service worker de offline-kopie ook wanneer de app
  helemaal niet open staat, door dat mee te liften op de pushmelding die de
  add-on al stuurt zodra 'ie een wijziging in Home Assistant detecteert --
  het enige moment waarop een webapp code mag draaien zonder open te zijn.
  Vereist dat meldingen aanstaan (zie "Pushmeldingen" in DOCS.md); de knop
  daarvoor legt dit nu ook uit.

## 0.2.2

- Layoutfix: de app-inhoud en de statusbalk hielden geen rekening met de
  safe-area van het toestel (notch/dynamic island/statusbalk), waardoor de
  bovenkant van het scherm er op de installeerbare PWA afgeknipt uitzag.
- Bugfix: op iOS kwam een wijziging die rechtstreeks in Home Assistant
  gemaakt was er niet automatisch in de app doorheen totdat je 'm expliciet
  opnieuw opende. `visibilitychange` (waar de her-sync bij het heropenen op
  leunde) vuurt op een geïnstalleerde iOS-PWA niet betrouwbaar af, en de
  pagina kan bovendien ongewijzigd uit de bfcache worden hersteld zonder dat
  onze code opnieuw draait. Toegevoegd: een verse sync bij `pageshow` en
  `focus`, die op iOS wel betrouwbaar afgaan zodra de app weer in beeld komt.

## 0.2.1

- Bugfix: koppelen met een Long-Lived Access Token via de directe
  poort-3100-route mislukte altijd wanneer de app als add-on draait
  ("Dit token werkt niet bij dat Home Assistant-adres" bij een geldig
  token). De pairing-check controleerde het token via Supervisor's eigen
  add-on-naar-Supervisor-proxy (`http://supervisor/core`), die alleen de
  eigen add-on-token van deze add-on accepteert en geen willekeurig
  gebruikerstoken doorgeeft aan Home Assistant Core. Gefixt door het
  token rechtstreeks te controleren bij Home Assistant Core zelf
  (`http://homeassistant:8123`, bereikbaar dankzij `homeassistant_api:
  true`). De pairing-foutmelding onderscheidt nu ook "kon Home Assistant
  niet bereiken" van "het token klopt niet".

## 0.2.0

- App-icoon is nu het officiële Home Assistant-logo met een groen
  vink-/takenbadge, zodat de app in het HA-zijmenu en op je beginscherm
  herkenbaar is als Home Assistant-integratie.
- Pushmeldingen: wijzigingen die rechtstreeks in Home Assistant worden
  gemaakt (dashboard, Assist, automatisering) komen nu ook als melding aan
  op gekoppelde toestellen, zonder dat de app open hoeft te staan. Een
  toestel dat zelf net een wijziging doorvoerde krijgt daar geen dubbele
  melding over. Vereist eenmalig toestemming voor meldingen op elk toestel
  (knop op het lijstjes-overzicht); op iPhone/iPad alleen vanuit de
  geïnstalleerde app (Zet op beginscherm), net als bij Russisch Leren.

## 0.1.0

- Eerste versie: lijstjes aanmaken, items toevoegen/afvinken/verwijderen,
  volledige synchronisatie met Home Assistant to-do-lijsten (`local_todo`),
  offline-first met achtergrondsynchronisatie, installeerbaar als PWA.
