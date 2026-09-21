# Changelog

## Unreleased

- **Voorspellende suggesties werken nu ook voor huisgenoten.** Wat je in een
  lijstje typt telt voortaan mee als suggestie op alle toestellen die deze
  add-on gebruiken, niet meer alleen op het toestel waarmee je het zelf
  typte — net als het winkel-geheugen per item (zie 0.13.0) werkt dit
  gedeeld, los van Home Assistant. Elk toestel houdt daarnaast een eigen
  lokale kopie bij, zodat suggesties ook offline blijven werken.

## 0.13.3

- **Voorspellende suggesties bij het toevoegen van een item.** Terwijl je
  typt toont de app suggesties op basis van wat je in dat lijstje ooit
  eerder hebt toegevoegd — ook items die inmiddels afgevinkt en opgeruimd
  zijn. Werkt volledig lokaal en offline; tik/klik een suggestie aan of
  selecteer 'm met de pijltjestoetsen + Tab/Enter. Kies je een suggestie
  in een lijst met winkels, dan wordt ook meteen de bijbehorende winkel
  ingevuld, net als bij handmatig typen.

## 0.13.2

- **De echte oorzaak gevonden van de mislukte item-bewerking uit 0.13.1:**
  Home Assistant wijst een lege einddatum af met een foutmelding (een
  einddatum verwijderen is iets anders dan 'm leeglaten) — daardoor
  mislukte vrijwel elke bewerking van een item zonder einddatum, wat zich
  na de vorige fix toonde als een aanhoudende "Synchroniseren mislukt"-
  melding. Bewerken zonder einddatum werkt nu gewoon.
- Opgeruimd: een push-abonnement waarvan de sleutel niet meer klopt (bv.
  na een vervangen sleutelbestand) bleef bij elke controle opnieuw falen
  en de log vollopen — wordt nu net als een verwijderd abonnement
  opgeruimd.

## 0.13.1

- **Fix: een bewerkt item sprong terug naar zijn oude waarde.** Een
  achtergrondcontrole die toevallig vlak vóór het opslaan begon (de
  gewone 15-secondencontrole, of het scherm dat weer in beeld kwam) kon
  daarna alsnog binnenkomen en de net opgeslagen wijziging overschrijven.
  Een mislukte wijziging (bv. door een tijdelijke hapering) verdween
  voorheen ook stilletjes in plaats van het opnieuw te proberen — dat
  gebeurt nu niet meer, en de statusbalk laat het zien als er iets nog
  niet is gelukt.
- **Fix: "Maaltijden" bleef niet aanstaan.** Bij het opslaan van de
  lijst-instellingen werd deze schakelaar niet meegestuurd (in de app én
  in de add-on) en viel steeds stilletjes terug op uit, waardoor de
  maaltijden nooit in "Snel toevoegen" verschenen.

## 0.13.0

- **Winkel-geheugen.** De app onthoudt voortaan welke winkel bij welke
  itemnaam hoort: typ je "Melk" en die stond eerder bij Albert Heijn, dan
  staat die winkel meteen goed geselecteerd — ook als het oude item allang
  afgevinkt en opgeruimd was. Werkt ook bij het met één tik toevoegen van
  een heel sjabloon. Kies je een andere winkel, dan onthoudt de app
  voortaan die.

## 0.12.1

- **"Ontkoppel dit toestel"** stond direct op het lijstjes-overzicht en was
  daardoor te makkelijk per ongeluk aan te tikken. Die actie staat nu achter
  een eigen instellingenscherm, bereikbaar via het tandwiel-icoontje boven
  het overzicht (alleen op de directe poort-3100-route).

## 0.12.0

- **Beveiligingsfix:** de directe poort-3100-route accepteerde ten onrechte
  een door de client zelf meegestuurde header als bewijs dat een verzoek via
  het HA-ingress-paneel binnenkwam, wat pairing volledig omzeilde voor wie
  die poort kon bereiken. Ingress-verkeer wordt nu alleen nog vertrouwd als
  het daadwerkelijk van Supervisors interne adres komt.
- Een wijziging via `/api/sync` kan niet langer een willekeurige HA-entiteit
  aanspreken die niet als lijstje in de app voorkomt.
- Nieuw: **"Ontkoppel dit toestel"** onder aan het lijstjes-overzicht (op de
  directe poort-3100-route) — trekt de koppeling van dat ene toestel meteen
  in, zonder de add-on te herstarten of andere toestellen te raken.
- Foutmeldingen van Home Assistant komen niet langer met de volledige,
  ongefilterde responstekst in de browser terecht (wel nog volledig in de
  add-on-log, voor het uitzoeken van problemen).
- Pushmeldingen bij een wijziging vanuit Home Assistant komen nu near-instant
  binnen via HA's WebSocket-events; de bestaande periodieke controle
  (elke 20 seconden) blijft als vangnet draaien voor het geval die
  verbinding een keer niet lukt.
- Alle API-routes hebben nu een basale limiet op het aantal verzoeken per
  toestel, en koppelpogingen zijn expliciet begrensd tegen ongelimiteerd
  token-giswerk.

## 0.11.1

- Maaltijden staan nu tussen de sjablonen in plaats van in een eigen blok
  erboven: één "Snel toevoegen"-rij met eerst je sjablonen, daarna de
  maaltijden uit je weekmenu. Ze doen tenslotte hetzelfde — met één tik een
  setje items op de lijst zetten.

## 0.11.0

- **Maaltijden uit Mealie.** Zet "Maaltijden" aan via het ⚙-icoontje op een
  lijstje (bv. Boodschappen) en je ziet daar je Mealie-weekmenu van de
  komende week, plus een zoekveld over al je recepten. Eén tik op een
  maaltijd zet alle ingrediënten op de lijst.
- De ingrediënten komen als "Gehakt (500 g)" en "Uien (2 stuks)" op de lijst:
  het product vooraan, de hoeveelheid erachter. Zo blijft de lijst te
  groeperen per winkel en zie je in de winkel toch hoeveel je nodig hebt.
  Halve en kwart hoeveelheden worden als breuk getoond (1/2 l), en
  meervoudsvormen en afkortingen volgen wat je in Mealie hebt ingesteld.
- Dit loopt volledig via Home Assistant's eigen Mealie-integratie, dus de
  app hoeft zelf geen Mealie-adres of token te kennen. Is die integratie nog
  niet ingesteld, dan zegt de app dat gewoon in plaats van te mislukken.
  Ophalen vereist verbinding; de items die eruit komen staan daarna gewoon
  offline op je lijst.

## 0.10.0

- Je kunt de naam van een lijstje aanpassen, via het ⚙-icoontje boven aan een
  lijstje. De naam wordt ook in Home Assistant zelf aangepast (zowel de
  integratie als de entiteit), en het icoon volgt automatisch de nieuwe naam.
  Je items blijven gewoon staan. Hernoemen werkt net als elke andere
  wijziging ook offline: het komt in de wachtrij en gaat vanzelf door zodra
  er weer verbinding is.
- Nooit meer een zichtbare verversing van de app. Een nieuwe versie werd tot
  nu toe meteen geladen zodra die klaarstond, wat een korte knipper gaf
  terwijl je ernaar keek. Dat gebeurt nu pas op het moment dat de app naar de
  achtergrond gaat, zodat je het niet ziet en de nieuwe versie klaarstaat als
  je 'm weer opent.

## 0.9.2

- De synchronisatie gebeurt nu volledig onzichtbaar. De balk bovenin liet bij
  elke poll (elke 15 seconden) en na elke wijziging even "Synchroniseren…" of
  een telling van wachtende wijzigingen zien; dat is alleen maar ruis, want
  het gaat vanzelf goed.
- De balk verschijnt daarom alleen nog als er iets is wat je echt moet weten:
  dat je offline bent (handig als je in een winkel zonder bereik staat), of
  dat een wijziging niet weggeschreven kon worden en dus nog alleen op dit
  toestel staat. Een mislukte achtergrondcontrole zonder wachtende
  wijzigingen kost niets en blijft nu stil.

## 0.9.1

- De geïnstalleerde webapp bleef op een oude versie hangen terwijl dezelfde
  site in Safari wél bijwerkte. Oorzaak: een webapp op het beginscherm wordt
  bij het openen meestal *hervat* in plaats van opnieuw geladen. Zonder
  navigatie haalt de browser `sw.js` niet opnieuw op, dus een nieuwe versie
  werd niet eens opgemerkt — en ook als dat wel gebeurde, bleef de al
  geladen JS/CSS draaien tot de pagina herlaadde, wat in een webapp zonder
  adresbalk niet zelf te doen is. In een Safari-tab gebeurt allebei vanzelf.
- De app controleert nu bij elke keer dat hij in beeld komt op een nieuwe
  versie, en herlaadt zichzelf zodra die klaarstaat. Alle gegevens staan
  lokaal opgeslagen, dus daar gaat niets bij verloren.

## 0.9.0

- Nieuw uiterlijk, in de stijl van Home Assistant zelf: dezelfde kleuren
  (het lichtblauw van HA in plaats van groen), dezelfde kaartvorm en
  dezelfde donker/licht-tinten als het standaardthema.
- Elk lijstje krijgt automatisch een passend icoon op basis van de naam —
  een winkelwagen bij Boodschappen, gereedschap bij Klussen, een koffer bij
  de Inpaklijst, een cadeau bij een verjaardag, enzovoort. Dat gebeurt ook
  meteen voor een nieuw lijstje: terwijl je de naam typt zie je het icoon al
  meebewegen. Herkent de app geen trefwoord, dan volgt een neutraal
  lijstpictogram met een vaste kleur per naam.
- De iconen komen uit Material Design Icons, dezelfde set die Home Assistant
  gebruikt. Alleen de gebruikte iconen zitten in de app, dus er wordt niets
  extern geladen en ze werken gewoon offline.
- Elke lijstrij toont nu in één oogopslag hoeveel er nog open staat
  ("2 open · 1 afgevinkt", "Alles afgevinkt", "Leeg") in plaats van alleen
  een kaal getal, en de knopjes zijn echte iconen met een fatsoenlijk
  aanraakgebied geworden.

## 0.8.1

- Eigen AppArmor-profiel toegevoegd (`apparmor.txt`). Daarmee gaat de
  beveiligingsscore van de add-on in Home Assistant van 7 naar 8 (het
  maximum): de score telt +1 zodra er een geladen profiel is in plaats van
  het standaardprofiel. Het profiel staat toe wat de add-on echt doet (Node
  draaien, de eigen bestanden lezen, naar `/data` schrijven) en weigert de
  rest — mount/umount, ptrace, schrijven naar kernelinstellingen en alle
  capabilities buiten de handvol die een root-proces in deze container
  legitiem gebruikt.

## 0.8.0

- De achtergrondsynchronisatie werkt het scherm nu gericht bij in plaats van
  het hele scherm opnieuw op te bouwen. Voorheen tekende elke poll (elke 15
  seconden) en elke tabwissel alles opnieuw — ook als er niets gewijzigd
  was — waardoor het voelde als een pagina die telkens herlaadt: de
  scrollpositie sprong terug naar boven en half ingetypte tekst was weg. Nu
  blijft de pagina onaangeroerd als er niets veranderd is, en blijven bij een
  echte wijziging je scrollpositie en het invoerveld waarin je typt gewoon
  staan.
- Nog maar één pushmelding per lijstje in plaats van een hele reeks. Een
  reeks wijzigingen die bij elkaar hoort (een heel lijstje in één keer vullen
  vanuit de HA-app) gaf voorheen bij elke poll opnieuw een melding. Nu komt
  er meteen één melding zodra de reeks begint, en wordt die aan het eind
  stilletjes vervangen door de eindstand ("20 toegevoegd") in plaats van er
  meldingen naast te zetten.

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
