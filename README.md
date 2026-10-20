# Outreach Assistant — Chrome Extension (v0.3.1)

Chrome extension, running as a side panel next to LinkedIn, that finds people at a company, drafts a personal note for each with your own AI key, and sends connection requests with that note attached.

- Scrapes people from a company's LinkedIn people-search results (up to 5 pages) and dedupes them by profile URL.
- Drafts a note per contact with Anthropic (Claude) or xAI (Grok), using your own API key stored in `chrome.storage.local`.
- Sends connection requests with the note through LinkedIn's native invite flow (the custom-invite page), one profile at a time, with a live send log.
- Skips profiles LinkedIn gates behind an email, and anyone already connected, pending, or follow-only.
- Also lets you copy the drafted notes or export the contacts as CSV.

## Install

Download it at https://outreach.mwk.dev (download → unzip → `chrome://extensions` → Developer mode → Load unpacked), or load from source:

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this `linkedin-outreach-extension` folder
5. Pin the extension and click its icon to open the side panel

## Usage

1. Click the gear (⚙️) and choose a provider (Anthropic or xAI), paste your API key, pick a model, and optionally add context about yourself. Save.
2. Be signed in to LinkedIn in the same browser.
3. Type a company name (e.g. "Charter Communications") and click **Find People at Company**.
4. The extension opens LinkedIn people search for that company and scrapes the results. Review the contacts and deselect anyone you don't want.
5. Click **Generate Messages** to draft a note for each selected contact. Review and edit any note you want to change.
6. Click **Send Connection Requests**. Nothing is sent until you click it. Each profile is opened on LinkedIn's invite page, the note is filled in, and the request is sent. The live log shows each result as sent, skipped (with the reason), or failed. Requests are spaced 8–15 seconds apart, and you can click **Stop Sending** at any time.
7. Instead of (or as well as) sending, use **Copy All Messages**, or **Export CSV** on the contacts list.

Use it in line with LinkedIn's terms and keep volumes modest. Not affiliated with or endorsed by LinkedIn.

## Architecture

```
manifest.json          — Manifest V3 config (side panel)
src/
  sidepanel/           — Side panel UI: settings, contacts, drafting, sending, send log
    panel.html/css/js
  content/             — Content scripts (run on LinkedIn)
    scraper.js         — Scrapes search results; fills and sends the invite
    overlay.css        — In-page overlay styles
  background/          — Service worker
    service-worker.js  — Scrape orchestration, storage, cross-tab coordination
icons/                 — Extension icons
```

## Roadmap

- [ ] Dashboard UI (Next.js app) with send history & reply tracking
