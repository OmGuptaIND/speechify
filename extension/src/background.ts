async function configure() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'read-with-bella',
    title: 'Read selection with Bella',
    contexts: ['selection'],
  });
}
chrome.runtime.onInstalled.addListener(() => void configure());
chrome.runtime.onStartup.addListener(() => void configure());

async function open(tab: chrome.tabs.Tab, selection = false) {
  if (!tab.id) return;
  // Open immediately from the user gesture, before awaiting script injection.
  await chrome.sidePanel.open({ tabId: tab.id });
  if (!tab.url || !/^https?:/.test(tab.url)) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  await chrome.storage.session.set({ selectionRequested: selection, requestedTab: tab.id });
  void chrome.runtime
    .sendMessage({ type: 'reader:refresh', selection, tabId: tab.id })
    .catch(() => {});
}
chrome.action.onClicked.addListener((tab) => void open(tab).catch(console.error));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'read-with-bella' && tab) void open(tab, true).catch(console.error);
});
