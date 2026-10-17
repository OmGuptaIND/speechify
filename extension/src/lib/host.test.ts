import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReaderHost } from './host';

function browser({ portable = false, unavailable = false, rejects = false } = {}) {
  const data: Record<string, unknown> = {};
  const messages: unknown[] = [];
  const windows: chrome.windows.CreateData[] = [];
  let native = 0;
  let updated = 0;
  let stale = false;
  const api = {
    runtime: {
      getManifest: () => ({ permissions: portable ? [] : ['sidePanel'] }),
      getURL: (path: string) => `chrome-extension://${'a'.repeat(32)}/${path}`,
      sendMessage: async (message: unknown) => messages.push(message),
    },
    storage: {
      session: {
        set: async (value: object) => Object.assign(data, value),
        get: async () => data,
      },
    },
    windows: {
      create: async (options: chrome.windows.CreateData) => {
        windows.push(options);
        return { id: 90 };
      },
      update: async () => {
        updated++;
        if (stale) throw new Error('Window closed');
      },
    },
    sidePanel: unavailable
      ? undefined
      : {
          open: async () => {
            native++;
            if (rejects) throw new Error('API not supported');
          },
        },
  } as unknown as typeof chrome;
  return {
    api,
    data,
    messages,
    windows,
    counts: () => ({ native, updated }),
    close: () => {
      stale = true;
    },
  };
}
const tab = { id: 17, windowId: 3, url: 'https://example.com/article' } as chrome.tabs.Tab;

test('native sidebar opens in the gesture turn and publishes the source tab', async () => {
  const mock = browser();
  const opened = createReaderHost(mock.api)(tab, true);
  assert.equal(mock.counts().native, 1);
  await opened;
  assert.equal(mock.windows.length, 0);
  assert.deepEqual(mock.data.readerRequest, { tabId: 17, windowId: 3, selection: true });
  assert.deepEqual(mock.messages[0], { type: 'reader:refresh', request: mock.data.readerRequest });
});
for (const configuration of [{ portable: true }, { unavailable: true }, { rejects: true }]) {
  test(`floating fallback: ${JSON.stringify(configuration)}`, async () => {
    const mock = browser(configuration);
    const open = createReaderHost(mock.api);
    await open(tab, true);
    const url = new URL(mock.windows[0].url as string);
    assert.equal(url.searchParams.get('tabId'), '17');
    assert.equal(url.searchParams.get('selection'), 'true');
    assert.equal(mock.windows[0].type, 'popup');
    await open({ ...tab, id: 22 });
    assert.equal(mock.windows.length, 1);
    assert.equal(mock.counts().updated, 1);
    assert.deepEqual(mock.data.readerRequest, { tabId: 22, windowId: 3, selection: false });
    mock.close();
    await open(tab);
    assert.equal(mock.windows.length, 2);
  });
}

test('ordinary pages show the in-page rail and leave the sidebar closed', async () => {
  const mock = browser();
  const scripts: number[] = [];
  const tabMessages: { id: number; message: unknown }[] = [];
  Object.assign(mock.api, {
    scripting: {
      executeScript: async (options: { target: { tabId: number } }) => {
        scripts.push(options.target.tabId);
      },
    },
    tabs: {
      sendMessage: async (id: number, message: unknown) => {
        tabMessages.push({ id, message });
        return { ok: true };
      },
    },
  });
  await createReaderHost(mock.api)(tab, true);
  assert.deepEqual(scripts, [17]);
  assert.equal(mock.counts().native, 0);
  assert.equal(mock.windows.length, 0);
  assert.deepEqual(tabMessages, [
    {
      id: 17,
      message: {
        type: 'reader:rail',
        request: { tabId: 17, windowId: 3, selection: true },
      },
    },
  ]);
  assert.equal(
    mock.messages.length,
    0,
    'the in-page handshake owns refresh without restarting playback',
  );
});

test('an iframe blocked by the page falls back and preserves the selected post', async () => {
  const mock = browser({ portable: true });
  Object.assign(mock.api, {
    scripting: { executeScript: async () => {} },
    tabs: { sendMessage: async () => ({ error: 'Frame blocked' }) },
  });
  await createReaderHost(mock.api)(tab, false, 'target-2', '1:35');
  assert.equal(mock.windows.length, 1);
  assert.deepEqual(mock.data.readerRequest, {
    tabId: 17,
    windowId: 3,
    selection: false,
    targetId: 'target-2',
    startSegment: '1:35',
    autoplay: true,
  });
});

test('two fast toolbar clicks create one floating reader and keep the newest target', async () => {
  const mock = browser({ portable: true });
  const open = createReaderHost(mock.api);
  await Promise.all([open(tab), open({ ...tab, id: 22 }, true)]);
  assert.equal(mock.windows.length, 1);
  assert.equal(mock.messages.length, 1);
  assert.deepEqual(mock.messages[0], {
    type: 'reader:refresh',
    request: { tabId: 22, windowId: 3, selection: true },
  });
});
