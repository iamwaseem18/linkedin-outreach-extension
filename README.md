# LinkedIn Outreach Assistant — Chrome Extension

Chrome extension that scrapes LinkedIn people search results by company and supports automated cold outreach.

## Setup

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this `linkedin-outreach-extension` folder
5. Pin the extension from the toolbar

## Usage

1. Click the extension icon
2. Type a company name (e.g. "Charter Communications")
3. Choose **Manual Review** or **Automated** mode
4. Click **Find People at Company**
5. The extension navigates to LinkedIn search and scrapes results
6. Review scraped contacts, select/deselect, then generate messages or export CSV

## Architecture

```
manifest.json          — Manifest V3 config
src/
  popup/               — Extension popup UI
    popup.html/css/js   
  content/             — Content scripts (run on LinkedIn)
    scraper.js         — Scrapes search result pages
    overlay.css        — In-page overlay styles
  background/          — Service worker
    service-worker.js  — Storage and cross-tab coordination
icons/                 — Extension icons
```

## Roadmap

- [ ] Chrome extension scraping (← you are here)
- [ ] LLM message generation (Anthropic/Grok API)
- [ ] Message sending via content script
- [ ] Dashboard UI (Next.js app) with send history & reply tracking
- [ ] Manual review gate vs automated toggle
