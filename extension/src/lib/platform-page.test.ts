import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReaderRequest } from '../shared';

const current: ReaderRequest = {
  tabId: 17,
  windowId: 3,
  selection: false,
  targetId: 'target-2',
  autoplay: true,
};
let listener: (message: unknown, sender: unknown) => void;
Object.assign(globalThis, {
  location: { search: '?mode=page&tabId=17&windowId=3' },
  chrome: {
    runtime: {
      id: 'a'.repeat(32),
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
        removeListener: () => {},
      },
    },
    storage: {
      session: {
        get: async () => ({ readerRequest: { tabId: 99, windowId: 4, selection: true } }),
      },
    },
    tabs: {
      sendMessage: async (tabId: number) => {
        assert.equal(tabId, 17);
        return { request: current };
      },
    },
  },
});

test('embedded reader initializes from its own page and ignores another tab opening', async () => {
  const platform = await import('./platform');
  assert.deepEqual(await platform.initialRequest(), current);
  const refreshes: ReaderRequest[] = [];
  const remove = platform.subscribe(
    () => {},
    (_selection, target) => refreshes.push(target!),
  );
  listener({ type: 'reader:refresh', embedded: true, request: { ...current, tabId: 99 } }, {});
  assert.equal(refreshes.length, 0);
  listener({ type: 'reader:refresh', embedded: true, request: current }, {});
  assert.deepEqual(refreshes, [current]);
  remove();
});
