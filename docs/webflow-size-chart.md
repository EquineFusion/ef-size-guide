# Slik legges size chart-tabellen inn i Webflow

For deg som skal legge den nye size chart-tabellen inn på produktsidene, også hvis du aldri har
brukt Webflow Designer før. Regn med ca. 30 minutter, pluss testing.

> **Kort fortalt:** Du legger inn **ett** Embed-element i **produktmalen** (ikke på hver produktside),
> der den gamle «Size & Width»-tabellen står i dag. Samme kode virker for Active, Trailblazer, Ultra
> og Trekking – tabellen finner selv riktig modell ut fra adressen til siden.
> Test alltid på testadressen (`….webflow.io`) før du publiserer på eqfusion.com.

---

## Før du begynner

- **Word-guide for den som gjør jobben:** «Guide 4 - Fjerne gammel size chart - Webflow.docx» i den
  felles mappen (Nettsiden › Size chart master chart). Den dekker alt under, steg for steg, inkludert
  fjerning av den gamle tabellen. Denne filen er den tekniske oversikten.
- **Versjon:** Koden under bruker `v1.1.0`. Kalkulatoren (som står over tabellen) skal ha
  **samme versjon**. Kalkulatoren ligger i produktmalen på `v1.0.0` (sett live 29.09.26) – bytt den
  til `v1.1.0` samtidig. Ellers følger ikke kalkulatoren og tabellen hverandre når kunden bytter
  mellom cm og inches.
- **Den gamle tabellen** skjules først når den nye er testet på testadressen (steg 4).
- Du trenger tilgang til Webflow-prosjektet for eqfusion.com med rett til å redigere og publisere.

## Koden som skal limes inn

Kopier nøyaktig dette (alle linjene):

```html
<div id="ef-size-chart"></div>
<script type="module">
  import { mountChart }
    from 'https://cdn.jsdelivr.net/gh/EquineFusion/ef-size-guide@v1.1.0/src/chart.js';
  mountChart(document.getElementById('ef-size-chart'));
</script>
```

Hva koden gjør: den første linjen lager en tom boks. Scriptet henter tabellen fra GitHub
(via jsDelivr, låst til versjon `v1.1.0`), leser målene fra den samme datafilen som kalkulatoren,
og fyller boksen. Det er ingen mål i Webflow – alt kommer fra Excel-filen via datafilen.

---

## 1. Åpne produktmalen i Webflow Designer

1. Logg inn på [webflow.com](https://webflow.com) og åpne prosjektet for eqfusion.com → **Open Designer**.
2. Klikk på **Pages**-ikonet (arket øverst i venstremenyen).
3. Rull ned til **CMS Collection pages** og klikk på malen for produkter
   (heter typisk **Products Template**). Du redigerer nå **alle** produktsidene på én gang.
4. Øverst i Designer kan du velge hvilket produkt som vises som eksempel – velg f.eks. **Active**.

## 2. Finn plassen der den gamle tabellen står

Slik er produktmalen bygget i dag (sjekket på eqfusion.com 29.09.26):

```
Main Wrapper
├─ Code Embed  ← kalkulatoren (ef-size-guide, v1.0.0)
├─ …
└─ Section Table10
   └─ Page Padding › Container Large › Padding Vertical
      └─ Table10 Component  ← den gamle tabellen («Size & Width» + CMS-listen #cms-product-size-guide)
```

1. Åpne **Navigator** (ikonet med lagdelte firkanter i venstremenyen) – den viser alle elementene
   som en liste. Klikk på den gamle «Size & Width»-tabellen på siden, så markeres **Table10 Component**.
2. Kalkulatoren står **over** tabellen, slik den skal.

## 3. Legg inn Embed-elementet (og oppdater kalkulatoren)

1. Kalkulatorens Code Embed: bytt `@v1.0.0` til `@v1.1.0` → **Save & Close**.
2. Klikk **Add elements** (plusstegnet øverst i venstremenyen).
3. Under **Advanced**: dra **Code Embed** inn i **Padding Vertical**, rett **under Table10 Component**
   (samme nivå, ikke inni den).
4. Et vindu for kode åpnes. Lim inn koden over. Klikk **Save & Close**.
5. I Designer vises bare en grå boks. **Det er normalt** – Webflow kjører ikke koden i Designer.
   Tabellen vises først på den publiserte siden.

## 4. Publiser til testadressen og test

1. Klikk **Publish** (øverst til høyre).
2. Huk **kun** av for testadressen (`….webflow.io`). **Ikke** huk av for eqfusion.com ennå.
3. Klikk **Publish to selected domains**.
4. Åpne testadressen og gå til hver produktside. Bruk sjekklisten under.

### Sjekkliste per produktside

Gjør dette på **Active**, **Trailblazer**, **Ultra** og **Trekking**:

- [ ] Tabellen vises under kalkulatoren, med riktig tittel («Active size chart» osv.).
- [ ] Antall størrelser: Active 10 · Trekking 10 · Ultra 7 · Trailblazer 9 (med 14.5).
- [ ] Én stikkprøve stemmer med Excel, f.eks. Active størrelse 7: Regular bredde **6.1 – 7.0**,
      lengde **6.6 – 7.5**; Slim bredde **5.1 – 6.0**.
- [ ] «Sold in pairs» / «Sold individually» stemmer for modellen.
- [ ] Trykk **inches** i tabellen: tallene blir brøker (f.eks. 2 3/8), og kalkulatoren over bytter også til inches.
      Trykk **cm** i kalkulatoren: tabellen bytter tilbake.
- [ ] «Full measuring guide» og «Find a dealer» åpner riktige sider.
- [ ] På mobil: Regular og Slim vises som to tabeller under hverandre, knappene er fullbredde,
      og siden kan ikke rulles sidelengs.
- [ ] Sidens egne stiler ødelegger ikke tabellen (fonten skal være sidens egen).

**Vises ingen tabell på en produktside?** Høyreklikk på siden → **Inspiser** → fanen **Console**.
Står det `[EF size chart] No model has product_url matching …`, stemmer ikke adressen til siden med
`product_url` i Excel. Rett `product_url` i Excel (og publiser ny versjon), eller be Claude om hjelp.

**Andre produkter i samme mal** (f.eks. tilbehør) får ingen tabell – det er med vilje. Tabellen
viser aldri feil modell. Overskriften «Size & Width» ligger inni Table10 Component, så den
forsvinner sammen med den gamle tabellen – det blir ingen tom overskrift.

## 5. Skjul den gamle tabellen og publiser på eqfusion.com

Når alt i sjekklisten er i orden på testadressen:

1. Marker **Table10 Component** → **Element settings** (tannhjulet, tast D) → **Visibility: Hidden**.
   **Ikke** bruk *Display: None* i Style-panelet – det endrer klassen `table10_component` og kan skjule
   tabeller andre steder på nettstedet. **Ikke slett** den – den inneholder CMS-listen
   `#cms-product-size-guide`, som ikke skal fjernes før Sven Erik sier fra.
   Publiser til testadressen igjen for en siste kontroll.
2. **Publish** → huk av for **eqfusion.com** (og testadressen) → **Publish to selected domains**.
3. Åpne en produktside på eqfusion.com og gå gjennom sjekklisten raskt én gang til.
4. GA4: se `docs/analytics.md` for å registrere den nye parameteren `source` og teste i DebugView.

---

## Angre

- **Noe er galt med tabellen etter publisering:** Åpne produktmalen → marker Embed-elementet i
  **Navigator** → trykk **Delete** på tastaturet. Sett **Table10 Component** tilbake til
  *Visibility: Visible*. Publiser.
  Webflow har også **Backups** (Site settings → Backups) som kan gjenopprette en tidligere versjon av hele siden.
- **Feil i en ny versjon (f.eks. `v1.1.1`):** Bytt versjonen i koden tilbake til forrige (f.eks. `@v1.1.0`)
  og publiser. Gamle versjoner ligger alltid på jsDelivr.

## Ny versjon senere (f.eks. endrede mål)

Tabellen og kalkulatoren henter mål fra samme datafil. Når målene endres i Excel, lages en ny versjon
(se `docs/data-guide.md`, «Slik endrer du mål»). I Webflow byttes da `@v1.1.0` til den nye versjonen
**både** i tabellens Embed-kode (produktmalen) **og** i kalkulatorens Embed-kode. Publiser på testadressen først.

## For utviklere: innstillinger

`mountChart(element, options)` – alle valgfrie:

| Option | Standard | Bruk |
|---|---|---|
| `model` | fra `data-model` på elementet, ellers fra sidens adresse | Tving en modell: `mountChart(el, { model: 'active' })` eller `<div id="ef-size-chart" data-model="active">` |
| `dataUrl` | `../data/size-chart.json` (samme versjon som chart.js) | Annen datafil |
| `loadCss` | `true` | `false` hvis `chart.css` legges inn på annen måte |
| `onAnalytics` | – | Feilsøking: `function(name, params)` for hver analytics-hendelse |

Modellen finnes ved å sammenligne **stien** i sidens adresse (f.eks. `/products/active-jogging-shoe`)
med stien i `product_url` for hver modell i Excel. Domene, `?…` og avsluttende `/` spiller ingen rolle,
så det virker både på `….webflow.io` og eqfusion.com. En ny modell i Excel med `product_url` virker
automatisk, uten kodeendring.
