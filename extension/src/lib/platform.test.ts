import { test } from 'node:test';
import assert from 'node:assert/strict';

const injected: number[] = [];
const collected: { id: number; selection: boolean }[] = [];
let restricted = false;
Object.assign(globalThis, {
  location: { search: '?mode=window&tabId=17&windowId=3&selection=true' },
  chrome: {
    runtime: { id: 'a'.repeat(32) },
    storage: { session: { get: async () => ({}) } },
    tabs: {
      // Querying the active tab would return the reader window, not the article.
      query: () => {
        throw new Error('Do not query the focused reader');
      },
      get: async (id: number) => ({
        id,
        url: restricted ? 'chrome://extensions' : 'https://example.com/article',
      }),
      sendMessage: async (id: number, message: { selection: boolean }) => {
        collected.push({ id, selection: message.selection });
        return { article: { title: 'Example', url: 'https://example.com/article', segments: [] } };
      },
    },
    scripting: {
      executeScript: async (options: { target: { tabId: number } }) =>
        injected.push(options.target.tabId),
    },
  },
});

test('floating reader retains the source across focus changes and switches on an explicit request', async () => {
  const platform = await import('./platform');
  const request = await platform.initialRequest();
  assert.equal(request?.tabId, 17);
  assert.equal(request?.selection, true);
  assert.equal((await platform.readPage(true, request)).tabId, 17);
  assert.equal((await platform.readPage()).tabId, 17);
  assert.equal(
    (await platform.readPage(false, { tabId: 22, windowId: 3, selection: false })).tabId,
    22,
  );
  assert.deepEqual(injected, [17, 17, 22]);
  assert.deepEqual(collected, [
    { id: 17, selection: true },
    { id: 17, selection: false },
    { id: 22, selection: false },
  ]);
  restricted = true;
  await assert.rejects(platform.readPage(), /regular webpage/);
});
