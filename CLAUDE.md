# Lijstjes

Offline-first lijstjes-app (Home Assistant add-on) die synchroniseert met
Home Assistant to-do-lijsten. Zie `lijstjes/DOCS.md` voor de
gebruikersgerichte documentatie en `README.md` voor installatie/architectuur.

## Add-on-versie bumpen (lijstjes/config.yaml)

Ga er **nooit** van uit dat de git-geschiedenis van dit repo de
daadwerkelijk bij de gebruiker geïnstalleerde versie weerspiegelt. Die twee
kunnen uit elkaar lopen (bijvoorbeeld na een geschiedenis-herschrijving of
een versie die buiten git om is aangepast).

Voordat je `version` in `lijstjes/config.yaml` verhoogt:

1. Vraag (of laat de gebruiker vragen) de live status op via het
   `update.lijstjes_update`-entity in Home Assistant en kijk naar
   `installed_version`.
2. Kies een nieuw versienummer dat **hoger** is dan die `installed_version`
   -- niet alleen hoger dan het laatste versienummer dat je in de
   git-geschiedenis ziet.

Een versie die niet hoger is dan wat al geïnstalleerd staat, biedt Home
Assistant nooit aan als update; de update blijft dan onopgemerkt stil staan,
ook na handmatig verversen in de add-on store.

Een GitHub Actions-check (`.github/workflows/addon-version.yml`, met
`scripts/check_addon_version.py`) bewaakt automatisch dat de versie t.o.v.
de vorige commit omhooggaat. Die vangt alleen afwijkingen t.o.v. de
git-geschiedenis af, niet t.o.v. een live installatie die buiten git om is
afgeweken -- controleer dus altijd ook stap 1 hierboven.
