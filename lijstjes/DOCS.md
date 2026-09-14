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
