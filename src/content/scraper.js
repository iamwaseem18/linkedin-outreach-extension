// LinkedIn People Search Scraper — content script
// Runs on linkedin.com pages, listens for commands from popup

if (window.__linkedinScraperLoaded) { /* already injected */ } else {
window.__linkedinScraperLoaded = true;

let stopRequested = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'scrapeSearchResults') {
    stopRequested = false;
    scrapeAllPages(msg.company).then(contacts => {
      sendResponse({ contacts });
    });
    return true; // keep channel open for async response
  }

  if (msg.action === 'stopScraping') {
    stopRequested = true;
  }

  if (msg.action === 'fillAndSendInvite') {
    fillAndSendInvite(msg.message, msg.contactName).then(result => {
      sendResponse(result);
    });
    return true;
  }
});

/**
 * Scrape people search results across multiple pages
 */
async function scrapeAllPages(company) {
  const allContacts = [];
  let page = 1;
  const maxPages = 5; // safety cap

  while (page <= maxPages && !stopRequested) {
    // Wait for results to render — LinkedIn's JS needs time
    await waitForResults();

    const contacts = scrapeCurrentPage(company);
    // Deduplicate as we go
    for (const c of contacts) {
      const isDupe = allContacts.some(existing => existing.profileUrl === c.profileUrl);
      if (!isDupe) allContacts.push(c);
    }

    // Report progress
    chrome.runtime.sendMessage({
      action: 'scrapeProgress',
      status: `Scraped page ${page}...`,
      count: allContacts.length,
      contacts: allContacts
    });

    // Try to go to next page
    const nextBtn = findNextButton();
    if (!nextBtn) break;

    nextBtn.click();
    page++;

    // Wait for page transition — randomized to look human
    await sleep(2500 + Math.random() * 2000);
  }

  // Done
  chrome.runtime.sendMessage({
    action: 'scrapeDone',
    contacts: allContacts
  });

  return allContacts;
}

/**
 * Wait for search results to appear in the DOM.
 * Polls every 500ms for up to 15 seconds.
 */
async function waitForResults() {
  const maxWait = 15000;
  const interval = 500;
  let waited = 0;
  while (waited < maxWait) {
    // Check if result cards are present
    const cards = document.querySelectorAll('div[role="listitem"]');
    const hasProfileLinks = document.querySelectorAll('a[href*="/in/"]').length > 0;
    if (cards.length > 0 && hasProfileLinks) {
      // Give a tiny extra moment for text to render
      await sleep(500);
      return;
    }
    await sleep(interval);
    waited += interval;
  }
  // Fallback: just wait a flat 3s if polling didn't find results
  await sleep(3000);
}

/**
 * Find the "Next" pagination button.
 * LinkedIn no longer uses aria-label="Next" — it's just a button with text "Next".
 */
function findNextButton() {
  const allButtons = document.querySelectorAll('button');
  for (const btn of allButtons) {
    if (btn.textContent.trim() === 'Next' && !btn.disabled) {
      return btn;
    }
  }
  return null;
}

/**
 * Extract contacts from the current search results page.
 *
 * LinkedIn's current DOM (as of 2026):
 * - Result cards are div[role="listitem"] inside a div[role="list"]
 * - CSS classes are obfuscated (e.g. "ebtmju", "ebtanj") and change frequently
 * - Each card contains:
 *   - Two a[href*="/in/"] links: first wraps the whole card area, second is just the name
 *   - <p> elements for: name+degree, title, location, summary
 *   - An <img> for the avatar
 */
function scrapeCurrentPage(company) {
  const contacts = [];

  // Primary strategy: div[role="listitem"] — LinkedIn's current structure
  let resultCards = document.querySelectorAll('div[role="listitem"]');

  // Fallback: look for any container with a profile link
  if (resultCards.length === 0) {
    resultCards = findResultCardsFallback();
  }

  console.log(`[LinkedIn Outreach] Found ${resultCards.length} result cards on page`);

  resultCards.forEach((card, idx) => {
    try {
      const contact = extractContact(card, company);
      if (contact) {
        contacts.push(contact);
        console.log(`[LinkedIn Outreach] Extracted: ${contact.name}`);
      }
    } catch (err) {
      console.warn(`[LinkedIn Outreach] Failed to parse card ${idx}:`, err);
    }
  });

  return contacts;
}

/**
 * Fallback: find result cards when role="listitem" doesn't work
 */
function findResultCardsFallback() {
  // Try legacy selectors
  let cards = document.querySelectorAll('[data-chameleon-result-urn]');
  if (cards.length > 0) return cards;

  cards = document.querySelectorAll('li.reusable-search__result-container');
  if (cards.length > 0) return cards;

  // Generic: find elements containing a single profile link that are reasonably sized
  const containers = document.querySelectorAll('div, li');
  const results = [];
  for (const el of containers) {
    const profileLinks = el.querySelectorAll('a[href*="/in/"]');
    if (profileLinks.length >= 1 && profileLinks.length <= 3 &&
        el.offsetHeight > 50 && el.offsetHeight < 400) {
      // Avoid picking parents that contain multiple cards
      const nestedListitems = el.querySelectorAll('[role="listitem"]');
      if (nestedListitems.length <= 1) {
        results.push(el);
      }
    }
  }
  return results;
}

/**
 * Extract contact data from a single result card element.
 */
function extractContact(card, company) {
  // --- Profile URL ---
  const profileLinks = card.querySelectorAll('a[href*="/in/"]');
  if (profileLinks.length === 0) return null;

  const profileUrl = cleanProfileUrl(profileLinks[0].href);

  // --- Name ---
  let name = '';

  // Strategy 1: The second profile link typically has just the clean name
  if (profileLinks.length >= 2) {
    name = profileLinks[1].textContent.trim();
  }

  // Strategy 2: First <p> element usually has "Name • 2nd" format
  if (!name) {
    const paragraphs = card.querySelectorAll('p');
    if (paragraphs.length > 0) {
      name = paragraphs[0].textContent.trim();
    }
  }

  // Clean up name — remove degree markers like "• 2nd", "• 3rd+"
  name = name
    .split('•')[0]            // before degree marker
    .split('·')[0]            // alternate dot character
    .replace(/\s+/g, ' ')     // collapse whitespace
    .trim();

  // Remove trailing degree if it slipped through
  name = name.replace(/\s*(1st|2nd|3rd\+?)\s*$/, '').trim();

  // If name is too long, it probably grabbed title too — truncate
  if (name.length > 50) {
    const words = name.split(' ');
    name = words.slice(0, 3).join(' ');
  }

  // Remove duplicate name (e.g. "John Doe John Doe")
  if (name.length >= 4) {
    const half = Math.floor(name.length / 2);
    const firstHalf = name.substring(0, half).trim();
    const secondHalf = name.substring(half).trim();
    if (firstHalf === secondHalf && firstHalf.length > 2) {
      name = firstHalf;
    }
  }

  // Skip private profiles
  if (!name || name === 'LinkedIn Member') return null;

  // --- Title / Headline ---
  let title = '';
  const paragraphs = card.querySelectorAll('p');

  // The paragraphs are typically: [0] name+degree, [1] title, [2] location, [3] summary
  if (paragraphs.length >= 2) {
    title = paragraphs[1].textContent.trim();
  }

  // --- Location ---
  let location = '';
  if (paragraphs.length >= 3) {
    location = paragraphs[2].textContent.trim();
  }

  // --- Avatar ---
  let avatar = '';
  const img = card.querySelector('img');
  if (img && img.src) avatar = img.src;

  // --- Connection degree ---
  let degree = '';
  if (paragraphs.length > 0) {
    const firstP = paragraphs[0].textContent;
    const degreeMatch = firstP.match(/[•·]\s*(1st|2nd|3rd\+?)\b/);
    if (degreeMatch) degree = degreeMatch[1];
  }

  return {
    name,
    title,
    location,
    profileUrl,
    avatar,
    degree,
    company,
    scrapedAt: new Date().toISOString()
  };
}

/**
 * Clean LinkedIn profile URL — strip tracking params
 */
function cleanProfileUrl(url) {
  try {
    const u = new URL(url);
    return `https://www.linkedin.com${u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Fill the connection-invite note and send it.
 *
 * Runs on LinkedIn's custom-invite preload page
 * (/preload/custom-invite/?vanityName=<slug>), which opens the invite modal
 * directly. This is far more reliable than clicking the profile's Connect
 * button — LinkedIn's new UI framework ignores scripted clicks on those.
 */
async function fillAndSendInvite(message, contactName) {
  try {
    console.log(`[LinkedIn Outreach] Invite flow for ${contactName}`);

    const modal = await waitForModal();
    if (!modal) {
      return { skipped: true, reason: 'No invite dialog (already connected, pending, or follow-only)' };
    }
    console.log('[LinkedIn Outreach] Invite modal appeared');

    // Email gate: some profiles require the member's email to connect.
    // We cannot automate past that — skip cleanly.
    const emailInput = modal.querySelector('input[type="email"]');
    if (emailInput && emailInput.offsetParent !== null) {
      await dismissModal();
      return { skipped: true, reason: 'Email required to connect' };
    }

    // Reveal the note textarea by clicking "Add a note" (if shown)
    const addNoteBtn = findAddNoteButton(modal);
    if (addNoteBtn) {
      addNoteBtn.click();
      await sleep(1200);
    }

    // DOM may have re-rendered — re-query the dialog
    const dlg = document.querySelector('[role="dialog"]') || modal;
    const textarea = dlg.querySelector('textarea');

    if (textarea) {
      typeIntoField(textarea, message);
      await sleep(700);

      const sendBtn = findPrimarySend(dlg);
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
        await sleep(1500);
        console.log(`[LinkedIn Outreach] ✓ Sent to ${contactName}`);
        return { success: true };
      }
      // Send stayed disabled — the note didn't register or there's another gate
      await dismissModal();
      return { skipped: true, reason: 'Send stayed disabled' };
    }

    // No note field — fall back to sending without a note
    const sendPlain = findSendWithoutNote(dlg) || findPrimarySend(dlg);
    if (sendPlain && !sendPlain.disabled) {
      sendPlain.click();
      await sleep(1500);
      console.log(`[LinkedIn Outreach] ✓ Sent to ${contactName} (no note)`);
      return { success: true };
    }

    await dismissModal();
    return { skipped: true, reason: 'No note field or send button' };

  } catch (err) {
    console.error(`[LinkedIn Outreach] Invite error for ${contactName}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Type text into a React/framework-controlled input or textarea.
 * Uses the native value setter so the framework's change tracking fires —
 * a plain `.value = ...` is ignored by React-style components.
 */
function typeIntoField(el, text) {
  el.focus();
  const proto = el.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Close the invite modal without sending (used when skipping).
 * Handles the "Discard" confirmation LinkedIn shows if a note was typed.
 */
async function dismissModal() {
  const closeBtn = [...document.querySelectorAll('[role="dialog"] button')]
    .find(b => (b.getAttribute('aria-label') || '') === 'Dismiss' || b.textContent.trim() === 'Cancel');
  if (closeBtn) closeBtn.click();
  await sleep(700);
  const discard = [...document.querySelectorAll('[role="dialog"] button')]
    .find(b => /discard/i.test(b.textContent));
  if (discard) discard.click();
}

/**
 * Wait for the invite dialog to appear.
 */
async function waitForModal() {
  const maxWait = 10000;
  const interval = 400;
  let waited = 0;
  while (waited < maxWait) {
    const modal = document.querySelector('[role="dialog"]') ||
                  document.querySelector('.artdeco-modal') ||
                  document.querySelector('.send-invite');
    if (modal && modal.offsetParent !== null) return modal;
    await sleep(interval);
    waited += interval;
  }
  return null;
}

function findAddNoteButton(scope) {
  const root = scope || document;
  const buttons = root.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.offsetParent === null) continue;
    const text = btn.textContent.trim().toLowerCase();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    if (text === 'add a note' || ariaLabel.includes('add a note')) {
      return btn;
    }
  }
  return null;
}

/**
 * The primary "Send" / "Send invitation" button (sends with the note).
 */
function findPrimarySend(scope) {
  const root = scope || document;
  const buttons = [...root.querySelectorAll('button')].filter(b => b.offsetParent !== null);
  return buttons.find(b => {
    const t = b.textContent.trim();
    const a = b.getAttribute('aria-label') || '';
    return t === 'Send' || a === 'Send invitation' || a.includes('Send invitation');
  }) || null;
}

/**
 * The "Send without a note" button (fallback when no note can be added).
 */
function findSendWithoutNote(scope) {
  const root = scope || document;
  const buttons = [...root.querySelectorAll('button')].filter(b => b.offsetParent !== null);
  return buttons.find(b => {
    const t = b.textContent.trim();
    const a = b.getAttribute('aria-label') || '';
    return t === 'Send without a note' || a.includes('Send without');
  }) || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[LinkedIn Outreach] Content script loaded');

} // end guard
