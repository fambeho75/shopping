# Inköpslista

En enkel inköpslista för mobilen, att bocka av när man handlar på Willys.
Statisk sida på GitHub Pages, ingen backend.

**Sida:** https://fambeho75.github.io/shopping/

## Uppdatera listan (Kocken)

All data ligger i **en enda fil: `list.json`** i repots rot.
Skriv över hela filen varje torsdag med veckans lista och pusha till `main`.
Sidan hämtar alltid filen färskt (ingen cache, ingen service worker).

### Format

```json
{
  "week": "2026-W47",
  "meals": [
    { "day": "Måndag", "name": "Pasta med köttfärssås" }
  ],
  "sections": [
    {
      "name": "Frukt och grönt",
      "items": [
        { "name": "Potatis", "qty": "2 kg" },
        { "name": "Bananer" }
      ]
    }
  ]
}
```

- `week` – ISO-vecka `ÅÅÅÅ-Wvv`, t.ex. `"2026-W47"`. **Obligatorisk.** Visas som "Vecka 47".
- `meals` – valfri lista med `{ "day", "name" }`. Visas överst som hopfällbar "Veckans middagar".
- `sections` – lista med avdelningar, var och en med `name` och `items`.
  - `items[].name` – varans namn (obligatoriskt).
  - `items[].qty` – mängd som fri text, t.ex. `"2 kg"`, `"1 burk"` (valfritt).

Avdelningarna visas alltid i butiksordning:
**Frukt och grönt, Bröd, Kött, Mejeri, Frys, Skafferi.**
Använd exakt de namnen. Tomma eller saknade avdelningar hoppas över.
Okända avdelningsnamn visas efter de kända. Frysvaror hör hemma under "Frys".

## Bockar

Avbockade varor gråas ut och flyttas längst ner i sin avdelning.
Bockarna sparas **bara på telefonen** (localStorage), kopplade till veckan
och listans innehåll – de nollställs automatiskt när en ny eller ändrad lista kommer.
Knappen **Nollställ** tar bort alla bockar för aktuell lista.

## Filer

`index.html`, `styles.css`, `app.js`, `list.json`, `manifest.webmanifest`,
`favicon.svg`, `icons/` (SVG-källa + PNG 180/192/512). Lägg till på hemskärmen
i iPhone via Safari → Dela → Lägg till på hemskärmen.
