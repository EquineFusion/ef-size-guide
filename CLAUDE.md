# CLAUDE.md – Equine Fusion Size Guide

## Om prosjektet
Online size guide / kalkulator for Equine Fusion AS (hoof boots for hester). Kunden legger inn **lengde og bredde** på hoven, og kalkulatoren anbefaler **modell + størrelse** basert på size chart.

- **Steg 1 (nå):** Kalkulator som embed-widget i Webflow. **Bygges og testes først som egen testside (`/demo/`)** – implementeres i eksisterende nettside først etter godkjenning.
- **Steg 2 (senere):** Separat app der kunden laster opp bilder av hoven → bildeanalyse estimerer lengde/bredde → samme anbefalingsmotor som steg 1. Metode (AI-vision vs. egen modell) er ikke bestemt.
- **Alt i steg 1 skal bygges for gjenbruk i steg 2.** Anbefalingslogikken er en ren funksjon uten DOM-avhengigheter.

## Eier og arbeidsform
- Eier: Sven Erik Revheim (CEO). Ikke utvikler – bygger med Claude.
- **Koden må være enkel, lesbar og kommentert.** Ingen rammeverk eller byggesteg uten klar grunn.
- Forklar endringer kort på norsk. Kode, kommentarer, commit-meldinger og UI-tekst på **engelsk**.
- Spør før du endrer size chart-data, anbefalingslogikk eller noe som er live på nettsiden.
- Si ifra hvis en forespørsel gir dårlig kundeopplevelse eller feil anbefaling – ikke bare gjør det.

## Suksesskriterier (steg 1)
1. Høyere konvertering – kunden går videre til forhandler/kjøp.
2. Færre supporthenvendelser om størrelse.
3. Brukbar som salgsverktøy for distributører (i butikk, på mobil/nettbrett, delbar lenke).

## Arkitektur

```
Excel (master)  ──►  scripts/build-data.mjs  ──►  data/size-chart.json  ──►  widget (Webflow)
                     (validerer + konverterer)                           └──►  app (steg 2)
```

- **Excel er eneste kilde til sannhet** for size chart. JSON genereres – **redigeres aldri for hånd**.
- Build-scriptet stopper med tydelig feilmelding hvis data er ugyldig. Ugyldig data skal aldri nå kunden.
- Hosting: kode + JSON i GitHub-repo, servert via **jsDelivr med versjons-tag** (f.eks. `@v1.2.0`) – aldri `@main` i produksjon. Webflow laster widgeten via custom code embed. Se `docs/webflow-embed.md`.
### Plassering (flyttet 23.09.26)
- **Kode:** `C:\Prosjekter\ef-size-guide` (utenfor OneDrive – git og OneDrive-synk i samme mappe gir konfliktrisiko). Skal ut som **offentlig** repo i Equine Fusions GitHub-organisasjon (jsDelivr krever offentlig repo).
- **Excel (master):** felles SharePoint/OneDrive-mappe, redigeres av flere direkte i Excel:
  `C:\Eqfu\Equine Fusion AS\Hovedmappe - Dokumenter\Sales & Marketing\Markedsføring\Markedsføring admin\Nettsiden\Size chart master chart\size-chart.xlsx`
  `build-data` finner den via `local.config.json` (`excelPath`, ikke i git – hver PC har sin sti; mal i `local.config.example.json`). Alternativt miljøvariabel `SIZE_CHART_XLSX`.
- **Ikke i git/GitHub:** Excel-filer (interne notater i `avvik`) og kildemateriale (katalog-PDF, `Size chart TB.xlsx`). Fjernet fra hele git-historikken ved flyttingen.
- **Kildemateriale og gammel prosjektmappe (arkiv):** `C:\Eqfu\OneDrive - Equine Fusion AS\Claude\Size guide og verktøy` – inneholder `source-material/` og full, uredigert historikk. Ikke jobb videre der.

## Mappestruktur
```
(Excel-master ligger i felles OneDrive-mappe – se «Plassering»)
/local.config.json           Sti til Excel på denne PC-en (ikke i git; mal: local.config.example.json)
/data/size-chart.json        Generert – ikke rediger
/scripts/build-data.mjs      Excel → JSON + validering
/src/engine.js               Anbefalingsmotor (ren funksjon, delt med steg 2)
/src/units.js                Enhetskonvertering og input-parsing
/src/widget.js               UI + Webflow-embed
/src/widget.css              Stil (prefikset, lekker ikke til Webflow)
/src/analytics.js            GA4-events (brukes kun av widget.js)
/scripts/build-share.mjs     Lager én selvstendig HTML-fil av testsiden (dist/share/) for deling
/assets/images/              Produktbilder per modell (<model_id>.jpg/.png/.webp)
/demo/index.html             Frittstående testside for widgeten
/scripts/dev-server.mjs      Lokal server uten avhengigheter (også tilgjengelig på lokalt nett for test på mobil/nettbrett)
/tests/                      Tester (node:test)
/docs/webflow-embed.md       Hvordan widgeten legges inn i Webflow
/docs/data-guide.md          Hvordan Excel-filen vedlikeholdes
/docs/analytics.md           GA4-events og oppsett i GA4
/legacy/                     Gammel kalkulator (kun referanse)
(source-material/ med katalog-PDF og Size chart TB.xlsx ligger i arkivmappen i OneDrive – se «Plassering»)
```

## Datamodell (Excel)
Alle mål lagres i **millimeter som heltall** internt (unngår avrundingsfeil). Visning i cm eller tommer.

**Ark `models`:** `model_id`, `name`, `use_case` (fra katalogens «Recommended for»), `sold_as` (`single`/`pair`), `product_url`, `image_url`, `active`, `sort_order`, `source`

**Ark `sizes`:** `model_id`, `size_label` (f.eks. «12 Slim»), `size` (tekst: «12», «14.5»), `variant` (`slim`/`regular`), `length_min_mm`, `length_max_mm`, `width_min_mm` (**påkrevd for alle rader** – vedtatt 23.09.26), `width_max_mm`, `active`, `source`

Slim/Regular er **varianter innen samme modell**, ikke egne modeller.

**Ark `settings`:** `tolerance_mm` (2 mm – kun øvre ende av intervallet, se anbefalingslogikk), `wide_hoof_model` (`ultra` – modell for brede hover), `wide_hoof_max_extra_length_mm` (10 mm – se regel 5b), `narrow_hoof_model` (`ultra`), `narrow_hoof_max_below_mm` (20 mm – se regel 5c), `fresh_trim_add_mm` (4 mm iflg. katalog), `measure_guide_url`, `dealer_finder_url`, `data_version`

**Ark `avvik`:** Funn i kildedata som må avklares. Build-scriptet ignorerer arket, men data går ikke live før kritiske avvik er lukket.

**Ark `README`:** Instruksjoner for den som redigerer.

### Datakilder
- Trailblazer: `source-material/Size chart TB.xlsx` – **bekreftet riktig**, katalogen er feil (Regular finnes i 9–16 inkl. 14.5). Slim maks bredde = Regular min − 1 (ingen hull i bredde).
- Active, Ultra, Trekking: `source-material/EquineFusion_katalog_08.09.26_v2_web.pdf` s.37, 39, 40. Katalogen oppgir kun maks bredde («Up to X»). Regular min bredde = Slim maks + 1 (vedtatt). **Slim min bredde = Regular min − 10** (vedtatt 23.09.26, samme oppbygging som Trailblazer – f.eks. Active 14 Slim 121–130 mm).
- **Prinsipp for alle modeller:** Slim og Regular overlapper aldri i bredde – det finnes alltid kun én variant som passer innen en størrelse.

Nye modeller legges til **kun i Excel** – aldri i koden.

### Validering i build-script
- Feil (stopper build, norsk melding med ark + rad): manglende ark/kolonne/felt (inkl. `width_min_mm`), ikke-heltall i mm-felt, min > max, verdier utenfor 40–250 mm, ukjent `model_id`, duplikat `model_id` eller `model_id + size_label`, `variant` ≠ slim/regular, `sold_as` ≠ single/pair, `active` ≠ TRUE/FALSE, Slim og Regular overlapper i bredde, manglende/ugyldig innstilling, `wide_hoof_model`/`narrow_hoof_model` er ikke en aktiv modell.
- Advarsel (build fortsetter): hull > 1 mm eller overlapp i lengde mellom størrelser, ulik lengde på Slim/Regular i samme størrelse, aktiv modell uten størrelser, manglende `image_url`/`product_url`.
- Kun rader med `active = TRUE` (og aktiv modell) kommer med i JSON.

## Anbefalingslogikk (`engine.js`)
Input: `{ length, width, unit }`. Output: strukturert objekt – **ingen tekst/HTML i motoren**.

1. Normaliser input: godta komma og punktum som desimal (`12,5`), cm og tommer (desimal `5.25` og brøk `5 1/4`). Konverter til mm.
2. Valider: tomt, ikke-tall, negativt eller urealistisk (utenfor 40–250 mm) → feilkode (ikke `alert()`). Gyldig input utenfor alle størrelser er **ikke** en feil, men `no_match`.
3. For hver aktiv modell: finn størrelser der `length_min ≤ L ≤ length_max` **og** `width_min ≤ W ≤ width_max`.
   - Slim og Regular overlapper ikke (se datakilder). Build-scriptet skal gi feil hvis de gjør det.
   - Intervallene har 1 mm hull (75 → 76 mm). Mål mellom to **lengde**-intervaller (f.eks. 75,5 mm) skal håndteres som «mellom størrelser», ikke «ingen treff».
   - **Bredde** mellom Slim maks og Regular min (f.eks. 110,5 mm) er større enn Slim maks → **Regular**, uten råd (vedtatt 23.09.26).
4. **Flere modeller passer** → returner alle, med `use_case` så kunden kan velge etter bruk.
5. **Nær øvre grense:** Er lengde eller bredde innenfor `tolerance_mm` (2 mm) fra **maks** i treffet → returner primær + **alternativ** + råd-kode `near_upper_limit`.
   - Nær maks **lengde** → alternativ = neste størrelse opp i samme modell, med den varianten der bredden passer.
   - Nær maks **bredde** på **Slim** → alternativ = Regular i samme størrelse.
   - Nær maks **bredde** på **Regular** → **ingen alternativ, ingen råd** – kun størrelsen målene passer til (vedtatt 23.09.26: Slim i neste størrelse er ikke bredere, så det hjelper ikke).
   - Finnes ingen alternativ (f.eks. største størrelse) → **ingen råd**, kun størrelsen som passer (vedtatt 23.09.26). `near_upper_limit` gis altså kun sammen med et alternativ. **Kun øvre ende** – nedre ende gir aldri alternativ. Formål: målefeil og hovvekst (jf. katalogens råd om +4 mm ved nylig raspet hov).
   - Lengde som havner i et 1 mm-hull mellom to størrelser (f.eks. 75,5 mm) → behandles som nær øvre grense av størrelsen under.
5b. **Bred hov:** Lengden treffer en størrelse, men bredden er større enn Regular maks for den størrelsen (og ingen annen modell passer) → anbefal `wide_hoof_model` (Ultra) i **minste størrelse der bredden passer** (sjekk størrelse for størrelse, Slim før Regular), med `warning: outside_size_chart`. Ingen «nær grensen»-alternativ i dette tilfellet.
   - **Maks lengdeoverskudd:** Størrelsens `length_min_mm` kan være maks `wide_hoof_max_extra_length_mm` (10 mm) større enn hovens lengde. Ellers → `no_match` (vedtatt 23.09.26 – hindrer at en liten, bred hov får en altfor lang boot, f.eks. 70 × 80 mm → Ultra 10). Widgeten viser tydelig advarsel om at målene er utenfor størrelsestabellen, med lenke til forhandler for rådgivning. Modellen hentes fra `settings` – aldri hardkodet.
5c. **Smal hov** (vedtatt 23.09.26): Ingen vanlig treff, og hoven er smalere enn Slim min → anbefal `narrow_hoof_model` (Ultra) i størrelsen der **lengden** passer, Slim-varianten, med `warning: outside_size_chart` og `outsideReason: 'narrow'`. Kun hvis hoven er maks `narrow_hoof_max_below_mm` (20 mm) smalere enn Ultra-størrelsens Slim min. Mer enn det, eller lengden passer ingen Ultra-størrelse → `no_match`. Widgeten viser egen advarsel («narrower than our size chart … may work … contact a dealer»).
6. **Ingen modell passer** (heller ikke via regel 5b/5c) → returner `no_match`. Widgeten viser: **«We do not currently have any models that fit your size.»** + lenke til målguide og forhandler. Ingen «nærmeste størrelse» vises.

Motoren skal være deterministisk og 100 % testdekket på grensetilfeller (nøyaktig på min/maks, rett utenfor, tommer-brøk, komma-desimal).

### Output-format (`recommend(input, data)`)
```js
{
  status: 'ok' | 'no_match' | 'invalid_input',
  errors: [{ field: 'length' | 'width' | 'unit', code }],  // kun invalid_input
          // code: 'empty' | 'not_a_number' | 'not_positive' | 'out_of_range' | 'invalid_unit'
  input: { lengthMm, widthMm, unit },                       // mm avrundet til 0,1; null ved feil
  recommendations: [{                                       // sortert etter sort_order
    modelId, sizeLabel, size, variant,                      // 'active', '12 Slim', '12', 'slim'
    advice: [] | ['near_upper_limit'],                      // kun sammen med alternative
    warning: null | 'outside_size_chart',
    outsideReason: null | 'wide' | 'narrow',
    betweenSizes: boolean,                                  // lengde i 1 mm-hull mellom størrelser
    alternative: null | { sizeLabel, size, variant, reason: 'length' | 'width' }
  }]
}
```
`units.js` eksporterer i tillegg `parseMeasurement`, `normaliseUnit` og `formatMeasurement` (visning).

## Widget (`widget.js`)
- **Vanilla JS**, ingen jQuery eller andre avhengigheter.
- Mobil-først. Må fungere godt på nettbrett i butikk (distributør-bruk).
- All CSS prefikset (`.efsg-`) – skal ikke påvirke eller påvirkes av Webflow-stiler.
- Enhetsvalg cm/tommer uten sidereload. Husk valgt enhet (localStorage, i try/catch).
- **Delbar URL:** mål og enhet i query-params (`?l=125&w=130&u=cm`) så distributører kan sende lenke med ferdig resultat.
- Resultat viser: modell, størrelse, `use_case`, produktlenke, lenke til **forhandlerfinner** (egen Webflow-side), lenke til **målguide** (egen Webflow-side).
- Ingen `alert()` – feilmeldinger inline ved feltet.
- Tilgjengelighet: labels, tastaturnavigasjon, `aria-live` på resultat.
- Språk: kun engelsk nå, men all UI-tekst samlet i ett `strings`-objekt så flere språk kan legges til senere.
- Vis «sold as single/pair» i resultatet.
- **Produktbilde ved siden av hver anbefaling** (fra `image_url`). Desktop: bilde til venstre, tekst til høyre. Mobil: bilde over tekst. Mangler bilde → nøytral plassholder, aldri ødelagt bilde. `alt`-tekst = modellnavn. `loading="lazy"`.

### Slik er widgeten bygd (fase 4)
- `mount(element, options)` (også `window.EFSizeGuide.mount`). Alle options valgfrie: `data`, `dataUrl` (standard `../data/size-chart.json` relativt til `widget.js`), `imageBaseUrl`, `loadCss` (injiserer `widget.css` selv), `updateUrl` (målene i adresselinjen etter beregning), `share` («Copy link»), `onResult`, `onAnalytics` (debug-hooks).
- Layout tilpasser seg widgetens egen bredde (container queries), ikke skjermen.
- **Farge:** aksent = EF-knappeblå `#062a56` (Webflow `--eqfu--blue-950`), hover `#00359e`. Fonten arves fra siden.
- Lenker åpnes i samme fane. Mål vises i valgt enhet («Hoof: 11.8 × 11.0 cm»); Regular vises som «12 Regular».
- Delt lenke: `?l=11.8&w=11.0&u=cm&src=share` (`u` = cm/in/mm; mm vises i cm).
- **Delbar testside:** `npm run build-share` → `dist/share/index.html` (alt inlinet) publiseres som claude.ai-artifact https://claude.ai/artifact/J8bxWRthd8RxjNaKurZody («Anyone with the link» – delt med kollegaer). **Publiser alltid med denne `url`** så lenken kollegaene har blir oppdatert (ikke ny artifact). Der er «Copy link» og adresselinje skrudd av (fungerer ikke i claude.ai-rammen).
- **UI-tekster er utkast** – ikke endelig godkjent av Sven Erik.

## Analytics
Equine Fusion bruker **Google Analytics (GA4)**. Widgeten sender events via `gtag('event', …)` hvis `gtag` finnes på siden (bygd i fase 5 – full liste med parametere og GA4-oppsett i `docs/analytics.md`):
- `sizeguide_calculate` – lengde, bredde (hele mm), enhet, `result_type` (`match`/`between`/`outside_wide`/`outside_narrow`/`no_match`/`invalid_input`), `trigger` (`form`/`shared_link`)
- `sizeguide_result` – én per anbefalt modell (modell, størrelse, alternativ, utenfor tabell)
- `sizeguide_click_dealer`, `sizeguide_click_product`, `sizeguide_click_measure_guide`
- `sizeguide_share` – delbar lenke kopiert («Copy link» legger til `&src=share`)
- `sizeguide_open_shared` – åpnet via delt lenke (distributør-bruk)

Enhetsbytte og reload/tilbake-knapp telles ikke (unngår dobbelttelling).
Analytics-logikk ligger i `src/analytics.js` (rene funksjoner, testet) og kalles fra widget-laget, **aldri fra `engine.js`**. Widgeten må fungere selv om analytics mangler/blokkeres. Ingen personopplysninger i events.

## Kjente feil i gammel kalkulator (`/legacy`) – skal ikke gjentas
- Sjekket kun maks bredde, ikke min → smal hov kunne få for vid boot.
- `location.reload()` ved bytte tilbake til cm.
- Leste data fra Webflow-DOM → knakk ved designendringer.
- Ingen håndtering av mellomstørrelser; `alert()` som feilmelding.

## Kommandoer
```
npm run build-data    # Excel → JSON (med validering)
npm test              # Kjør alle tester
npm run dev           # Lokal testside: http://localhost:5173/demo/ (+ adresse på lokalt nett)
npm run build-share   # Én delbar HTML-fil av testsiden → dist/share/index.html
npm run fetch-images  # Henter produktbilder fra product_url (hopper over eksisterende; --force for å overskrive)
```

### Redigere Excel fra Claude
Excel-filen åpnes via SharePoint (OneDrive) med **AutoSave** – endringer via Excel COM lagres i skyen før lokal fil synkes, og en feil midt i et script kan etterlate halvferdige endringer. Derfor: skriv endringsscript som tåler å kjøres på nytt, cast tekst til `[string]` før `Value2 =` (ellers `InvalidCastException`), og kontroller alltid resultatet mot forrige commit med SheetJS etterpå. SheetJS skal **ikke** brukes til å skrive Excel (mister formatering).

## Regler for Claude
- Kjør `npm test` etter hver endring i `engine.js`, `units.js` eller data. Ikke si at noe fungerer uten at testene er grønne.
- Endre aldri `size-chart.json` direkte – endre Excel og kjør build.
- Legg aldri inn mål/størrelser du ikke har kilde på. Mangler data → spør.
- Nye funksjoner som ikke er i denne filen → foreslå først, bygg etter godkjenning.
- Hold `engine.js` fri for DOM, nettverk og UI-tekst – den skal kunne kjøres i Node (steg 2 backend).
- Oppdater denne filen når arkitektur eller beslutninger endres.

## Åpne punkter
- [x] Samle size chart i `size-chart.xlsx` (versjon 1 bygd 23.09.26).
- [x] Trailblazer-avvik lukket (Regular 9–16 bekreftet, bredde-hull fjernet, str 16 bekreftet).
- [x] Min bredde Regular for Active/Ultra/Trekking = Slim maks + 1.
- [x] `tolerance_mm` = 2, kun øvre ende. Brede hover = Ultra + advarsel. Ingen treff = fast melding.
- [x] Produkt-URL-er lagt inn.
- [ ] Bekreft `use_case`-tekster.
- [x] URL til forhandlerfinner og målguide lagt inn.
- [x] Utkast til råd-tekster for «nær grensen» og advarsler for brede/smale hover (i `strings` i `widget.js`).
- [ ] **Godkjenn alle UI-tekster** (liste i fase 4-oppsummering / `strings` i `widget.js`).
- [x] Slim min bredde for Active/Trekking/Ultra = Regular min − 10 + regel for smale hover (23.09.26).
- [x] Produktbilder i `/assets/images/` og `image_url` i Excel (Trailblazer beskåret uten prismerke, 29 kB).
- [x] Knappefarge = EF-blå fra eqfusion.com.
- [x] Koble GA4-events på widgeten (fase 5). Gjenstår: registrere custom dimensions i GA4 og teste i DebugView når widgeten er i Webflow (`docs/analytics.md`).
- [x] Bygg steg 1 i Claude Code etter `STEG1-BUILD-PROMPT.md` (fase 0–6 ferdig 23.09.26).
- [x] GitHub-organisasjon opprettet av Sven Erik.
- [x] Flytt kode ut av OneDrive + Excel til felles OneDrive-mappe (23.09.26, se «Plassering»).
- [ ] Slett/arkiver gammel prosjektmappe i OneDrive når Sven Erik har bekreftet at alt virker (inkl. den gamle kopien av Excel-filen, så ingen redigerer feil fil).
- [ ] Opprett offentlig GitHub-repo i organisasjonen, push, første versjons-tag.
- [ ] Test i Webflow på staging (webflow.io) → GA4 DebugView → publiser på eqfusion.com. Fjern gammel kalkulator.
- [ ] Steg 2: egen, trolig større toleranse for bildemålinger (fastsettes når metoden er valgt).
- [ ] Steg 2: velg metode for bildeanalyse.
