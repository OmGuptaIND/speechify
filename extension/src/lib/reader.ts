import type { Article, HighlightRequest, Segment } from '../shared';
import { splitParagraph } from './segments';

interface Piece {
  node: Text;
  offset: number;
  from: number;
  to: number;
}
interface Paragraph {
  element: Element;
  pieces: Piece[];
  text: string;
}
type HighlightAPI = typeof globalThis & {
  Highlight?: new (...ranges: Range[]) => { priority: number };
};
const EXCLUDE =
  'script,style,noscript,nav,footer,button,input,textarea,select,svg,canvas,[contenteditable="true"],[aria-hidden="true"],[data-speechify-ui]';

export function createReader(doc: Document, seek: (id: string) => void, root?: Element) {
  let paragraphs: Paragraph[] = [];
  let segments: Segment[] = [];
  let active = false;
  let lastParagraph = -1;
  const style = doc.createElement('style');
  style.textContent =
    '::highlight(speechify-sentence){background:rgba(109,96,220,.22)}::highlight(speechify-word){background:#6b5ddd;color:#fff}html[data-speechify-dim] [data-speechify-paragraph]:not([data-speechify-current]){opacity:.38}';
  doc.head.append(style);
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;

  function collect(selection = false): Article {
    clear();
    const selected =
      selection && doc.getSelection()?.rangeCount
        ? doc.getSelection()!.getRangeAt(0).cloneRange()
        : null;
    if (selection && (!selected || selected.collapsed))
      throw new Error('Select some article text first.');
    const area = root || doc.querySelector('main,[role="main"],article') || doc.body;
    let blocks = Array.from(area.querySelectorAll('[data-testid="tweetText"]'));
    if (!blocks.length) blocks = Array.from(area.querySelectorAll('p,h1,h2,h3,h4,li,blockquote'));
    blocks = blocks.filter(
      (el) => !el.closest(EXCLUDE) && !el.querySelector('p,h1,h2,h3,h4,li,blockquote'),
    );
    if (!blocks.length) blocks = [area];
    paragraphs = [];
    let total = 0;
    let heading: string | undefined;
    segments = [];
    for (const element of blocks) {
      if (!element.getClientRects().length || element.closest('[hidden]')) continue;
      const computed = getComputedStyle(element);
      if (computed.display === 'none' || computed.visibility === 'hidden') continue;
      const pieces: Piece[] = [];
      let text = '';
      const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.parentElement || node.parentElement.closest(EXCLUDE)) continue;
        if (selected && !selected.intersectsNode(node)) continue;
        const start = selected?.startContainer === node ? selected.startOffset : 0;
        const finish = selected?.endContainer === node ? selected.endOffset : node.length;
        const value = node.data.slice(start, finish);
        pieces.push({ node, offset: start, from: text.length, to: text.length + value.length });
        text += value;
      }
      if (!text.trim()) continue;
      if (total + text.length > 100_000) break;
      const paragraph = paragraphs.length;
      if (/^H[1-4]$/.test(element.tagName)) heading = text.trim();
      paragraphs.push({ element, pieces, text });
      element.setAttribute('data-speechify-paragraph', '');
      segments.push(...splitParagraph(text, paragraph, heading));
      total += text.length;
    }
    if (!segments.length) throw new Error('No readable text was found. Try selecting a passage.');
    return {
      title: doc.querySelector('h1')?.textContent?.trim() || doc.title || 'This page',
      url: doc.location.href,
      segments,
    };
  }

  function range(paragraph: Paragraph, start: number, end: number) {
    const first = paragraph.pieces.find((piece) => piece.to > start);
    const last = [...paragraph.pieces].reverse().find((piece) => piece.from < end);
    if (!first || !last || !first.node.isConnected || !last.node.isConnected) return null;
    const r = doc.createRange();
    r.setStart(
      first.node,
      Math.min(first.node.length, first.offset + Math.max(0, start - first.from)),
    );
    r.setEnd(last.node, Math.min(last.node.length, last.offset + Math.max(0, end - last.from)));
    return r;
  }

  function highlight(request: HighlightRequest) {
    const paragraph = paragraphs[request.segment.paragraph];
    if (!paragraph || !paragraph.element.isConnected) return;
    if (!active) paragraphs.forEach((p) => p.element.setAttribute('data-speechify-paragraph', ''));
    const Highlight = (globalThis as HighlightAPI).Highlight;
    if (!registry || !Highlight)
      throw new Error(
        'This browser does not support page highlighting. Use a current Chrome-based browser.',
      );
    const sentence = range(paragraph, request.segment.sentenceStart, request.segment.sentenceEnd);
    const word = range(
      paragraph,
      request.segment.start + request.start,
      request.segment.start + request.end,
    );
    if (sentence) registry.set('speechify-sentence', new Highlight(sentence));
    if (word) {
      const h = new Highlight(word);
      h.priority = 2;
      registry.set('speechify-word', h);
    }
    doc.documentElement.toggleAttribute('data-speechify-dim', request.focus);
    if (lastParagraph !== request.segment.paragraph) {
      paragraphs.forEach((p) => p.element.removeAttribute('data-speechify-current'));
      paragraph.element.setAttribute('data-speechify-current', '');
      const rect = paragraph.element.getBoundingClientRect();
      if (request.follow && (rect.top < 20 || rect.bottom > innerHeight - 30))
        paragraph.element.scrollIntoView({
          block: 'center',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      lastParagraph = request.segment.paragraph;
    }
    active = true;
  }

  function clear() {
    registry?.delete('speechify-sentence');
    registry?.delete('speechify-word');
    doc.documentElement.removeAttribute('data-speechify-dim');
    paragraphs.forEach((p) => {
      p.element.removeAttribute('data-speechify-paragraph');
      p.element.removeAttribute('data-speechify-current');
    });
    active = false;
    lastParagraph = -1;
  }

  doc.addEventListener('click', (event) => {
    if (!active || (event.target as Element).closest('a,button,input,select,[data-speechify-ui]'))
      return;
    const caret = doc.caretRangeFromPoint(event.clientX, event.clientY);
    if (!caret) return;
    for (let i = 0; i < paragraphs.length; i++) {
      const piece = paragraphs[i].pieces.find((p) => p.node === caret.startContainer);
      if (!piece) continue;
      const offset = piece.from + caret.startOffset - piece.offset;
      const segment = segments.find(
        (s) => s.paragraph === i && s.start <= offset && s.end >= offset,
      );
      if (segment) seek(segment.id);
      break;
    }
  });
  return { collect, highlight, clear };
}
