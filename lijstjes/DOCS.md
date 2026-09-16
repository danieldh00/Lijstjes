# Lijstjes

Offline-first lijstjes-app (boodschappen, klussen, taken) die rechtstreeks
synchroniseert met je bestaande Home Assistant to-do-lijsten. Geen eigen
account of inlogscherm: de app hergebruikt je Home Assistant-instantie als
enige bron van waarheid.

## Installatie

1. Start de add-on. Er is geen configuratie verplicht.
2. Open de webinterface via het **Lijstjes**-paneel in het HA-zijmenu
   (ingress — automatisch ingelogd als de HA-gebruiker die het paneel opent),
   of via poort 3100 op het IP-adres van je Home Assistant-instantie voor de
   losse, installeerbare PWA.
3. Open je bij die laatste route voor het eerst, dan vraagt de app één keer
   om een **Long-Lived Access Token**: Home Assistant → je profiel (linksonder,
   klik op je naam) → tabblad **Beveiliging** → **Long-Lived Access Tokens** →
   **Token aanmaken**. Plak die in de app. Vanaf dat moment onthoudt dit
   toestel de koppeling en hoef je 'm niet opnieuw in te voeren.

## Lijstjes en items

- Lijstjes die je in de app aanmaakt, verschijnen automatisch ook als nieuwe
  to-do-lijst in Home Assistant (via een nieuwe `local_todo`-integratie) en
  andersom: lijstjes die je in HA aanmaakt, verschijnen in de app.
- Items toevoegen, afvinken, verwijderen, herordenen en (optioneel) een
  einddatum/omschrijving instellen — dit synchroniseert beide kanten op:
  wijzig je iets via Assist/voice, de HA-app of het dashboard, dan zie je dat
  ook in Lijstjes en omgekeerd.
- Staan er afgevinkte items in een lijstje, dan verschijnt boven die sectie
  een **Legen**-knop: met één tik (en een bevestiging) verwijder je alle
  afgevinkte items tegelijk, ook in Home Assistant.
- Elk lijstje krijgt automatisch een icoon en kleur op basis van zijn naam:
  een winkelwagen bij Boodschappen, gereedschap bij Klussen, een koffer bij
  de Inpaklijst, een cadeau bij een verjaardag. Dit werkt ook voor nieuwe
  lijstjes — terwijl je de naam typt, zie je het icoon al meebewegen. Kent
  de app de naam niet, dan krijgt het lijstje een neutraal lijstpictogram
  met een vaste eigen kleur. Je hoeft dus nooit zelf een icoon te kiezen.
- De naam van een lijstje aanpassen kan via het ⚙-icoontje boven aan dat
  lijstje. De nieuwe naam wordt ook in Home Assistant zelf doorgevoerd (zowel
  de integratie als de entiteit), en het icoon past zich automatisch aan. Je
  items blijven staan en het entity_id verandert niet, dus automatiseringen
  die naar die lijst verwijzen blijven werken.
- Een lijstje verwijderen (✕ op het overzicht, met bevestiging) verwijdert
  ook echt de onderliggende `local_todo`-integratie in Home Assistant, inclusief
  alle items erin — dit kun je niet ongedaan maken.
- Lijstjes herordenen (↑/↓ op het overzicht) is puur een weergavevoorkeur
  van de app zelf: dit wijzigt niets in Home Assistant en heeft geen
  HA-equivalent, maar de volgorde wordt wel bewaard op de add-on (niet per
  toestel) zodat 'm op al je gekoppelde toestellen hetzelfde is.

## Maaltijden uit Mealie op je boodschappenlijst

Zet **Maaltijden** aan via het ⚙-icoontje op een lijstje. Je Mealie-weekmenu
van de komende week komt dan in de "Snel toevoegen"-rij te staan, achter je
sjablonen — die doen tenslotte hetzelfde. Daaronder staat een zoekveld over
al je recepten. Eén tik op een maaltijd zet alle ingrediënten op de lijst, als
"Gehakt (500 g)" en "Uien (2 stuks)" — product vooraan, hoeveelheid erachter.

Dit werkt via **Home Assistant's eigen Mealie-integratie**, niet via een
aparte koppeling: de app hoeft je Mealie-adres en -token dus niet te kennen.
Die integratie moet je wel één keer toevoegen:

1. In Mealie: je profiel → **Manage API Tokens** → maak een token aan.
2. In Home Assistant: **Instellingen → Apparaten & diensten → Integratie
   toevoegen → Mealie**, vul het adres van je Mealie-server in plus dat token.

Staat die integratie er nog niet, dan zegt de app dat gewoon in plaats van te
mislukken. Het ophalen van het weekmenu en de ingrediënten vraagt verbinding —
dat doe je thuis bij het samenstellen van je lijst. De items die eruit komen
staan daarna, net als alle andere, gewoon offline op je lijst.

## Sjablonen en winkels aanzetten per lijstje

Niet elk lijstje heeft hier iets aan — bij Klussen wil je geen "Snel
toevoegen" of winkel-indeling zien. Daarom staan Sjablonen en Winkels per
lijstje aan of uit, in te stellen via het ⚙-icoontje boven aan een lijstje.
Standaard staan ze uit, **behalve** als je er al sjablonen/winkels voor had
aangemaakt vóór deze instelling bestond — dan blijft dat gewoon zichtbaar
zonder dat je iets hoeft te doen.

## Sjablonen: snel meerdere items in één keer toevoegen

Onder "Snel toevoegen" bij elk lijstje kun je een sjabloon opslaan: een naam
plus een lijst van items, bijvoorbeeld een maaltijd ("Pasta-avond" →
spaghetti, gehakt, tomatenblokjes, ui) of iets anders dat je vaak in één
keer toevoegt. Een tik op het sjabloon voegt alle items er meteen bij —
werkt ook offline, net als losse items toevoegen. Sjablonen horen bij één
specifiek lijstje (aangemaakt vanuit dat lijstje) en zijn geen
Home Assistant-concept: ze staan alleen in de eigen opslag van deze add-on,
niet in HA zelf. Aanmaken en verwijderen van een sjabloon vereist wel
online te zijn.

## Winkels: items groeperen op waar je ze moet halen

Handig voor een boodschappenlijstje met meerdere vaste winkels. Voeg bij een
lijstje via "+ Winkel" een of meer winkels toe (bv. Albert Heijn, Jumbo, de
bakker); wijs bij het toevoegen of bewerken van een item een winkel toe. De
lijst groepeert open items dan automatisch per winkel, zodat je overzichtelijk
per winkel kunt afvinken. Gebruik je geen winkels, dan blijft de lijst gewoon
plat zoals altijd.

Net als sjablonen is dit geen apart HA-concept — welke winkels er per lijst
bestaan staat in de eigen opslag van de add-on. De koppeling van een *item*
aan een winkel staat wél gewoon in Home Assistant zelf (in het
omschrijving-veld van het item, als eerste regel met een 🏪-icoontje ervoor),
dus die blijft ook zichtbaar en bruikbaar als je het lijstje via de HA-app of
Assist bekijkt.

## Offline gebruik & synchronisatie

De app is *local-first*: eenmaal geopend (via de directe poort-3100-route,
niet ingress) staat de volledige inhoud van je lijstjes lokaal op het
toestel. Vanaf dat moment werkt alles zonder netwerk: een lijstje openen,
een item afvinken of toevoegen — allemaal lokaal, direct zichtbaar. Elke
wijziging komt in een lokale wachtrij en wordt naar Home Assistant gestuurd
zodra er weer verbinding is (idempotent, dus een herhaalde poging na een
onderbroken verbinding veroorzaakt geen dubbele items). Handig voor de
supermarkt zonder bereik: je boodschappenlijst blijft gewoon bruikbaar.

**Bewuste grens:** de eerste keer op een toestel moet online zijn (de app
moet de inhoud ergens vandaan halen); daarna werkt dat toestel altijd
offline totdat er weer verbinding is om te synchroniseren.

**Verversen terwijl de app niet open staat.** Een webapp kan normaal alleen
data ophalen terwijl 'ie open is. Met **meldingen aangezet** (zie hieronder)
gebeurt dat ook zonder: elke keer dat de add-on op de achtergrond een
wijziging in Home Assistant detecteert en een pushmelding stuurt, ververst
de service worker op je toestel tegelijk ook stilletjes de offline-kopie —
nog vóórdat je de melding aantikt of de app opent. Kom je later zonder
bereik in de winkel en open je de app, dan staat de nieuwste stand er dus al
in, ook al heb je de app zelf niet geopend sinds de wijziging. Zonder
meldingen aan blijft de offline-kopie op de stand van de laatste keer dat je
de app zelf open had staan.

**Bijwerken naar een nieuwe versie van de app zelf.** Een webapp op je
beginscherm wordt bij het openen meestal *hervat* in plaats van opnieuw
geladen. Er is dan geen navigatie, dus de browser merkt uit zichzelf niet dat
er een nieuwe versie klaarstaat — en zonder adresbalk kun je ook niet even
verversen. Daarom controleert de app dat nu zelf elke keer dat hij in beeld
komt. Staat er een nieuwe versie klaar, dan wordt die pas doorgevoerd op het
moment dat je de app wegklikt — ongezien, zodat je nooit een verversing in
beeld krijgt. De volgende keer dat je 'm opent draait de nieuwe versie. Al je
lijstjes en wachtende wijzigingen staan lokaal opgeslagen en blijven daarbij
gewoon staan.

## Pushmeldingen bij wijzigingen vanuit Home Assistant

Een wijziging die rechtstreeks in Home Assistant wordt gemaakt — via het
dashboard, Assist/voice, of een automatisering — komt ook als pushmelding
binnen op je gekoppelde toestellen, **zonder dat je de app hoeft te
openen**. De add-on luistert hiervoor op de achtergrond mee via Home
Assistants WebSocket-API (near-instant); lukt die verbinding niet (bv. een
oudere HA-versie of een netwerkbeperking), dan valt de add-on automatisch
terug op periodiek controleren (elke 20 seconden, zolang de add-on draait).
In beide gevallen krijg je een melding met de lijstnaam en wat er veranderd
is; een tik op de melding opent de app direct op dat lijstje. Het toestel
waarop de wijziging zelf gemaakt is, krijgt daar geen dubbele melding over.

Je krijgt hooguit **één melding per lijstje**, ook als je in één keer een hele
boodschappenlijst vult. Zodra een reeks wijzigingen begint gaat er meteen een
melding uit (zodat een losse wijziging niet onnodig blijft liggen); loopt die
reeks door, dan wordt er alleen nog opgeteld, en zodra het rustig is vervangt
de eindstand ("20 toegevoegd") stilletjes die eerste melding in plaats van er
een nieuwe naast te zetten.

Dit is meteen ook de enige manier waarop een webapp data mag ophalen
terwijl hij niet open staat: elke pushmelding is voor de service worker op
je toestel de kans om de offline-kopie op de achtergrond te verversen (zie
"Verversen terwijl de app niet open staat" hierboven). Meldingen aanzetten
is dus niet alleen handig, maar de manier waarop de app up-to-date blijft
zonder dat je 'm zelf hoeft te openen.

Zet dit aan via de knop **"Meldingen aanzetten"** boven aan het
lijstjes-overzicht (alleen zichtbaar op de directe poort-3100-route, niet in
het ingress-paneel). Je browser vraagt daarna eenmalig om toestemming.

- Op iPhone/iPad werkt dit alleen vanuit de **geïnstalleerde app**
  (Safari → Delen → "Zet op beginscherm", iOS 16.4 of nieuwer) — precies
  dezelfde beperking als bij de dagelijkse herinnering van Russisch Leren.
- Vereist een `https://`-verbinding buiten je eigen netwerk (net als de
  service worker) — binnen je eigen wifi werkt `http://` ook.
- Zet je browser-meldingen voor deze site later uit, dan stopt de app
  vanzelf met pushen naar dat toestel (de browser meldt dat aan de add-on).

## Installeren als app op iPhone/iPad

Net als andere PWA's: open de directe URL (poort 3100, niet het
ingress-paneel) in **Safari**, tik op het deelicoon → **"Zet op
beginscherm"**. Voor volledige service-worker-ondersteuning (offline-caching
van de app zelf) is een `https://`-verbinding nodig — zie de sectie
"Bereikbaar maken van buiten je netwerk" in de hoofd-README voor een
Cloudflare Tunnel-voorbeeld.

## Data

De koppeling met je Home Assistant-instantie (server-side) staat in de
persistente opslag van deze add-on (`/data`) en blijft dus behouden bij
herstarts en updates. Je lijstjes zelf staan niet dubbel opgeslagen op de
server — Home Assistant blijft de enige bron van waarheid; de add-on is een
dunne, offline-vriendelijke laag ervoorheen.
