# Slik legges size chart-tabellen inn i Webflow

For deg som skal legge den nye size chart-tabellen inn på produktsidene, også hvis du aldri har
brukt Webflow Designer før. Regn med ca. 30 minutter, pluss testing.

> **Kort fortalt:** Du legger inn **ett** Embed-element i **produktmalen** (ikke på hver produktside),
> der den gamle «Size & Width»-tabellen står i dag. Samme kode virker for Active, Trailblazer, Ultra
> og Trekking – tabellen finner selv riktig modell ut fra adressen til siden.
> Test alltid på testadressen (`….webflow.io`) før du publiserer på eqfusion.com.

---

## Før du begynner

- **Versjon:** Koden under bruker `v1.1.0`. Kalkulatoren (som står over tabellen) skal ha
  **samme versjon**. Står kalkulatoren fortsatt på `v1.0.0`, bytt den til `v1.1.0` samtidig
  (se `docs/webflow-embed.md`, avsnitt 3). Ellers følger ikke kalkulatoren og tabellen hverandre
  når kunden bytter mellom cm og inches.
- **Fjerning av den gamle tabellen** er beskrevet i Word-guiden **«Fjerne gammel size chart – Webflow»**.
  Ikke fjern den gamle før den nye er testet på testadressen (steg 4).
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

1. Rull ned på siden i Designer til seksjonen **«Size & Width»** med den gamle tabellen.
2. Åpne **Navigator** (ikonet med lagdelte firkanter i venstremenyen) – den viser alle elementene
   som en liste. Klikk på den gamle tabellen på siden, så markeres den i Navigator.
3. Kalkulatoren skal stå **over** den nye tabellen, slik den gjør i dag.

## 3. Legg inn Embed-elementet

1. Klikk **Add elements** (plusstegnet øverst i venstremenyen).
2. Under **Advanced**: dra **Embed** inn i «Size & Width»-seksjonen, rett **under** den gamle tabellen
   (den gamle fjernes senere, se Word-guiden).
3. Et vindu for kode åpnes. Lim inn koden over. Klikk **Save & Close**.
4. I Designer vises bare en grå boks med teksten «Custom code». **Det er normalt** –
   Webflow kjører ikke koden i Designer. Tabellen vises først på den publiserte siden.

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
viser aldri feil modell. Står det en overskrift rundt Embed-elementet i «Size & Width»-seksjonen,
vil den fortsatt synes på disse sidene. Sjekk det, og si fra hvis det må skjules.

## 5. Publiser på eqfusion.com

Når alt i sjekklisten er i orden på testadressen:

1. Fjern den gamle tabellen etter Word-guiden «Fjerne gammel size chart – Webflow», og publiser til
   testadressen igjen for en siste kontroll.
2. **Publish** → huk av for **eqfusion.com** (og testadressen) → **Publish to selected domains**.
3. Åpne en produktside på eqfusion.com og gå gjennom sjekklisten raskt én gang til.
4. GA4: se `docs/analytics.md` for å registrere den nye parameteren `source` og teste i DebugView.

---

## Angre

- **Noe er galt med tabellen etter publisering:** Åpne produktmalen → marker Embed-elementet i
  **Navigator** → trykk **Delete** på tastaturet. Legg tilbake den gamle tabellen hvis den er fjernet
  (se Word-guiden). Publiser.
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
