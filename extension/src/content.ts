import { createReader } from './lib/reader';

declare global {
  interface Window {
    __speechifyInstalled?: boolean;
  }
}
if (!window.__speechifyInstalled) {
  window.__speechifyInstalled = true;
  const reader = createReader(
    document,
    (id) => void chrome.runtime.sendMessage({ type: 'reader:seek', id }),
  );
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    try {
      if (message.type === 'reader:collect')
        reply({ article: reader.collect(Boolean(message.selection)) });
      if (message.type === 'reader:highlight') {
        reader.highlight(message.request);
        reply({ ok: true });
      }
      if (message.type === 'reader:clear') {
        reader.clear();
        reply({ ok: true });
      }
    } catch (error) {
      reply({ error: error instanceof Error ? error.message : 'The page could not be read.' });
    }
    return false;
  });
}
