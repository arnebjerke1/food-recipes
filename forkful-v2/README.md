# 🍴 Forkful

Din personlige oppskriftsbok. Henter oppskrifter direkte fra nettsider via JSON-LD strukturdata — ingen AI, ingen API-nøkler, helt gratis.

## Slik fungerer det

De fleste oppskriftssider (matprat.no, allrecipes.com, bbcgoodfood.com osv.) har maskinlesbare oppskriftsdata innebygd i HTML-koden (Schema.org / JSON-LD). Forkful leser disse direkte og lagrer dem lokalt i nettleseren din.

## Deploy til GitHub Pages

1. **Fork eller last opp** dette prosjektet til GitHub
2. Gå til **Settings → Pages**
3. Under "Source", velg **GitHub Actions**
4. Push til `main`-branchen — appen bygges og deployes automatisk
5. Appen er tilgjengelig på `https://DITT-BRUKERNAVN.github.io/forkful/`

## Kjør lokalt

```bash
npm install
npm run dev
```

## Fungerer med

- ✅ matprat.no
- ✅ allrecipes.com
- ✅ bbcgoodfood.com
- ✅ foodnetwork.com
- ✅ de fleste WordPress matblogger
- ✅ YouTube (tittel + thumbnail)
- ✅ Manuell innlegging
- ⚠️ Instagram / TikTok (ikke støttet uten API)

## Teknologi

- React + Vite
- localStorage (ingen database)
- Schema.org / JSON-LD parsing
- allorigins.win CORS proxy (gratis)
- wsrv.nl bildepoxy (gratis)
- PWA-klar (kan installeres på mobil)
