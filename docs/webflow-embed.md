# Slik legges widgeten inn i Webflow (utkast)

> **Status:** Utkast. Ingenting av dette er gjort ennå. Gjøres steg for steg, med godkjenning,
> etter at prosjektet er flyttet og GitHub-repoet er opprettet.

## Oversikt

```
GitHub-repo (offentlig)  ──►  jsDelivr (gratis CDN)  ──►  Webflow-side (Embed-element)
  src/, data/, assets/         @v1.0.0 = låst versjon       <div> + 4 linjer script
```

- **jsDelivr** serverer filene fra GitHub raskt og gratis, men **bare fra offentlige repoer**.
  Det er uproblematisk: koden og målene er ikke hemmelige. Excel-filen og katalog-PDF-en ligger
  **ikke** i repoet.
- Widgeten henter selv `widget.css`, `engine.js`, `units.js`, `analytics.js`, `size-chart.json`
  og produktbildene fra **samme versjon**. Webflow trenger bare én adresse.
- Widgeten bruker sidens font og GA4 automatisk. Ingen jQuery, ingen Webflow-CMS.

## 1. Første gang: GitHub-repo

1. Repoet: `https://github.com/EquineFusion/ef-size-guide` (**Public**).
2. Push prosjektet (uten `data/size-chart.xlsx`, `source-material/`, `node_modules/`, `dist/`).
3. Lag første versjon: `git tag v1.0.0` og `git push --tags`.
4. Sjekk i nettleseren at filen finnes:
   `https://cdn.jsdelivr.net/gh/EquineFusion/ef-size-guide@v1.0.0/src/widget.js`

## 2. Legg inn i Webflow (på staging først)

1. Åpne siden som skal ha kalkulatoren (f.eks. den som har den gamle kalkulatoren i dag).
2. Dra inn et **Embed**-element der kalkulatoren skal stå, og lim inn:

```html
<div id="ef-size-guide"></div>
<script type="module">
  import { mount } from 'https://cdn.jsdelivr.net/gh/EquineFusion/ef-size-guide@v1.0.0/src/widget.js';
  mount(document.getElementById('ef-size-guide'));
</script>
```


3. **Publiser kun til staging** (`*.webflow.io`) – ikke eqfusion.com.
4. Test på staging:
   - Sjekklisten fra fase 4 (mål, bred/smal hov, ingen treff, inches, mobil og nettbrett).
   - At widgeten ser riktig ut med sidens font, og at sidens stiler ikke ødelegger den.
   - «Copy link» → åpne lenken på mobil → samme resultat.
   - GA4 **DebugView**: hendelsene kommer frem (se `docs/analytics.md`).
5. Når alt er godkjent: publiser til eqfusion.com.
6. **Fjern den gamle kalkulatoren**: den gamle `<script>`-koden (jQuery, `getCalculatedSize` …)
   og, når ingenting annet bruker den, CMS-samlingen med størrelser som den leste fra siden
   (`#cms-product-size-guide`). Ikke fjern før den nye er live og testet.

## 3. Ny versjon (f.eks. etter endring i Excel)

1. `npm run build-data` → `npm test` → test på testsiden (se `docs/data-guide.md`).
2. Commit og lag ny tag: `v1.0.1` for dataendringer/småfikser, `v1.1.0` for ny funksjon.
3. Push commit + tag til GitHub.
4. I Webflow: bytt `@v1.0.0` til `@v1.0.1` i Embed-koden → publiser (staging først).

**Angre:** bytt tilbake til forrige tag i Webflow og publiser. Gamle versjoner ligger alltid på jsDelivr.

### Hvorfor ikke `@main`?
`@main` er alltid siste utkast i repoet – en uferdig endring kunne gått rett til kundene,
og jsDelivr mellomlagrer `@main` i opptil 12 timer, så en rettelse kommer ikke frem med en gang.
Med fast tag vet dere nøyaktig hvilken versjon som er live.

### Mulig forenkling senere
Skal dataene oppdateres ofte, kan Webflow peke på `@1` i stedet for `@v1.0.0`. jsDelivr gir
da automatisk nyeste `1.x.x`-versjon, så en ny tag går live uten å endre Webflow (etter inntil
ca. 12 timer, eller med manuell tømming av jsDelivr-cachen). Ulempe: mindre kontroll.
Anbefaling: start med fast tag, vurder `@1` når rutinen sitter.

## Innstillinger som kan brukes i `mount(…)`

Alle er valgfrie – standardverdiene passer for eqfusion.com.

| Option | Standard | Bruk |
|---|---|---|
| `dataUrl` | `../data/size-chart.json` (samme versjon som widget.js) | Annen datafil |
| `imageBaseUrl` | mappen over `/data/` | Bilder fra et annet sted |
| `loadCss` | `true` | `false` hvis CSS legges inn på annen måte |
| `updateUrl` | `true` | Målene i adresselinjen (tilbake-knapp og deling fungerer) |
| `share` | `true` | Vis «Copy link» |

## Ting å være obs på
- **Én widget per side** er testet. Flere på samme side fungerer teknisk, men gir dobbel analytics.
- **Adresselinjen:** etter beregning endres adressen til `…?l=11.8&w=11.0&u=cm`. Siden lastes ikke
  på nytt. Kolliderer dette med noe i Webflow (f.eks. andre skript som leser `l`, `w` eller `u`),
  sett `updateUrl: false`.
- **Tekster** ligger i `strings` øverst i `src/widget.js`. Endring = ny versjon.
- **Farger** ligger øverst i `src/widget.css` (`--efsg-accent` = EF-blå `#062a56`).
