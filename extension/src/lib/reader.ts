import type { Article, HighlightRequest, Segment } from '../shared';
import { splitParagraph } from './segments';
import type { ReadingTarget } from './targets';

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

interface Navigation {
  targetAt: (element: Element) => ReadingTarget | undefined;
  read: (targetId: string, startSegment: string) => void;
}

export function createReader(
  doc: Document,
  seek: (id: string) => void,
  root?: Element,
  navigation?: Navigation,
) {
  let paragraphs: Paragraph[] = [];
  let segments: Segment[] = [];
  let active = false;
  let enabled = false;
  let lastParagraph = -1;
  const style = doc.createElement('style');
  style.textContent =
    '::highlight(speechify-hover){background:rgba(139,128,187,.16)}[data-speechify-hover]{cursor:pointer}::highlight(speechify-sentence){background:rgba(109,96,220,.22)}::highlight(speechify-word){background:#6b5ddd;color:#fff}html[data-speechify-dim] [data-speechify-paragraph]:not([data-speechify-current]):not([data-speechify-hover]){opacity:.38}';
  doc.head.append(style);
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;

  function collect(selection = false, target?: ReadingTarget): Article {
    clear();
    const selected =
      selection && doc.getSelection()?.rangeCount
        ? doc.getSelection()!.getRangeAt(0).cloneRange()
        : null;
    if (selection && (!selected || selected.collapsed))
      throw new Error('Select some article text first.');
    const areas = target?.roots || [
      root || doc.querySelector('article,main,[role="main"]') || doc.body,
    ];
    ({ paragraphs, segments } = map(areas, selected));
    enabled = true;
    paragraphs.forEach((p) => p.element.setAttribute('data-speechify-paragraph', ''));
    if (!segments.length) throw new Error('No readable text was found. Try selecting a passage.');
    return {
      title:
        target?.title || doc.querySelector('h1')?.textContent?.trim() || doc.title || 'This page',
      url: target?.url || doc.location.href,
      targetId: target?.id,
      kind: target?.kind,
      segments,
    };
  }

  function map(areas: Element[], selected: Range | null = null) {
    const selector = 'p,h1,h2,h3,h4,li,blockquote';
    const blocks = [
      ...new Set(
        areas.flatMap((area) => {
          if (area.matches('[data-testid="tweetText"]')) return [area];
          let found = Array.from(area.querySelectorAll('[data-testid="tweetText"]'));
          if (!found.length) found = Array.from(area.querySelectorAll(selector));
          found = found.filter((el) => !el.closest(EXCLUDE) && !el.querySelector(selector));
          return found.length ? found : [area];
        }),
      ),
    ];
    const paragraphs: Paragraph[] = [];
    let total = 0;
    let heading: string | undefined;
    const segments: Segment[] = [];
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
      segments.push(...splitParagraph(text, paragraph, heading));
      total += text.length;
    }
    return { paragraphs, segments };
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
    if (sentence) {
      const h = new Highlight(sentence);
      h.priority = 1;
      registry.set('speechify-sentence', h);
    }
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
    clearHover();
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

  // Hover is a navigation preview only. It never requests audio or moves playback.
  const INTERACTIVE =
    'a,button,input,select,textarea,[role="button"],[role="link"],[contenteditable]:not([contenteditable="false"]),[data-speechify-ui]';
  type Candidate = { paragraph: Paragraph; segment: Segment; targetId?: string };
  let hovered: Candidate | undefined;
  let pointerFrame = 0;
  let other:
    | { target: ReadingTarget; text: string; paragraphs: Paragraph[]; segments: Segment[] }
    | undefined;

  function clearHover() {
    cancelAnimationFrame(pointerFrame);
    hoverObserver.disconnect();
    pointerFrame = 0;
    registry?.delete('speechify-hover');
    hovered?.paragraph.element.removeAttribute('data-speechify-hover');
    hovered = undefined;
  }
  const hoverObserver = new MutationObserver(clearHover);
  function intact(paragraph: Paragraph) {
    return (
      paragraph.element.isConnected &&
      paragraph.pieces.every(
        (piece) =>
          piece.node.isConnected &&
          piece.node.data.slice(piece.offset, piece.offset + piece.to - piece.from) ===
            paragraph.text.slice(piece.from, piece.to),
      )
    );
  }
  function candidate(event: MouseEvent): Candidate | undefined {
    const element = event.target instanceof Element ? event.target : null;
    if (
      !enabled ||
      !element ||
      element.closest(INTERACTIVE) ||
      event.buttons ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !doc.getSelection()?.isCollapsed
    )
      return;
    const caret = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!caret) return;
    const locate = (items: Paragraph[], chunks: Segment[], targetId?: string) => {
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        if (!p.element.contains(element) || !intact(p)) continue;
        const piece = p.pieces.find((part) => part.node === caret.startContainer);
        if (!piece) continue;
        const offset = piece.from + caret.startOffset - piece.offset;
        const segment = chunks.find(
          (s) => s.paragraph === i && s.start <= offset && s.end > offset,
        );
        if (segment) return { paragraph: p, segment, targetId };
      }
    };
    const current = locate(paragraphs, segments);
    if (current) return current;
    const target = navigation?.targetAt(element);
    if (!target) return;
    const text = target.roots.map((r) => r.textContent).join('');
    if (
      !other ||
      other.target.id !== target.id ||
      other.text !== text ||
      !other.paragraphs.every(intact)
    )
      other = { target, text, ...map(target.roots) };
    return locate(other.paragraphs, other.segments, target.id);
  }
  function preview(event: PointerEvent) {
    clearHover();
    const next = candidate(event);
    const Highlight = (globalThis as HighlightAPI).Highlight;
    if (!next || !registry || !Highlight) return;
    // Match the highlighted destination to the start of the clicked sentence.
    const r = range(next.paragraph, next.segment.sentenceStart, next.segment.sentenceEnd);
    if (!r) return;
    const h = new Highlight(r);
    h.priority = 0;
    registry.set('speechify-hover', h);
    next.paragraph.element.setAttribute('data-speechify-hover', '');
    hovered = next;
    hoverObserver.observe(next.paragraph.element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  doc.addEventListener(
    'pointermove',
    (event) => {
      cancelAnimationFrame(pointerFrame);
      if (enabled) pointerFrame = requestAnimationFrame(() => preview(event));
    },
    { passive: true },
  );
  doc.addEventListener(
    'pointerout',
    (event) => {
      if (
        !event.relatedTarget ||
        !(event.relatedTarget instanceof Element) ||
        !hovered?.paragraph.element.contains(event.relatedTarget)
      )
        clearHover();
    },
    { passive: true },
  );
  doc.addEventListener('scroll', clearHover, { passive: true, capture: true });
  doc.addEventListener('selectionchange', () => {
    if (!doc.getSelection()?.isCollapsed) clearHover();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clearHover();
  });
  doc.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const next = candidate(event);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      clearHover();
      const start = `${next.segment.paragraph}:${next.segment.sentenceStart}`;
      // A sentence can have leading whitespace or multiple bounded audio chunks.
      const chunks = next.targetId ? other!.segments : segments;
      const first = chunks.find(
        (s) =>
          s.paragraph === next.segment.paragraph && s.sentenceStart === next.segment.sentenceStart,
      );
      const id = first?.id || start;
      if (next.targetId) navigation?.read(next.targetId, id);
      else seek(id);
    },
    true,
  );
  return {
    collect,
    highlight,
    clear,
    enable() {
      enabled = true;
    },
    deactivate() {
      enabled = false;
      clear();
      other = undefined;
    },
  };
}
