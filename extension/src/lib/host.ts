import type { ReaderRequest } from '../shared';

// Keep the source tab explicit: a floating reader is itself the active window.
export function createReaderHost(api: typeof chrome) {
  const portable = !api.runtime.getManifest().permissions?.includes('sidePanel');
  let pendingWindow: Promise<void> | undefined;
  let latest = 0;

  async function createFloating(request: ReaderRequest) {
    const { readerWindow } = await api.storage.session.get('readerWindow');
    if (typeof readerWindow === 'number') {
      try {
        await api.windows.update(readerWindow, { focused: true });
        return;
      } catch {
        // The window was closed, or the browser restarted. Create a new one.
      }
    }
    const params = new URLSearchParams({
      mode: 'window',
      tabId: String(request.tabId),
      windowId: String(request.windowId),
      selection: String(request.selection),
    });
    const window = await api.windows.create({
      url: api.runtime.getURL(`sidepanel.html?${params}`),
      type: 'popup',
      width: 400,
      height: 820,
      focused: true,
    });
    if (window?.id !== undefined) await api.storage.session.set({ readerWindow: window.id });
  }

  async function floating(request: ReaderRequest) {
    // Two fast toolbar clicks share the same window creation.
    if (pendingWindow) return pendingWindow;
    pendingWindow = createFloating(request);
    try {
      await pendingWindow;
    } finally {
      pendingWindow = undefined;
    }
  }

  async function pageRail(request: ReaderRequest) {
    await api.scripting.executeScript({
      target: { tabId: request.tabId },
      files: ['content.js'],
    });
    const response = await api.tabs.sendMessage(request.tabId, { type: 'reader:rail', request });
    if (!response?.ok) throw new Error(response?.error || 'The page reader did not open.');
  }

  async function openBesidePage(tabId: number, request: ReaderRequest) {
    if (!portable && typeof api.sidePanel?.open === 'function') {
      try {
        await api.sidePanel.open({ tabId });
      } catch {
        await floating(request);
      }
    } else await floating(request);
  }

  return async (
    tab: chrome.tabs.Tab,
    selection = false,
    targetId?: string,
    startSegment?: string,
  ) => {
    if (tab.id === undefined) return;
    const version = ++latest;
    const request: ReaderRequest = {
      tabId: tab.id,
      windowId: tab.windowId,
      selection,
      ...(targetId ? { targetId, autoplay: true } : {}),
      ...(startSegment ? { startSegment } : {}),
    };
    // Start storage immediately so the source tab is kept for this gesture.
    const stored = api.storage.session.set({ readerRequest: request });
    const canInject = !!api.scripting?.executeScript && !!api.tabs?.sendMessage;
    let embedded = false;
    try {
      if (canInject) {
        try {
          await pageRail(request);
          embedded = true;
        } catch {
          await openBesidePage(tab.id, request);
        }
      } else await openBesidePage(tab.id, request);
    } finally {
      await stored;
    }
    // The embedded reader obtains the current request from its content script.
    // It may have completed initialization during the ready handshake.
    if (version === latest && !embedded)
      await api.runtime.sendMessage({ type: 'reader:refresh', request }).catch(() => {});
  };
}
