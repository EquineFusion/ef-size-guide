# Google Analytics (GA4) – size guide

Widgeten sender hendelser til GA4 **automatisk** når den ligger på en side som har GA4
(`gtag`), slik eqfusion.com har. Den har ingen egen GA-kode eller målings-ID.
Uten GA4 på siden sendes ingenting (testsiden viser hendelsene i Debug-panelet i stedet).

Ingen personopplysninger sendes. Mål sendes avrundet til hele millimeter.

## Hendelser

| Hendelse | Når | Parametere |
|---|---|---|
| `sizeguide_calculate` | Kunden trykker «Find my size», eller åpner en delt lenke | `result_type`, `unit`, `model_count`, `trigger`, `length_mm`, `width_mm`, `error` (kun ved ugyldig input) |
| `sizeguide_result` | Én per anbefalt modell | `model`, `size`, `variant`, `alternative_size`, `outside_chart`, `position`, `result_count` |
| `sizeguide_click_product` | «View product» | `model`, `size`, `outside_chart` |
| `sizeguide_click_dealer` | «Find a dealer» | `context` (`result` / `no_match`), `model`, `size`, `outside_chart` |
| `sizeguide_click_measure_guide` | «How to measure» | `context` (`form` / `no_match`) |
| `sizeguide_share` | «Copy link» | `method` (`clipboard` / `manual`) |
| `sizeguide_open_shared` | Siden åpnes fra en delt lenke (`&src=share`) | `unit` |

### Verdier
- `result_type`: `match` · `between` (mellom to størrelser) · `outside_wide` · `outside_narrow` · `no_match` · `invalid_input`
- `trigger`: `form` (kunden trykket) · `shared_link` (åpnet delt lenke)
- `outside_chart`: `no` · `wide` · `narrow`
- `alternative_size`: størrelsen i «Near the upper limit»-rådet, eller `none`
- `unit`: `cm` · `in`

### Hva telles ikke
- Omregning ved bytte cm ↔ inches.
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

`length_mm` og `width_mm` kan registreres som **custom metrics** (Unit: Standard) hvis dere vil
se gjennomsnittsmål; ellers er de synlige i Explorations/BigQuery.

3. Marker gjerne `sizeguide_click_product` og `sizeguide_click_dealer` som **Key events**
   (Admin → Data display → Events) – det er konverteringene fra size guiden.

## Teste at det virker (når widgeten ligger i Webflow)
1. Installer Chrome-utvidelsen **Google Analytics Debugger**, slå den på og åpne siden med widgeten.
2. GA4 → **Admin** → **DebugView**.
3. Beregn en størrelse og klikk «View product» – hendelsene skal dukke opp i DebugView innen noen sekunder.

Nye custom dimensions vises i rapporter først etter 24–48 timer.
