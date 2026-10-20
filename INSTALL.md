# Install Outreach Assistant (self-host)

Outreach Assistant is a Chrome extension you operate from a side panel in your own browser. Until it is available from the Chrome Web Store, you can load it yourself in a few minutes. It runs entirely in your browser; nothing is routed through our servers.

## Requirements

- Google Chrome (or another Chromium browser with extension support)
- A LinkedIn account you are already signed in to
- An API key from **Anthropic** or **xAI**, which you use to write the notes

## 1. Download the extension

Download the zip and unzip it somewhere permanent. Chrome reads the files from that folder every time, so don't delete or move it afterwards.

- Zip: https://github.com/iamwaseem18/linkedin-outreach-extension/archive/refs/heads/main.zip
- Or clone it: `git clone https://github.com/iamwaseem18/linkedin-outreach-extension.git`

After unzipping you should have a folder containing `manifest.json`. That is the folder you will load in step 3.

## 2. Turn on Developer mode

1. Open `chrome://extensions` in Chrome.
2. Switch on **Developer mode** (toggle in the top right).

## 3. Load the extension

1. Click **Load unpacked**.
2. Select the folder that contains `manifest.json`.
3. Outreach Assistant appears in your extensions list. Click the puzzle-piece icon in the toolbar and pin it.

## 4. Add your API key

1. Open LinkedIn in a tab, then click the Outreach Assistant icon to open the side panel.
2. Click the settings (gear) button.
3. Choose a provider, **Anthropic (Claude)** or **xAI (Grok)**, and a model.
4. Paste your API key and click **Save Settings**.
5. Optionally add a few lines about yourself and why you are reaching out. They are included when notes are written.

Your key is saved in Chrome's local extension storage on this computer. It is only sent to the provider you chose, to write notes. Use a key you can revoke, and revoke it if you stop using the extension or share the computer.

## 5. Use it

1. In the side panel, type a company name, for example "Charter Communications".
2. Click **Find People at Company**. The extension opens LinkedIn people search and collects the results you can see.
3. Select the contacts you want and generate a note for each one.
4. Review and edit the notes, then copy them, or export the contacts as CSV.

You stay in control: you review everything before it goes anywhere.

## Updating

Download the new zip, replace the contents of your folder, then open `chrome://extensions` and click the refresh icon on the Outreach Assistant card.

## Troubleshooting

- **"Load unpacked" fails or says the manifest is missing:** you selected the wrong folder. Pick the one that directly contains `manifest.json`, not its parent.
- **Nothing is found at a company:** make sure you are signed in to LinkedIn, and try the exact company name as it appears on LinkedIn.
- **Notes come back as an error:** check that the provider matches your key (an Anthropic key starts with `sk-ant-`, an xAI key with `xai-`) and that the key has credit.
- **LinkedIn shows a warning or limits your account:** stop and slow down. Keep volumes low and follow LinkedIn's terms; you are responsible for how you use your account.

## Privacy

Full details are in the privacy policy: https://outreach.mwk.dev/#privacy
