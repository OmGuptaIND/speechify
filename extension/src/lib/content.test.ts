import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

test('embedded ready handshake keeps the latest post, avoids duplicate playback, and closes cleanly', async () => {
  const win = new Window({
    url: 'https://x.com/home',
    settings: { disableIframePageLoading: true },
  });
  win.document.body.innerHTML =
    '<main><article><div data-testid="tweetText">A post to read.</div></article></main>';
  let handler: (message: unknown, sender: unknown, reply: (value: unknown) => void) => boolean;
  let iframe: InstanceType<typeof win.HTMLIFrameElement> | undefined;
  const create = win.document.createElement.bind(win.document);
  win.document.createElement = ((tag: string) => {
    const element = create(tag);
    if (tag === 'iframe') iframe = element as typeof iframe;
    return element;
  }) as typeof win.document.createElement;
  const sent: unknown[] = [];
  const hostMessages: { source: string; type: string; height?: number }[] = [];
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    Element: win.Element,
    NodeFilter: win.NodeFilter,
    MutationObserver: win.MutationObserver,
    ResizeObserver: win.ResizeObserver,
    getComputedStyle: win.getComputedStyle.bind(win),
    innerWidth: 1200,
    innerHeight: 900,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    CSS: { highlights: new Map() },
    location: win.location,
    chrome: {
      runtime: {
        getURL: (path: string) => `https://reader.example/${path}`,
        sendMessage: async (message: unknown) => {
          sent.push(message);
        },
        onMessage: {
          addListener: (fn: typeof handler) => {
            handler = fn;
          },
        },
      },
    },
  });
  const send = (message: unknown) => new Promise<unknown>((reply) => handler(message, {}, reply));
  try {
    await import('../content');
    const request = { tabId: 17, windowId: 3, selection: false };
    const first = send({ type: 'reader:rail', request });
    Object.defineProperty(iframe, 'contentWindow', {
      value: {
        postMessage: (message: (typeof hostMessages)[number]) => hostMessages.push(message),
      },
    });
    assert.equal(win.document.querySelectorAll('#speechify-rail-host').length, 1);
    assert.deepEqual(await send({ type: 'reader:request' }), { request });
    const next = { ...request, targetId: 'target-1', autoplay: true };
    const second = send({ type: 'reader:rail', request: next });
    // A different site cannot resize or dismiss the reader.
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source: iframe!.contentWindow as Window,
        origin: 'https://x.com',
        data: { source: 'speechify-rail', type: 'close' },
      }),
    );
    assert.ok(win.document.getElementById('speechify-rail-host'));
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source: iframe!.contentWindow as Window,
        origin: 'https://reader.example',
        data: { source: 'speechify-rail', type: 'ready' },
      }),
    );
    await Promise.all([first, second]);
    assert.deepEqual(hostMessages[0], {
      source: 'speechify-host',
      type: 'viewport',
      height: win.innerHeight,
    });
    const host =
      win.document.querySelector<InstanceType<typeof win.HTMLDivElement>>('#speechify-rail-host')!;
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source: iframe!.contentWindow as Window,
        origin: 'https://reader.example',
        data: { source: 'speechify-rail', type: 'resize', width: 456, height: 656 },
      }),
    );
    assert.equal(host.style.width, '456px');
    assert.equal(host.style.height, '656px', 'expanded controls must outgrow the 160px iframe');
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 420 });
    win.dispatchEvent(new win.Event('resize'));
    assert.equal(host.style.width, '336px');
    assert.equal(host.style.height, '396px');
    assert.equal(hostMessages.at(-1)?.height, 420);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 900 });
    win.dispatchEvent(new win.Event('resize'));
    assert.equal(host.style.width, '456px', 'growing the window restores the requested width');
    assert.equal(host.style.height, '656px');
    win.document.body.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
    assert.equal(hostMessages.at(-1)?.type, 'collapse');
    assert.deepEqual(sent, [{ type: 'reader:refresh', request: next, embedded: true }]);
    await send({ type: 'reader:rail', request: next });
    assert.equal(sent.length, 2, 'a later click reaches the existing player to pause/resume');
    assert.equal(win.document.querySelectorAll('#speechify-rail-host').length, 1);
    win.dispatchEvent(
      new win.MessageEvent('message', {
        source: iframe!.contentWindow as Window,
        origin: 'https://reader.example',
        data: { source: 'speechify-rail', type: 'close' },
      }),
    );
    assert.equal(win.document.querySelector('[data-speechify-ui]'), null);
    assert.equal(
      win.document.querySelector('[data-testid="tweetText"]')!.textContent,
      'A post to read.',
    );
  } finally {
    await win.happyDOM.abort();
  }
});
