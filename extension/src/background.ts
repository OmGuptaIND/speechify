import { createReaderHost } from './lib/host';

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

const open = createReaderHost(chrome);
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'reader:target' && sender.tab && typeof message.targetId === 'string')
    void open(
      sender.tab,
      false,
      message.targetId,
      typeof message.startSegment === 'string' ? message.startSegment : undefined,
    ).catch(console.error);
});
chrome.action.onClicked.addListener((tab) => void open(tab).catch(console.error));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'read-with-bella' && tab) void open(tab, true).catch(console.error);
});
