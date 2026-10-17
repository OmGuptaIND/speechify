import type { Article, Bookmark, HighlightRequest, Preferences, ReaderRequest } from '../shared';
import { DEFAULTS } from '../shared';
import { createReader } from './reader';
import { createInlineControls } from './inline';

const extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
let previewReader: ReturnType<typeof createReader> | undefined;
let previewControls: ReturnType<typeof createInlineControls> | undefined;
const seekHandlers = new Set<(id: string, tabId?: number) => void>();
const refreshHandlers = new Set<(selection: boolean, target?: ReaderRequest) => void>();
let source: ReaderRequest | undefined;
export const isPreview = !extension;
export const isFloating =
  extension && new URLSearchParams(location.search).get('mode') === 'window';
export const isPage = extension && new URLSearchParams(location.search).get('mode') === 'page';

export async function preferences(): Promise<Preferences> {
  const value = extension
    ? (await chrome.storage.local.get('preferences')).preferences
    : JSON.parse(localStorage.getItem('speechify-preferences') || 'null');
  const result = { ...DEFAULTS, ...value };
  if (!['af_bella', 'af_heart', 'af_nicole'].includes(result.voice)) result.voice = DEFAULTS.voice;
  if (typeof result.rate !== 'number' || result.rate < 0.75 || result.rate > 2.5) result.rate = 1;
  if (typeof result.key !== 'string') result.key = '';
  return result;
}
export async function savePreferences(value: Preferences) {
  if (extension) await chrome.storage.local.set({ preferences: value });
  else localStorage.setItem('speechify-preferences', JSON.stringify(value));
}
export async function bookmarks(): Promise<Bookmark[]> {
  return extension
    ? ((await chrome.storage.local.get('bookmarks')).bookmarks as Bookmark[]) || []
    : JSON.parse(localStorage.getItem('speechify-bookmarks') || '[]');
}
export async function saveBookmarks(value: Bookmark[]) {
  if (extension) await chrome.storage.local.set({ bookmarks: value.slice(0, 50) });
  else localStorage.setItem('speechify-bookmarks', JSON.stringify(value.slice(0, 50)));
}
export async function remember(article: Article, index: number) {
  const resume = { url: article.url, index };
  if (extension) await chrome.storage.local.set({ resume });
  else localStorage.setItem('speechify-resume', JSON.stringify(resume));
}
export async function resumeFor(url: string): Promise<number> {
  const value = extension
    ? (await chrome.storage.local.get('resume')).resume
    : JSON.parse(localStorage.getItem('speechify-resume') || 'null');
  return value?.url === url ? value.index : 0;
}
export async function readPage(selection = false, target?: ReaderRequest): Promise<Article> {
  if (!extension) {
    previewControls ||= createInlineControls(document, (targetId) => {
      refreshHandlers.forEach((fn) =>
        fn(false, { tabId: 0, windowId: 0, selection: false, targetId, autoplay: true }),
      );
    });
    previewReader ||= createReader(
      document,
      (id) => seekHandlers.forEach((fn) => fn(id)),
      document.getElementById('sample-article')!,
      {
        targetAt: (element) => previewControls?.targetAt(element),
        read: (targetId, startSegment) =>
          refreshHandlers.forEach((fn) =>
            fn(false, {
              tabId: 0,
              windowId: 0,
              selection: false,
              targetId,
              startSegment,
              autoplay: true,
            }),
          ),
      },
    );
    previewReader.enable();
    const chosen = target?.targetId
      ? previewControls.find(target.targetId)
      : selection
        ? undefined
        : previewControls.defaultTarget();
    if (!chosen && !selection && previewControls.isFeed())
      return {
        title: 'Choose a post to listen',
        url: location.href,
        segments: [],
        kind: 'feed',
        tabId: 0,
      };
    return { ...previewReader.collect(selection, chosen), tabId: 0 };
  }
  if (target) source = target;
  if (!source)
    throw new Error('Open a webpage and click the extension icon to choose what to read.');
  const tabId = source.tabId;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !/^https?:/.test(tab.url))
      throw new Error('Open a regular webpage, then click the extension icon.');
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    throw new Error(
      'This page is unavailable or restricted. On a regular webpage, click the extension icon again to grant access.',
    );
  }
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'reader:collect',
    selection,
    targetId: target?.targetId,
  });
  if (response.error) throw new Error(response.error);
  return { ...response.article, tabId };
}
export async function highlight(article: Article, request: HighlightRequest) {
  if (!extension) {
    previewReader?.highlight(request);
    return;
  }
  if (article.tabId)
    await chrome.tabs.sendMessage(article.tabId, { type: 'reader:highlight', request });
}
export async function clear(article?: Article) {
  if (!extension) {
    previewReader?.clear();
    previewControls?.status(undefined, 'ready');
    return;
  }
  if (article?.tabId)
    await chrome.tabs.sendMessage(article.tabId, { type: 'reader:clear' }).catch(() => {});
}
export async function playbackStatus(article: Article | undefined, phase: string) {
  if (!extension) {
    previewControls?.status(article?.targetId, phase);
    return;
  }
  if (extension && article?.tabId !== undefined)
    await chrome.tabs
      .sendMessage(article.tabId, { type: 'reader:status', targetId: article.targetId, phase })
      .catch(() => {});
}
export function subscribe(
  seek: (id: string, tabId?: number) => void,
  refresh: (selection: boolean, target?: ReaderRequest) => void,
) {
  seekHandlers.add(seek);
  refreshHandlers.add(refresh);
  const handler = (
    message: { type: string; id?: string; request?: ReaderRequest; embedded?: boolean },
    sender: chrome.runtime.MessageSender,
  ) => {
    if (message.type === 'reader:seek' && message.id && sender.tab) seek(message.id, sender.tab.id);
    if (
      message.type === 'reader:refresh' &&
      message.request &&
      Boolean(message.embedded) === isPage &&
      (!isPage ||
        message.request.tabId === Number(new URLSearchParams(location.search).get('tabId')))
    )
      refresh(message.request.selection, message.request);
  };
  if (extension) chrome.runtime.onMessage.addListener(handler);
  return () => {
    seekHandlers.delete(seek);
    refreshHandlers.delete(refresh);
    if (extension) chrome.runtime.onMessage.removeListener(handler);
  };
}
export async function initialRequest(): Promise<ReaderRequest | undefined> {
  if (!extension) return;
  const params = new URLSearchParams(location.search);
  const tabId = Number(params.get('tabId'));
  const windowId = Number(params.get('windowId'));
  if (isPage && params.has('tabId') && Number.isInteger(tabId)) {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'reader:request' });
    return response?.request || { tabId, windowId, selection: false };
  }
  const { readerRequest } = await chrome.storage.session.get('readerRequest');
  if (readerRequest) return readerRequest as ReaderRequest;
  if (params.has('tabId') && Number.isInteger(tabId))
    return { tabId, windowId, selection: params.get('selection') === 'true' };
}
export async function showSource(article: Article) {
  if (!extension || article.tabId === undefined) return;
  const tab = await chrome.tabs.update(article.tabId, { active: true });
  if (tab) await chrome.windows.update(tab.windowId, { focused: true });
}

export function dismissPreview() {
  if (extension) return;
  previewReader?.deactivate();
  previewControls?.destroy();
  previewControls = undefined;
}
