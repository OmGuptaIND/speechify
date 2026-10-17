import { createReader } from './lib/reader';
import { createInlineControls } from './lib/inline';
import type { ReaderRequest } from './shared';

declare global {
  interface Window {
    __speechifyInstalled?: boolean;
  }
}

if (!window.__speechifyInstalled) {
  window.__speechifyInstalled = true;
  let controls: ReturnType<typeof createInlineControls> | undefined;
  const reader = createReader(
    document,
    (id) => void chrome.runtime.sendMessage({ type: 'reader:seek', id }),
    undefined,
    {
      targetAt: (element) => controls?.targetAt(element),
      read: (targetId, startSegment) =>
        void chrome.runtime.sendMessage({ type: 'reader:target', targetId, startSegment }),
    },
  );
  let request: ReaderRequest | undefined;
  let delivered: ReaderRequest | undefined;
  let host: HTMLDivElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let loaded = false;
  let ready: Promise<void> | undefined;
  let resolveReady: (() => void) | undefined;
  let requestedSize = { width: 64, height: 160 };

  function fitReader() {
    if (!host) return;
    host.style.width = `${Math.min(window.innerWidth - 24, requestedSize.width)}px`;
    host.style.height = `${Math.min(window.innerHeight - 24, requestedSize.height)}px`;
  }
  function sendViewport() {
    frame?.contentWindow?.postMessage(
      { source: 'speechify-host', type: 'viewport', height: window.innerHeight },
      '*',
    );
  }
  window.addEventListener('resize', () => {
    fitReader();
    sendViewport();
  });
  document.addEventListener('pointerdown', (event) => {
    if (host && !event.composedPath().includes(host))
      frame?.contentWindow?.postMessage({ source: 'speechify-host', type: 'collapse' }, '*');
  });

  function close(removeControls = true) {
    reader.clear();
    if (removeControls) {
      reader.deactivate();
      controls?.destroy();
      controls = undefined;
    }
    host?.remove();
    host = undefined;
    frame = undefined;
    loaded = false;
    ready = undefined;
  }
  function inline() {
    reader.enable();
    controls ||= createInlineControls(document, (targetId) => {
      void chrome.runtime.sendMessage({ type: 'reader:target', targetId });
    });
    return controls;
  }
  window.addEventListener('message', (event) => {
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      event.origin !== new URL(frame.src).origin
    )
      return;
    const data = event.data;
    if (!data || data.source !== 'speechify-rail') return;
    if (data.type === 'ready') {
      loaded = true;
      sendViewport();
      resolveReady?.();
    }
    if (data.type === 'resize' && host) {
      requestedSize = {
        width: Math.max(64, Number(data.width) || 64),
        height: Math.max(72, Number(data.height) || 160),
      };
      fitReader();
    }
    if (data.type === 'close') close();
  });

  async function mount(next: ReaderRequest) {
    request = next;
    inline();
    if (loaded) {
      delivered = next;
      await chrome.runtime
        .sendMessage({ type: 'reader:refresh', request: next, embedded: true })
        .catch(() => {});
      return;
    }
    if (!host) {
      requestedSize = { width: 64, height: 160 };
      host = document.createElement('div');
      host.id = 'speechify-rail-host';
      host.setAttribute('data-speechify-ui', '');
      host.style.cssText =
        'all:initial;position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:2147483646;width:64px;height:160px;border:0;margin:0;padding:0;background:transparent';
      // Isolate the iframe from site CSS and prevent the page replacing its URL accidentally.
      const shadow = host.attachShadow({ mode: 'closed' });
      frame = document.createElement('iframe');
      frame.title = 'Speechify reader';
      frame.setAttribute('allow', 'autoplay');
      // Match panel.css: a scheme mismatch makes Chromium paint an opaque iframe canvas.
      frame.style.cssText =
        'all:initial;display:block;width:100%;height:100%;border:0;margin:0;background:transparent;color-scheme:light dark';
      const params = new URLSearchParams({
        mode: 'page',
        tabId: String(next.tabId),
        windowId: String(next.windowId),
      });
      frame.src = chrome.runtime.getURL(`sidepanel.html?${params}`);
      ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      shadow.append(frame);
      document.documentElement.append(host);
    }
    if (!loaded) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          ready,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('The page blocked the floating reader.')),
              5000,
            );
          }),
        ]);
      } catch (error) {
        close(false);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    if (request && delivered !== request) {
      delivered = request;
      await chrome.runtime
        .sendMessage({ type: 'reader:refresh', request, embedded: true })
        .catch(() => {});
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'reader:rail' && message.request) {
      void mount(message.request).then(
        () => reply({ ok: true }),
        (error: Error) => reply({ error: error.message }),
      );
      return true;
    }
    try {
      if (message.type === 'reader:request') {
        delivered = request;
        reply({ request });
      }
      if (message.type === 'reader:collect') {
        const ui = inline();
        const target = message.targetId
          ? ui.find(message.targetId)
          : message.selection
            ? undefined
            : ui.defaultTarget();
        if (message.targetId && !target)
          throw new Error('That post changed or left the page. Choose its play button again.');
        if (!target && !message.selection && ui.isFeed()) {
          reader.clear();
          reply({
            article: {
              title: 'Choose a post to listen',
              url: location.href,
              segments: [],
              kind: 'feed',
            },
          });
        } else reply({ article: reader.collect(Boolean(message.selection), target) });
      }
      if (message.type === 'reader:highlight') {
        reader.highlight(message.request);
        reply({ ok: true });
      }
      if (message.type === 'reader:clear') {
        reader.clear();
        controls?.status(undefined, 'ready');
        reply({ ok: true });
      }
      if (message.type === 'reader:status') {
        controls?.status(message.targetId, message.phase);
        reply({ ok: true });
      }
    } catch (error) {
      reply({ error: error instanceof Error ? error.message : 'The page could not be read.' });
    }
    return false;
  });
}
