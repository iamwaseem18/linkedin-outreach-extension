// State
let currentMode = 'manual'; // 'manual' | 'auto'
let scrapedContacts = [];
let generatedMessages = []; // { contact, message }
let isGenerationStopped = false;
let previousStep = 'step-company';
let pollInterval = null;

// Elements
const companyInput = document.getElementById('company-input');
const btnScrape = document.getElementById('btn-scrape');
const modeManual = document.getElementById('mode-manual');
const modeAuto = document.getElementById('mode-auto');
const statusText = document.getElementById('status-text');

const allSteps = ['step-company', 'step-scraping', 'step-results', 'step-generating', 'step-messages', 'step-settings'];

// Enable scrape button when company is typed
companyInput.addEventListener('input', () => {
  btnScrape.disabled = companyInput.value.trim().length < 2;
});

// Mode toggle
modeManual.addEventListener('click', () => setMode('manual'));
modeAuto.addEventListener('click', () => setMode('auto'));

function setMode(mode) {
  currentMode = mode;
  modeManual.classList.toggle('active', mode === 'manual');
  modeAuto.classList.toggle('active', mode === 'auto');
  chrome.storage.local.set({ sendMode: mode });
}

// Load saved mode
chrome.storage.local.get(['sendMode'], (result) => {
  if (result.sendMode) setMode(result.sendMode);
});

// ─── Settings ────────────────────────────────────────────
const apiProvider = document.getElementById('api-provider');
const apiKey = document.getElementById('api-key');
const apiModel = document.getElementById('api-model');
const msgContext = document.getElementById('msg-context');

const MODELS = {
  anthropic: [
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  xai: [
    { value: 'grok-3-mini', label: 'Grok 3 Mini' },
    { value: 'grok-3', label: 'Grok 3' },
  ]
};

function populateModels() {
  const provider = apiProvider.value;
  apiModel.innerHTML = MODELS[provider].map(m =>
    `<option value="${m.value}">${m.label}</option>`
  ).join('');
}

apiProvider.addEventListener('change', populateModels);
populateModels();

// Load saved settings
chrome.storage.local.get(['apiProvider', 'apiKey', 'apiModel', 'msgContext'], (result) => {
  if (result.apiProvider) {
    apiProvider.value = result.apiProvider;
    populateModels();
  }
  if (result.apiKey) apiKey.value = result.apiKey;
  if (result.apiModel) apiModel.value = result.apiModel;
  if (result.msgContext) msgContext.value = result.msgContext;
});

document.getElementById('btn-settings').addEventListener('click', () => {
  previousStep = getCurrentStep();
  showStep('step-settings');
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
  chrome.storage.local.set({
    apiProvider: apiProvider.value,
    apiKey: apiKey.value,
    apiModel: apiModel.value,
    msgContext: msgContext.value
  });
  statusText.textContent = 'Settings saved';
  showStep(previousStep);
});

document.getElementById('btn-cancel-settings').addEventListener('click', () => {
  showStep(previousStep);
});

// ─── On popup open: check if there's an ongoing/completed scrape ───
chrome.runtime.sendMessage({ action: 'getScrapeState' }, (result) => {
  if (!result) return;

  if (result.state === 'scraping') {
    // Scraping is in progress — show the scraping step and start polling
    if (result.company) companyInput.value = result.company;
    showStep('step-scraping');
    updateScrapeStatus(result.status || 'Scraping...', result.count || 0);
    startPolling();
  } else if (result.state === 'done' && result.contacts && result.contacts.length > 0) {
    // Scraping finished while popup was closed — show results
    scrapedContacts = result.contacts;
    if (result.company) companyInput.value = result.company;
    showResults();
  }
});

// ─── Scraping ────────────────────────────────────────────
btnScrape.addEventListener('click', startScraping);

async function startScraping() {
  const company = companyInput.value.trim();
  if (!company) return;

  scrapedContacts = [];
  showStep('step-scraping');
  updateScrapeStatus('Navigating to LinkedIn search...', 0);

  chrome.storage.local.set({ sendMode: currentMode });

  // Tell the background service worker to handle scraping
  chrome.runtime.sendMessage({ action: 'startScrape', company: company });

  // Start polling for updates
  startPolling();
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'getScrapeState' }, (result) => {
      if (!result) return;

      if (result.state === 'scraping') {
        updateScrapeStatus(result.status || 'Scraping...', result.count || 0);
        if (result.contacts && result.contacts.length > 0) {
          scrapedContacts = result.contacts;
        }
      } else if (result.state === 'done') {
        stopPolling();
        if (result.contacts && result.contacts.length > 0) {
          scrapedContacts = result.contacts;
          showResults();
        } else {
          updateScrapeStatus(result.status || 'No contacts found', 0);
        }
      }
    });
  }, 1000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Stop scraping
document.getElementById('btn-stop-scrape').addEventListener('click', () => {
  stopPolling();
  chrome.runtime.sendMessage({ action: 'stopScrape' });
  if (scrapedContacts.length > 0) {
    showResults();
  } else {
    showStep('step-company');
  }
});

function showResults() {
  showStep('step-results');
  const list = document.getElementById('contacts-list');
  const count = document.getElementById('results-count');
  const title = document.getElementById('results-title');

  title.textContent = `People at ${companyInput.value.trim()}`;
  count.textContent = scrapedContacts.length;

  list.innerHTML = scrapedContacts.map((c, i) => `
    <div class="contact-card">
      <img class="contact-avatar" src="${c.avatar || ''}" alt=""
           onerror="this.style.display='none'">
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        <div class="contact-title">${escapeHtml(c.title || '')}</div>
      </div>
      <input type="checkbox" class="contact-check" data-index="${i}" checked>
    </div>
  `).join('');

  statusText.textContent = `${scrapedContacts.length} contacts found`;
}

// ─── Message Generation ──────────────────────────────────
document.getElementById('btn-generate').addEventListener('click', startMessageGeneration);

async function startMessageGeneration() {
  const selected = getSelectedContacts();
  if (selected.length === 0) {
    statusText.textContent = 'Select at least one contact';
    return;
  }

  const settings = await getSettings();
  if (!settings.apiKey) {
    statusText.textContent = 'Set your API key in ⚙️ Settings first';
    previousStep = 'step-results';
    showStep('step-settings');
    return;
  }

  isGenerationStopped = false;
  generatedMessages = [];
  showStep('step-generating');

  const company = companyInput.value.trim();
  const total = selected.length;

  for (let i = 0; i < selected.length; i++) {
    if (isGenerationStopped) break;

    const contact = selected[i];
    document.getElementById('gen-status').textContent = `Generating for ${contact.name}...`;
    document.getElementById('gen-progress').textContent = `${i + 1} / ${total}`;

    try {
      const message = await generateMessage(contact, company, settings);
      generatedMessages.push({ contact, message });
    } catch (err) {
      console.error(`Failed to generate for ${contact.name}:`, err);
      generatedMessages.push({
        contact,
        message: `[Error: ${err.message || 'Failed to generate'}]`
      });
    }

    if (i < selected.length - 1) await sleep(500);
  }

  showMessages();
}

async function generateMessage(contact, company, settings) {
  const userContext = settings.msgContext || '';

  const prompt = `Write a short, personalized LinkedIn connection request message (under 280 characters) from me to ${contact.name}.

About them:
- Name: ${contact.name}
- Title: ${contact.title || 'Unknown'}
- Company: ${company}
- Location: ${contact.location || 'Unknown'}
- Connection: ${contact.degree || 'Unknown'} degree

${userContext ? `About me (the sender):\n${userContext}\n` : ''}
Guidelines:
- Keep it under 280 characters (LinkedIn connection request limit)
- Be professional but warm, not salesy
- Reference their specific role or company naturally
- Include a clear reason for connecting
- Don't use generic phrases like "I came across your profile"
- Don't include greetings like "Hi [Name]," — LinkedIn already shows the recipient's name
- End with something that invites a response

Return ONLY the message text, nothing else.`;

  if (settings.apiProvider === 'anthropic') {
    return await callAnthropic(prompt, settings);
  } else {
    return await callXAI(prompt, settings);
  }
}

async function callAnthropic(prompt, settings) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: settings.apiModel || 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

async function callXAI(prompt, settings) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.apiModel || 'grok-3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`xAI API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiProvider', 'apiKey', 'apiModel', 'msgContext'], resolve);
  });
}

// Stop generation
document.getElementById('btn-stop-gen').addEventListener('click', () => {
  isGenerationStopped = true;
  if (generatedMessages.length > 0) {
    showMessages();
  } else {
    showStep('step-results');
  }
});

// ─── Message Review ──────────────────────────────────────
function showMessages() {
  showStep('step-messages');
  const list = document.getElementById('messages-list');
  document.getElementById('msg-count').textContent = generatedMessages.length;

  list.innerHTML = generatedMessages.map((item, i) => {
    const charCount = item.message.length;
    const overLimit = charCount > 280;
    return `
    <div class="message-card" data-index="${i}">
      <div class="message-card-header">
        <span class="message-card-name">${escapeHtml(item.contact.name)}</span>
        <div class="message-card-actions">
          <button class="msg-action-btn btn-edit-msg" data-index="${i}">✏️</button>
          <button class="msg-action-btn btn-copy-msg" data-index="${i}">📋</button>
        </div>
      </div>
      <div class="message-card-body">
        <div class="message-text" id="msg-text-${i}">${escapeHtml(item.message)}</div>
        <div class="char-count ${overLimit ? 'over-limit' : ''}" id="msg-chars-${i}">${charCount}/280</div>
      </div>
    </div>`;
  }).join('');

  // Attach event listeners
  list.querySelectorAll('.btn-copy-msg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      copyToClipboard(generatedMessages[idx].message);
      e.currentTarget.textContent = '✓';
      e.currentTarget.classList.add('copied');
      setTimeout(() => {
        e.currentTarget.textContent = '📋';
        e.currentTarget.classList.remove('copied');
      }, 1500);
    });
  });

  list.querySelectorAll('.btn-edit-msg').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index);
      toggleEditMessage(idx);
    });
  });

  statusText.textContent = `${generatedMessages.length} messages generated`;
}

function toggleEditMessage(idx) {
  const textEl = document.getElementById(`msg-text-${idx}`);
  const charsEl = document.getElementById(`msg-chars-${idx}`);

  if (textEl.tagName === 'TEXTAREA') {
    const newText = textEl.value.trim();
    generatedMessages[idx].message = newText;

    const div = document.createElement('div');
    div.className = 'message-text';
    div.id = `msg-text-${idx}`;
    div.textContent = newText;
    textEl.replaceWith(div);

    charsEl.textContent = `${newText.length}/280`;
    charsEl.classList.toggle('over-limit', newText.length > 280);
  } else {
    const textarea = document.createElement('textarea');
    textarea.className = 'message-textarea';
    textarea.id = `msg-text-${idx}`;
    textarea.value = generatedMessages[idx].message;
    textarea.rows = 4;
    textEl.replaceWith(textarea);

    textarea.addEventListener('input', () => {
      charsEl.textContent = `${textarea.value.length}/280`;
      charsEl.classList.toggle('over-limit', textarea.value.length > 280);
    });

    textarea.focus();
  }
}

// Copy all messages
document.getElementById('btn-copy-all').addEventListener('click', () => {
  const allText = generatedMessages.map(item =>
    `To: ${item.contact.name} (${item.contact.title || ''})\nProfile: ${item.contact.profileUrl || ''}\nMessage: ${item.message}`
  ).join('\n\n---\n\n');

  copyToClipboard(allText);
  statusText.textContent = 'All messages copied to clipboard';
});

// Back to contacts
document.getElementById('btn-back-results').addEventListener('click', () => {
  showStep('step-results');
});

// New search from messages
document.getElementById('btn-new-search-2').addEventListener('click', () => {
  resetState();
});

// ─── Export CSV ──────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  const selected = getSelectedContacts();
  const csv = [
    'Name,Title,Profile URL,Company,Location,Degree',
    ...selected.map(c =>
      `"${c.name}","${c.title || ''}","${c.profileUrl || ''}","${c.company || ''}","${c.location || ''}","${c.degree || ''}"`
    )
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkedin-contacts-${companyInput.value.trim().replace(/\s+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  statusText.textContent = `Exported ${selected.length} contacts`;
});

// New search
document.getElementById('btn-new-search').addEventListener('click', () => {
  resetState();
});

function resetState() {
  scrapedContacts = [];
  generatedMessages = [];
  companyInput.value = '';
  btnScrape.disabled = true;
  chrome.storage.local.set({ scrapeState: 'idle', scrapedContacts: [], scrapeCount: 0 });
  showStep('step-company');
  statusText.textContent = 'Ready';
}

// ─── Helpers ─────────────────────────────────────────────
function showStep(id) {
  allSteps.forEach(s => document.getElementById(s).classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function getCurrentStep() {
  for (const s of allSteps) {
    if (document.getElementById(s).classList.contains('active')) return s;
  }
  return 'step-company';
}

function updateScrapeStatus(text, count) {
  document.getElementById('scrape-status').textContent = text;
  document.getElementById('scrape-count').textContent = `${count} contacts found`;
}

function getSelectedContacts() {
  const checks = document.querySelectorAll('.contact-check:checked');
  return Array.from(checks).map(cb => scrapedContacts[parseInt(cb.dataset.index)]);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
