# Google Analytics (GA4) – size guide

Kalkulatoren (`widget.js`) og size chart-tabellen på produktsidene (`chart.js`) sender hendelser
til GA4 **automatisk** når de ligger på en side som har GA4 (`gtag`), slik eqfusion.com har.
De har ingen egen GA-kode eller målings-ID.
Uten GA4 på siden sendes ingenting, og alt virker som vanlig (testsiden viser hendelsene i Debug-panelet i stedet).

Ingen personopplysninger sendes. Mål sendes avrundet til hele millimeter.

## Hendelser

| Hendelse | Når | Parametere |
|---|---|---|
| `sizeguide_calculate` | Kunden trykker «Find my size», eller åpner en delt lenke | `result_type`, `unit`, `model_count`, `trigger`, `length_mm`, `width_mm`, `error` (kun ved ugyldig input) |
| `sizeguide_result` | Én per anbefalt modell | `model`, `size`, `variant`, `alternative_size`, `outside_chart`, `position`, `result_count` |
| `sizeguide_click_product` | «View product» | `model`, `size`, `outside_chart` |
| `sizeguide_click_dealer` | «Find a dealer» | `source`, `context` (`result` / `no_match`), `model`, `size`, `outside_chart` |
| `sizeguide_click_measure_guide` | «How to measure» / «Full measuring guide» | `source`, `context` (`form` / `no_match`) |
| `sizeguide_share` | «Copy link» | `method` (`clipboard` / `manual`) |
| `sizeguide_open_shared` | Siden åpnes fra en delt lenke (`&src=share`) | `unit` |
| `sizeguide_chart_unit` | Kunden bytter cm/inches **i size chart-tabellen** | `model`, `unit` |

Fra size chart-tabellen sendes `sizeguide_click_dealer` og `sizeguide_click_measure_guide` med
`source: 'chart'` og `model` (modellen på produktsiden). Tabellen har ikke `context`, `size` eller `outside_chart`.

### Verdier
- `source`: `calculator` (kalkulatoren) · `chart` (size chart-tabellen). Fra v1.1.0.
  Klikk fra før v1.1.0 har ingen `source` – de kom alle fra kalkulatoren.
- `result_type`: `match` · `between` (mellom to størrelser) · `outside_wide` · `outside_narrow` · `no_match` · `invalid_input`
- `trigger`: `form` (kunden trykket) · `shared_link` (åpnet delt lenke)
- `outside_chart`: `no` · `wide` · `narrow`
- `alternative_size`: størrelsen i «Near the upper limit»-rådet, eller `none`
- `unit`: `cm` · `in`

### Hva telles ikke
- Omregning ved bytte cm ↔ inches i kalkulatoren.
- At tabellen følger med når kunden bytter enhet i kalkulatoren (bare bytte *i tabellen* telles).
- Oppdatering av siden / tilbake-knappen (målene ligger i adressen, men det er ikke en ny beregning).

## Oppsett i GA4 (én gang, ca. 5 minutter)

Hendelsene telles i GA4 uten oppsett. For å se **parameterne** (modell, størrelse, resultattype …)
i vanlige rapporter må de registreres som *custom dimensions*:

1. GA4 → **Admin** (tannhjul) → **Data display** → **Custom definitions** → **Create custom dimension**.
2. Lag én per rad under. *Scope* = **Event**. *Event parameter* = nøyaktig navnet i venstre kolonne.

| Event parameter | Dimension name (forslag) |
|---|---|
| `result_type` | Size guide – result type |
| `model` | Size guide – model |
| `size` | Size guide – size |
| `variant` | Size guide – variant |
| `alternative_size` | Size guide – alternative size |
| `outside_chart` | Size guide – outside chart |
| `trigger` | Size guide – trigger |
| `context` | Size guide – context |
| `unit` | Size guide – unit |
| `source` | Size guide – source (ny i v1.1.0, se under) |

`length_mm` og `width_mm` kan registreres som **custom metrics** (Unit: Standard) hvis dere vil
se gjennomsnittsmål; ellers er de synlige i Explorations/BigQuery.

3. Marker gjerne `sizeguide_click_product` og `sizeguide_click_dealer` som **Key events**
   (Admin → Data display → Events) – det er konverteringene fra size guiden.

### Registrere `source` (ny i v1.1.0) – steg for steg

`source` forteller om klikket på «Find a dealer» eller målguiden kom fra **kalkulatoren**
(`calculator`) eller fra **size chart-tabellen** (`chart`). Uten dette kan du ikke skille dem i rapportene.
Gjøres én gang, helst samme dag som v1.1.0 publiseres (GA4 viser ikke data bakover i tid for nye dimensjoner).

1. Gå til [analytics.google.com](https://analytics.google.com) og velg eiendommen (property) for eqfusion.com.
2. Klikk **Admin** (tannhjulet nederst til venstre).
3. Under *Data display*: klikk **Custom definitions**.
4. Fanen **Custom dimensions** → blå knapp **Create custom dimension**.
5. Fyll ut:
   - **Dimension name:** `Size guide – source`
   - **Scope:** `Event`
   - **Description:** `Calculator or size chart table`
   - **Event parameter:** `source` (skriv nøyaktig slik, små bokstaver)
6. Klikk **Save**.
7. Vent 24–48 timer. Deretter kan du velge «Size guide – source» som dimensjon i rapporter og Explorations,
   f.eks. hendelsen `sizeguide_click_dealer` fordelt på `calculator` og `chart`.

Står `model` og `unit` ikke allerede i listen over custom dimensions, lag dem også (samme fremgangsmåte) –
de brukes av `sizeguide_chart_unit`.

## Teste at det virker (når widgeten ligger i Webflow)
1. Installer Chrome-utvidelsen **Google Analytics Debugger**, slå den på og åpne siden med widgeten.
2. GA4 → **Admin** → **DebugView**.
3. Beregn en størrelse og klikk «View product» – hendelsene skal dukke opp i DebugView innen noen sekunder.
4. På en produktside: bytt cm/inches i size chart-tabellen (`sizeguide_chart_unit`) og klikk
   «Find a dealer» under tabellen – `sizeguide_click_dealer` skal ha `source` = `chart`.

Nye custom dimensions vises i rapporter først etter 24–48 timer.
