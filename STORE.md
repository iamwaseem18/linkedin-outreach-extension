# Chrome Web Store: unlisted submission checklist

Target: an **Unlisted** listing. Unlisted items are not searchable in the store; only people with the link can install. They still go through full review.

> Maintainer notes, not part of the extension. Exclude `*.md` and `.git` when zipping (see step 2).

## 0. Fix these before submitting

- [ ] **Behavior vs. claims.** In v0.2.0 the extension finds people, writes a note per contact with your AI provider, and lets you copy notes or export CSV. It does **not** send messages (sending is still on the roadmap in `README.md`). The landing page and demo at https://outreach.mwk.dev describe reviewing and *sending*. The store listing, screenshots, and privacy policy must match what the shipped build does, or review will reject it as misleading. Either ship sending first, or reword the listing, screenshots, and site to "find people, draft notes, copy or export".
- [ ] **Name.** `manifest.json` says "LinkedIn Outreach Assistant". Using "LinkedIn" in a product name can fail trademark/impersonation review. Use **Outreach Assistant** for the manifest `name` and the listing, and say "for LinkedIn" only in the description.
- [ ] **Permissions.** The manifest requests `tabs`, `scripting`, `activeTab`, `storage`, `sidePanel`, and host access to `www.linkedin.com`, `api.anthropic.com`, `api.x.ai`. Remove any you don't use; each one needs a written justification (step 6). The `src/popup/` folder duplicates the side panel and is not referenced in the manifest; remove it if it is dead code.
- [ ] **Bump `version`** in `manifest.json` for each upload (the store rejects a repeated version).

## 1. Register a developer account

1. Go to https://chrome.google.com/webstore/devconsole and sign in with the Google account that will own the listing.
2. Accept the developer agreement and pay the **one-time registration fee (US$5)**.
3. Verify your contact email in the dashboard (required before you can publish).
4. If you will be a trader (selling or monetizing), complete the trader declaration. For a free extension you declare yourself a **non-trader**.

## 2. Build the zip

From the extension folder, zip only what Chrome needs, with `manifest.json` at the zip root:

    cd ~/linkedin-outreach-extension
    zip -r ../outreach-assistant-0.2.0.zip manifest.json icons src -x "*.DS_Store"

Check it: unzip into a new folder, load it via `chrome://extensions` → Load unpacked, and confirm it works before uploading.

## 3. Create the item

Developer Dashboard → **Add new item** → upload the zip.

## 4. Store listing fields

| Field | Value |
|---|---|
| Name | Outreach Assistant |
| Summary (max 132 chars) | An assistant you operate: find people at a company on LinkedIn and draft personal notes you review. |
| Category | Productivity (or Workflow & Planning) |
| Language | English |

**Description** (use the "assistant you operate" framing, and keep it accurate to the shipped build):

> Outreach Assistant is an assistant you operate, from a side panel in your own browser.
>
> Type a company name and it collects the people it finds in LinkedIn search results. Choose the people you want, and it drafts a short personal note for each one using the AI provider you pick (Anthropic or xAI) with your own API key. You review and edit every note. Then copy them or export the contacts as CSV.
>
> You stay at the wheel:
> - Runs in your own browser and your own signed-in LinkedIn session
> - Bring your own API key; it is stored only on your computer
> - No account with us, no servers in the middle, no tracking
> - Nothing is written or sent without your review
>
> Outreach Assistant is not affiliated with or endorsed by LinkedIn. Use it in line with LinkedIn's terms.

## 5. Graphic assets

| Asset | Size | Notes |
|---|---|---|
| Store icon | **128 × 128** PNG | Already at `icons/icon128.png`. Confirm it looks right on light and dark. |
| Screenshots | **1280 × 800** (or 640 × 400) PNG/JPEG | At least 1, up to 5. Show the real side panel on LinkedIn: company search, contact list, drafted notes. No mockups of features that don't exist. |
| Small promo tile | **440 × 280** | Required for the listing to look complete. |
| Marquee promo tile | 1400 × 560 | Optional; only used if the item is featured. |

## 6. Privacy tab

- **Single purpose:** "Help a user find people at a company in LinkedIn search results and draft personal outreach notes for them to review."
- **Permission justifications** (one per permission):
  - `sidePanel`: shows the assistant panel beside LinkedIn.
  - `activeTab` / `tabs`: reads the open LinkedIn search tab and navigates it to the people-search page.
  - `scripting`: runs the page reader on LinkedIn pages.
  - `storage`: saves settings, the API key, and collected contacts locally.
  - Host `https://www.linkedin.com/*`: reads search results the user is viewing.
  - Host `https://api.anthropic.com/*` and `https://api.x.ai/*`: sends the drafting request to the provider the user chose.
- **Remote code:** declare **No**. All code ships in the package.
- **Privacy policy URL:** https://outreach.mwk.dev/#privacy
- **Data-use disclosures** (tick only what applies):
  - Data collected: **Personally identifiable information** (names and job titles of LinkedIn members the user views) and **Website content** (the text of LinkedIn search results the user views). The user's API key is stored locally as an authentication credential.
  - Not collected: health, financial, location (beyond the public location text on a profile card), user activity or browsing history, passwords.
  - Where it goes: stays in local browser storage. The contact details used for a note (name, title, company, location, connection degree) and the user's optional "about me" text are sent **only** to the AI provider the user selected, using the user's own API key, to draft the note. Nothing is sent to the developer.
  - Certify all three: data is **not sold** to third parties, **not used** for purposes unrelated to the single purpose, and **not used** for creditworthiness or lending.
  - State plainly: **no passwords are collected, no analytics or tracking.**
- Make sure the live privacy policy says the same thing, including that notes are drafted by a third-party AI provider chosen by the user.

## 7. Distribution (this is the step that makes it Unlisted)

- [ ] **Visibility: set to Unlisted** (not Public, not Private). Do this before you submit for review.
- [ ] Regions: all regions, or restrict if you prefer.
- [ ] Pricing: free.

## 8. Submit and wait

1. Click **Submit for review**. Choose manual publish if you want to control when it goes live after approval.
2. Review usually takes from a few days to a couple of weeks. Extensions that touch LinkedIn data and request `tabs` and host permissions are often reviewed more closely.
3. On approval, copy the item's store URL and share it. Update `index.html` and `INSTALL.md` to link to it.

## Common rejection reasons to check

- Listing or screenshots promise something the build doesn't do (see step 0).
- Permissions that aren't used, or justifications that are vague.
- Privacy policy doesn't mention the AI provider or doesn't match the data-use form.
- "LinkedIn" in the product name or icon implying endorsement.
