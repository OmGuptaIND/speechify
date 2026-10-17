import type { Preferences } from '../shared';

// Presence is sent only while the reader UI is open and already paired.
// It contains the extension version, never page text, URLs or reading history.
async function heartbeat() {
  try {
    const { preferences } = await chrome.storage.local.get<{ preferences?: Preferences }>(
      'preferences',
    );
    if (!preferences?.key || document.visibilityState === 'hidden') return;
    await fetch('http://127.0.0.1:8767/v1/companion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + preferences.key,
      },
      body: JSON.stringify({ version: chrome.runtime.getManifest().version }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // The desktop app or backend can be closed while the extension stays open.
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  void heartbeat();
  setInterval(() => void heartbeat(), 30000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.preferences) void heartbeat();
  });
  document.addEventListener('visibilitychange', () => void heartbeat());
}
