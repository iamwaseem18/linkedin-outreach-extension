// LinkedIn People Search Scraper — content script
// Runs on linkedin.com pages, listens for commands from popup

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('[LinkedIn Outreach] Content script loaded');
