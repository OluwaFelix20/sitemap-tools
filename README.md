# Sitemap Tools Suite

A complete web toolkit for sitemap conversion, analysis, comparison, and merging. Built with vanilla HTML, CSS, and JavaScript — deployable to Vercel with zero build step.

## Features

| Tab | What it does |
|-----|-------------|
| **Converter** | Upload or fetch XML sitemaps → export as CSV, JSON, Excel, or XML |
| **Analytics** | View URL counts, domain breakdown, HTTPS %, priority & frequency charts |
| **CSV → XML** | Convert a CSV file back into a valid sitemap.xml |
| **Compare** | Diff two sitemap versions — see added, removed, modified URLs |
| **Merge** | Combine multiple sitemaps, deduplicate, sort by priority |

## Deploy to Vercel

### Option 1: CLI

```bash
npm i -g vercel
cd sitemap-tools-suite
vercel
```

### Option 2: GitHub Import

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import the repository
4. Deploy — no build settings needed

## Run Locally

```bash
npx serve public -l 3000
```

Then open http://localhost:3000

> Note: The URL fetch feature requires the serverless function (`/api/fetch-sitemap`), which only works on Vercel or with a local Vercel dev server:
> ```bash
> npx vercel dev
> ```

## Project Structure

```
sitemap-tools-suite/
├── public/              ← Static frontend
│   ├── index.html       ← Main page (all tabs)
│   ├── css/styles.css   ← Dark terminal theme
│   └── js/
│       ├── parser.js    ← XML & CSV parsing
│       ├── converter.js ← Export (CSV, JSON, XLS, XML)
│       ├── analytics.js ← Stats & chart rendering
│       ├── comparer.js  ← Sitemap diff engine
│       ├── merger.js    ← Multi-sitemap merge
│       └── app.js       ← Main controller
├── api/
│   └── fetch-sitemap.js ← Vercel serverless function
├── vercel.json          ← Routing & build config
└── package.json
```

## Security

- SSRF protection on the fetch API (blocks private IPs, localhost, metadata endpoints)
- CSV injection sanitization on exports
- Security headers (X-Frame-Options, X-Content-Type-Options, CSP)
- 50MB file size limit
- Redirect following with max depth

## License

MIT
