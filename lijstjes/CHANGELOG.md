# Changelog

## 0.3.0

- Voorspellende suggesties bij het toevoegen van een item: terwijl je typt
  toont de app suggesties op basis van wat je in dat lijstje ooit eerder
  hebt toegevoegd (ook items die inmiddels afgevinkt en verwijderd zijn).
  Werkt volledig lokaal en offline; tik/klik een suggestie aan of selecteer
  'm met de pijltjestoetsen + Tab/Enter.

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
