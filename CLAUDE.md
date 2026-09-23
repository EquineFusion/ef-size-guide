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
- Hosting: kode + JSON i GitHub-repo, servert via **jsDelivr med versjons-tag** (f.eks. `@v1.2.0`) – aldri `@main` i produksjon. Webflow laster widgeten via custom code embed.

## Mappestruktur
```
/data/size-chart.xlsx        Master-data (redigeres av Equine Fusion)
/data/size-chart.json        Generert – ikke rediger
/scripts/build-data.mjs      Excel → JSON + validering
/src/engine.js               Anbefalingsmotor (ren funksjon, delt med steg 2)
/src/units.js                Enhetskonvertering og input-parsing
/src/widget.js               UI + Webflow-embed
/src/widget.css              Stil (prefikset, lekker ikke til Webflow)
/assets/images/              Produktbilder per modell (<model_id>.jpg/.png/.webp)
/demo/index.html             Frittstående testside for widgeten
/scripts/dev-server.mjs      Lokal server uten avhengigheter (også tilgjengelig på lokalt nett for test på mobil/nettbrett)
/tests/                      Tester (node:test)
/docs/webflow-embed.md       Hvordan widgeten legges inn i Webflow
/docs/data-guide.md          Hvordan Excel-filen vedlikeholdes
/source-material/            PDF-er/produktark med opprinnelige mål (kun referanse)
/legacy/                     Gammel kalkulator (kun referanse)
```

## Datamodell (Excel)
Alle mål lagres i **millimeter som heltall** internt (unngår avrundingsfeil). Visning i cm eller tommer.

**Ark `models`:** `model_id`, `name`, `use_case` (fra katalogens «Recommended for»), `sold_as` (`single`/`pair`), `product_url`, `image_url`, `active`, `sort_order`, `source`

**Ark `sizes`:** `model_id`, `size_label` (f.eks. «12 Slim»), `size` (tekst: «12», «14.5»), `variant` (`slim`/`regular`), `length_min_mm`, `length_max_mm`, `width_min_mm` (**tom = ingen nedre grense**), `width_max_mm`, `active`, `source`

Slim/Regular er **varianter innen samme modell**, ikke egne modeller.

**Ark `settings`:** `tolerance_mm` (2 mm – kun øvre ende av intervallet, se anbefalingslogikk), `wide_hoof_model` (`ultra` – modell for brede hover), `fresh_trim_add_mm` (4 mm iflg. katalog), `measure_guide_url`, `dealer_finder_url`, `data_version`

**Ark `avvik`:** Funn i kildedata som må avklares. Build-scriptet ignorerer arket, men data går ikke live før kritiske avvik er lukket.

**Ark `README`:** Instruksjoner for den som redigerer.

### Datakilder
- Trailblazer: `source-material/Size chart TB.xlsx` – **bekreftet riktig**, katalogen er feil (Regular finnes i 9–16 inkl. 14.5). Slim maks bredde = Regular min − 1 (ingen hull i bredde).
- Active, Ultra, Trekking: `source-material/EquineFusion_katalog_08.09.26_v2_web.pdf` s.37, 39, 40. Katalogen oppgir kun maks bredde («Up to X»). Regular min bredde = Slim maks + 1 (vedtatt). Slim har ingen min bredde.
- **Prinsipp for alle modeller:** Slim og Regular overlapper aldri i bredde – det finnes alltid kun én variant som passer innen en størrelse.

Nye modeller legges til **kun i Excel** – aldri i koden.

### Validering i build-script
- Feil (stopper build): manglende felt, min > max, ukjent `model_id`, duplikat `model_id + size_label`, urealistiske verdier (sanity-grenser).
- Advarsel: overlapp eller hull mellom størrelser innen samme modell.

## Anbefalingslogikk (`engine.js`)
Input: `{ length, width, unit }`. Output: strukturert objekt – **ingen tekst/HTML i motoren**.

1. Normaliser input: godta komma og punktum som desimal (`12,5`), cm og tommer (desimal `5.25` og brøk `5 1/4`). Konverter til mm.
2. Valider: tomt, ikke-tall, negativt eller urealistisk (utenfor 40–250 mm) → feilkode (ikke `alert()`). Gyldig input utenfor alle størrelser er **ikke** en feil, men `no_match`.
3. For hver aktiv modell: finn størrelser der `length_min ≤ L ≤ length_max` **og** `width_min ≤ W ≤ width_max` (tom `width_min` = ingen nedre grense).
   - Slim og Regular overlapper ikke (se datakilder). Build-scriptet skal gi feil hvis de gjør det.
   - Intervallene har 1 mm hull (75 → 76 mm). Mål mellom to intervaller (f.eks. 75,5 mm) skal håndteres som «mellom størrelser», ikke «ingen treff».
4. **Flere modeller passer** → returner alle, med `use_case` så kunden kan velge etter bruk.
5. **Nær øvre grense:** Er lengde eller bredde innenfor `tolerance_mm` (2 mm) fra **maks** i treffet → returner primær + **alternativ** + råd-kode `near_upper_limit`.
   - Nær maks **lengde** → alternativ = neste størrelse opp i samme modell, med den varianten der bredden passer.
   - Nær maks **bredde** (og ikke lengde) → alternativ = neste bredere variant: Slim → Regular i samme størrelse; Regular → neste størrelse opp der bredden passer.
   - Finnes ingen slik størrelse → ingen alternativ. **Kun øvre ende** – nedre ende gir aldri alternativ. Formål: målefeil og hovvekst (jf. katalogens råd om +4 mm ved nylig raspet hov).
   - Mål som havner i et 1 mm-hull mellom to intervaller (f.eks. 75,5 mm) → behandles som nær øvre grense av størrelsen under.
5b. **Bred hov:** Lengden treffer en størrelse, men bredden er større enn Regular maks for den størrelsen (og ingen annen modell passer) → anbefal `wide_hoof_model` (Ultra) i **minste størrelse der bredden passer** (sjekk størrelse for størrelse, Slim før Regular), med `warning: outside_size_chart`. Ingen «nær grensen»-alternativ i dette tilfellet. Widgeten viser tydelig advarsel om at målene er utenfor størrelsestabellen, med lenke til forhandler for rådgivning. Modellen hentes fra `settings` – aldri hardkodet.
6. **Ingen modell passer** (heller ikke via regel 5b) → returner `no_match`. Widgeten viser: **«We do not currently have any models that fit your size.»** + lenke til målguide og forhandler. Ingen «nærmeste størrelse» vises.

Motoren skal være deterministisk og 100 % testdekket på grensetilfeller (nøyaktig på min/maks, rett utenfor, tommer-brøk, komma-desimal).

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

## Analytics
Equine Fusion bruker **Google Analytics (GA4)**. Widgeten sender events via `gtag('event', …)` hvis `gtag` finnes på siden. Events (forslag):
- `sizeguide_calculate` – lengde, bredde (mm), enhet, resultattype (`match`/`between`/`no_match`)
- `sizeguide_result` – modell(er) og størrelse(r) anbefalt
- `sizeguide_click_dealer`, `sizeguide_click_product`, `sizeguide_click_measure_guide`
- `sizeguide_share` – delbar lenke kopiert
- `sizeguide_open_shared` – åpnet via delt lenke (distributør-bruk)

Analytics-kall ligger i widget-laget, **aldri i `engine.js`**. Widgeten må fungere selv om analytics mangler/blokkeres. Ingen personopplysninger i events.

## Kjente feil i gammel kalkulator (`/legacy`) – skal ikke gjentas
- Sjekket kun maks bredde, ikke min → smal hov kunne få for vid boot.
- `location.reload()` ved bytte tilbake til cm.
- Leste data fra Webflow-DOM → knakk ved designendringer.
- Ingen håndtering av mellomstørrelser; `alert()` som feilmelding.

## Kommandoer
```
npm run build-data    # Excel → JSON (med validering)
npm test              # Kjør alle tester
npm run dev           # Lokal testside med widgeten
```

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
- [ ] Skriv råd-tekster for «nær grensen» og advarsel for brede hover.
- [ ] Steg 2: egen, trolig større toleranse for bildemålinger (fastsettes når metoden er valgt).
- [ ] Opprett GitHub-repo.
- [ ] Koble GA4-events på widgeten.
- [ ] Produktbilder i `/assets/images/` og `image_url` i Excel.
- [ ] Bygg steg 1 i Claude Code etter `STEG1-BUILD-PROMPT.md`.
- [ ] Steg 2: velg metode for bildeanalyse.
