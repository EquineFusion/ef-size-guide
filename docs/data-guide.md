# Slik vedlikeholder du størrelsestabellen

For deg som skal endre mål, legge til en størrelse eller en ny modell.
Du trenger ikke kunne programmering for å redigere – bare for å publisere (se steg 3).

> **Merk:** Excel-filen ligger i dag i `data/size-chart.xlsx` i prosjektmappen.
> Den skal flyttes til en felles OneDrive-mappe (se «Planlagt flytting» i `CLAUDE.md`).
> Oppskriften er den samme – bare plasseringen av filen endres.

---

## Kort fortalt

```
1. Rediger Excel  →  2. Kjør npm run build-data  →  3. Test  →  4. Publiser ny versjon
   (hvem som helst)     (sjekker at alt er gyldig)     (testsiden)   (Sven Erik / Claude)
```

**Nettsiden endres ikke automatisk når Excel endres.** Det er med vilje: byggescriptet
sjekker dataene først, så en skrivefeil aldri når kunden.

---

## 1. Rediger Excel-filen

Åpne `size-chart.xlsx` i Excel (PC eller nettleser). **Rediger kun arkene `models`, `sizes` og `settings`.**
Ikke endre kolonnenavnene i rad 1.

### Regler for tallene
- **Alle mål i hele millimeter.** 12,5 cm skrives `125`. Ingen desimaler.
- **Alle størrelser må ha både min og maks** for lengde og bredde.
- **Slim og Regular i samme størrelse har samme lengde**, men bredden må ikke overlappe.
  Regular min = Slim maks + 1. Eksempel: Slim 101–110, Regular 111–120.
- **Slim min = Regular min − 10** (vedtatt 23.09.26). Eksempel: Regular 111–120 → Slim 101–110.
- **Størrelsene følger hverandre med 1 mm steg i lengde.** Eksempel: str 12 = 116–125, str 13 = 126–135.
- **`active`** = `TRUE` eller `FALSE`. `FALSE` skjuler raden uten å slette den – nyttig for utgåtte størrelser.
- **`source`**: skriv hvor tallet kommer fra (katalog og side, eller «Navn dato»). Da vet neste person hvorfor.

### Arkene

**`models`** – én rad per modell

| Kolonne | Eksempel | Forklaring |
|---|---|---|
| `model_id` | `active` | Kort ID, små bokstaver, ingen mellomrom. Brukes også som bildefilnavn. Endres aldri etter lansering (brukes i Google Analytics). |
| `name` | `Active` | Navnet kunden ser |
| `use_case` | `Transition • Trail riding` | «Recommended for»-teksten |
| `sold_as` | `pair` | `single` eller `pair` |
| `product_url` | `https://www.eqfusion.com/products/…` | Produktsiden |
| `image_url` | `assets/images/active.jpg` | Produktbilde (se «Ny modell») |
| `active` | `TRUE` | Vises i kalkulatoren? |
| `sort_order` | `2` | Rekkefølge i resultatet |

**`sizes`** – én rad per størrelse og variant (`model_id`, `size_label`, `size`, `variant`, `length_min_mm`, `length_max_mm`, `width_min_mm`, `width_max_mm`, `active`, `source`)

- `size_label`: det kunden ser, f.eks. `12 Slim` eller `12` (Regular).
- `size`: bare tallet, f.eks. `12` eller `14.5`. Slim og Regular i samme størrelse har samme `size`.
- `variant`: `slim` eller `regular`.

**`settings`** – regler for anbefalingene (endres sjelden, snakk med Sven Erik først)

| Nøkkel | Verdi i dag | Betyr |
|---|---|---|
| `tolerance_mm` | 2 | Innenfor 2 mm fra maks → vis størrelsen over som alternativ |
| `wide_hoof_model` | ultra | Modell som foreslås for hover bredere enn tabellen |
| `wide_hoof_max_extra_length_mm` | 10 | …men bare hvis den blir maks 10 mm lengre enn hoven |
| `narrow_hoof_model` | ultra | Modell som foreslås for hover smalere enn tabellen |
| `narrow_hoof_max_below_mm` | 20 | …men bare hvis hoven er maks 20 mm smalere enn Slim min |
| `fresh_trim_add_mm` | 4 | Katalogens råd for nylig raspet hov (til informasjon) |
| `measure_guide_url` | eqfusion.com/how-to-measure… | Lenke «How to measure» |
| `dealer_finder_url` | eqfusion.com/dealers | Lenke «Find a dealer» |
| `data_version` | 2026-09-23 | **Oppdater til dagens dato når du endrer data** |

**`avvik`** – noter spørsmål/uenigheter i kildedata her. Leses ikke av kalkulatoren.

### Ny modell
1. Legg til en rad i `models` med ny `model_id`.
2. Legg til alle størrelser i `sizes` med samme `model_id`.
3. Produktbilde: kjør `npm run fetch-images` (henter bildet fra produktsiden), eller legg et bilde
   i `assets/images/` med navnet `<model_id>.jpg`. Skriv stien i `image_url`. Hold bildet under ca. 300 kB.
4. Sett `active` = `TRUE`.

---

## 2. Kjør byggescriptet

Åpne terminal i prosjektmappen og kjør:

```
npm run build-data
```

**Lukk Excel-filen på PC-en først** hvis den er åpen (den kan være låst).

### Når det går bra
```
OK: data/size-chart.json skrevet (dataversjon 2026-09-23).
4 modeller, 72 størrelser: …
0 advarsel(er).
```

### Når det er feil
Scriptet forteller nøyaktig hvor, og **ingenting blir endret** før feilen er rettet:
```
FEIL: Ark «sizes», rad 23: «width_min_mm» mangler.
FEIL: Ark «sizes», rad 30 og 31: «active 12 Slim» og «active 12» overlapper i bredde. …
Build stoppet: 2 feil. size-chart.json er IKKE oppdatert.
```
Rett i Excel, lagre, kjør på nytt.

### Advarsler
`ADVARSEL: …` stopper ikke byggingen, men les dem – f.eks. hull i lengde mellom to størrelser
betyr at noen hover får «ingen treff».

---

## 3. Test

```
npm test          # alle automatiske tester skal være grønne
npm run dev       # åpne http://localhost:5173/demo/ og prøv noen mål
```

Noen tester sjekker konkrete anbefalinger med dagens tall. Endrer du mål med vilje, kan en test
feile fordi forventningen er utdatert – be Claude oppdatere testen (og se at den nye
anbefalingen faktisk er riktig).

Oppdatere den delbare testsiden for kollegaer: `npm run build-share` og be Claude publisere på nytt.

---

## 4. Publiser

Når dataene er testet, publiseres en ny versjon til nettsiden (commit, versjons-tag på GitHub
og oppdatering i Webflow). Se `docs/webflow-embed.md`. Dette gjør Sven Erik sammen med Claude.
