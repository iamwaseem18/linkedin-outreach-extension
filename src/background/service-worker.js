// Background service worker — handles scraping orchestration and storage
// Scraping runs here so it survives popup closing

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinkedIn Outreach] Extension installed');
  chrome.storage.local.set({
    sendMode: 'manual',
    contacts: [],
    messageHistory: [],
    currentCompany: '',
    scrapeState: 'idle' // idle | scraping | done
  });
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ─── Scraping orchestration ─────────────────────────────
  if (msg.action === 'startScrape') {
    handleStartScrape(msg.company).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (msg.action === 'stopScrape') {
    chrome.storage.local.set({ scrapeState: 'done' });
    // Tell content script to stop
    chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopScraping' }).catch(() => {});
      }
    });
    sendResponse({ stopped: true });
    return true;
  }

  if (msg.action === 'getScrapeState') {
    chrome.storage.local.get(['scrapeState', 'scrapedContacts', 'currentCompany', 'scrapeStatus', 'scrapeCount'], (result) => {
      sendResponse({
        state: result.scrapeState || 'idle',
        contacts: result.scrapedContacts || [],
        company: result.currentCompany || '',
        status: result.scrapeStatus || '',
        count: result.scrapeCount || 0
      });
    });
    return true;
  }

  // ─── Progress updates from content script ───────────────
  if (msg.action === 'scrapeProgress') {
    chrome.storage.local.set({
      scrapeStatus: msg.status,
      scrapeCount: msg.count,
      scrapedContacts: msg.contacts || []
    });
    return;
  }

  if (msg.action === 'scrapeDone') {
    chrome.storage.local.set({
      scrapeState: 'done',
      scrapedContacts: msg.contacts || [],
      scrapeCount: (msg.contacts || []).length
    });
    return;
  }

  // ─── Existing handlers ──────────────────────────────────
  if (msg.action === 'saveContacts') {
    chrome.storage.local.get(['contacts'], (result) => {
      const existing = result.contacts || [];
      const merged = [...existing];
      for (const c of msg.contacts) {
        if (!merged.some(e => e.profileUrl === c.profileUrl)) {
          merged.push(c);
        }
      }
      chrome.storage.local.set({ contacts: merged });
      sendResponse({ saved: merged.length });
    });
    return true;
  }

  if (msg.action === 'getContacts') {
    chrome.storage.local.get(['contacts'], (result) => {
      sendResponse({ contacts: result.contacts || [] });
    });
    return true;
  }

  if (msg.action === 'logMessage') {
    chrome.storage.local.get(['messageHistory'], (result) => {
      const history = result.messageHistory || [];
      history.push({ ...msg.entry, sentAt: new Date().toISOString() });
      chrome.storage.local.set({ messageHistory: history });
      sendResponse({ logged: true });
    });
    return true;
  }
});

/**
 * Handle the full scrape lifecycle in the background
 */
async function handleStartScrape(company) {
  chrome.storage.local.set({
    currentCompany: company,
    scrapeState: 'scraping',
    scrapedContacts: [],
    scrapeStatus: 'Navigating to LinkedIn search...',
    scrapeCount: 0
  });

  // Find or create LinkedIn tab
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  let linkedinTab;

  if (tabs.length > 0) {
    linkedinTab = tabs[0];
    await chrome.tabs.update(linkedinTab.id, { active: true });
  } else {
    linkedinTab = await chrome.tabs.create({
      url: 'https://www.linkedin.com',
      active: true
    });
    await waitForTabLoad(linkedinTab.id);
  }

  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}&origin=GLOBAL_SEARCH_HEADER`;
  await chrome.tabs.update(linkedinTab.id, { url: searchUrl });
  await waitForTabLoad(linkedinTab.id);

  // Re-inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: linkedinTab.id },
      files: ['src/content/scraper.js']
    });
  } catch (err) {
    console.warn('Content script injection failed:', err);
  }

  await sleep(4000);

  // Send scrape command to content script with retries
  let response = null;
  let retries = 5;
  while (retries > 0 && !response) {
    try {
      response = await chrome.tabs.sendMessage(linkedinTab.id, {
        action: 'scrapeSearchResults',
        company: company
      });
    } catch (err) {
      retries--;
      if (retries > 0) {
        chrome.storage.local.set({
          scrapeStatus: `Waiting for page to be ready... (retry ${5 - retries}/5)`
        });
        await sleep(2000);
      } else {
        chrome.storage.local.set({
          scrapeState: 'done',
          scrapeStatus: 'Could not connect to LinkedIn page. Try again.'
        });
        return { error: 'Failed to connect to LinkedIn page' };
      }
    }
  }

  if (response && response.contacts) {
    const contacts = deduplicateContacts(response.contacts);
    chrome.storage.local.set({
      scrapeState: 'done',
      scrapedContacts: contacts,
      scrapeCount: contacts.length
    });
    return { contacts };
  }

  return { contacts: [] };
}

function deduplicateContacts(contacts) {
  const seen = new Map();
  for (const c of contacts) {
    const key = c.profileUrl || c.name;
    if (!seen.has(key)) seen.set(key, c);
  }
  return Array.from(seen.values());
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
