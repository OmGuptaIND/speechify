import type { Article, Bookmark, HighlightRequest, Preferences } from '../shared';
import { DEFAULTS } from '../shared';
import { createReader } from './reader';

const extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
let previewReader: ReturnType<typeof createReader> | undefined;
const seekHandlers = new Set<(id: string, tabId?: number) => void>();
export const isPreview = !extension;

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
export async function readPage(selection = false): Promise<Article> {
  if (!extension) {
    previewReader ||= createReader(
      document,
      (id) => seekHandlers.forEach((fn) => fn(id)),
      document.getElementById('sample-article')!,
    );
    return previewReader.collect(selection);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url || !/^https?:/.test(tab.url))
    throw new Error('Open an article in a regular website tab, then click the extension icon.');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'reader:collect', selection });
  if (response.error) throw new Error(response.error);
  return { ...response.article, tabId: tab.id };
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
    return;
  }
  if (article?.tabId)
    await chrome.tabs.sendMessage(article.tabId, { type: 'reader:clear' }).catch(() => {});
}
export function subscribe(
  seek: (id: string, tabId?: number) => void,
  refresh: (selection: boolean) => void,
) {
  seekHandlers.add(seek);
  const handler = (
    message: { type: string; id?: string; selection?: boolean },
    sender: chrome.runtime.MessageSender,
  ) => {
    if (message.type === 'reader:seek' && message.id && sender.tab) seek(message.id, sender.tab.id);
    if (message.type === 'reader:refresh') refresh(!!message.selection);
  };
  if (extension) chrome.runtime.onMessage.addListener(handler);
  return () => {
    seekHandlers.delete(seek);
    if (extension) chrome.runtime.onMessage.removeListener(handler);
  };
}
export async function requestedSelection() {
  if (!extension) return false;
  const { selectionRequested } = await chrome.storage.session.get('selectionRequested');
  await chrome.storage.session.remove('selectionRequested');
  return Boolean(selectionRequested);
}
