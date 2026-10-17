import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createReader } from './reader';
import { createTargetFinder } from './targets';
import { createInlineControls } from './inline';

function page(html: string, url = 'https://example.com/story') {
  const win = new Window({ url });
  win.document.body.innerHTML = html;
  const registry = new Map<string, { ranges: Range[] }>();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    Element: win.Element,
    NodeFilter: win.NodeFilter,
    MutationObserver: win.MutationObserver,
    PointerEvent: win.PointerEvent,
    MouseEvent: win.MouseEvent,
    Event: win.Event,
    ResizeObserver: win.ResizeObserver,
    getComputedStyle: win.getComputedStyle.bind(win),
    innerWidth: 1200,
    innerHeight: 900,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    CSS: { highlights: registry },
    Highlight: class {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    },
  });
  const rect = {
    x: 100,
    y: 100,
    left: 100,
    top: 100,
    right: 650,
    bottom: 240,
    width: 550,
    height: 140,
    toJSON() {},
  };
  win.HTMLElement.prototype.getClientRects = () =>
    [rect] as unknown as ReturnType<typeof win.HTMLElement.prototype.getClientRects>;
  win.HTMLElement.prototype.getBoundingClientRect = () => new win.DOMRect(100, 100, 550, 140);
  const doc = win.document as unknown as Document;
  return { win, doc, registry };
}

test('X play captures only its post and highlights original nodes across inline markup', () => {
  const { win, doc, registry } = page(
    `<main><article data-testid="tweet"><span>Author</span><div data-testid="tweetText">A <b>good</b> <a href="/story">story</a> is worth reading.</div><button>99 likes</button></article><article data-testid="tweet"><div data-testid="tweetText">Another post must stay separate.</div></article></main>`,
    'https://x.com/home',
  );
  try {
    const finder = createTargetFinder(doc);
    const targets = finder.discover();
    assert.equal(targets.length, 2);
    assert.equal(finder.discover()[0].id, targets[0].id);
    const body = targets[0].anchor;
    const markup = body.innerHTML;
    const boldText = body.querySelector('b')!.firstChild;
    const reader = createReader(doc, () => {});
    const article = reader.collect(false, targets[0]);
    assert.equal(article.segments.map((s) => s.text).join(''), 'A good story is worth reading.');
    reader.highlight({
      segment: article.segments[0],
      start: 2,
      end: 6,
      follow: false,
      focus: false,
    });
    assert.equal(registry.get('speechify-word')?.ranges[0].toString(), 'good');
    assert.equal(registry.get('speechify-word')?.ranges[0].startContainer, boldText);
    reader.highlight({
      segment: article.segments[0],
      start: 2,
      end: 12,
      follow: false,
      focus: false,
    });
    assert.equal(registry.get('speechify-word')?.ranges[0].toString(), 'good story');
    assert.equal(body.innerHTML, markup);
    reader.clear();
    assert.equal(registry.size, 0);
    assert.equal(body.innerHTML, markup);
  } finally {
    win.happyDOM.abort();
  }
});

test('Substack notes, comments and article text exclude author, actions and native audio', () => {
  const { win, doc } = page(
    `<main><h1>A longer story</h1><div class="available-content"><div class="body markup"><p>Article <em>words</em>.</p><p>Second paragraph.</p></div></div><button>Listen to the original podcast</button><div class="feed-shared-item"><span>Author name</span><div class="comment-body"><p>Note words.</p><p>One more thought.</p></div><button>Subscribe</button></div><div class="comment"><span>Commenter</span><div class="comment-body"><p>Comment words.</p></div></div></main>`,
    'https://publication.example/p/story',
  );
  try {
    const targets = createTargetFinder(doc).discover();
    assert.deepEqual(targets.map((t) => t.kind).sort(), ['article', 'comment', 'post']);
    const reader = createReader(doc, () => {});
    for (const [kind, text] of [
      ['post', 'Note words.One more thought.'],
      ['comment', 'Comment words.'],
      ['article', 'A longer storyArticle words.Second paragraph.'],
    ]) {
      const result = reader.collect(
        false,
        targets.find((t) => t.kind === kind),
      );
      assert.equal(result.segments.map((s) => s.text).join(''), text);
    }
  } finally {
    win.happyDOM.abort();
  }
});

test('selection remains exact and hidden/excluded UI is not spoken', () => {
  const { win, doc } = page(
    '<article><p>Hello <strong>selected words</strong>, then more.</p><p hidden>Hidden words</p><div data-speechify-ui><p>Reader buttons</p></div></article>',
  );
  try {
    const node = doc.querySelector('strong')!.firstChild!;
    const range = doc.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 8);
    doc.getSelection()!.addRange(range);
    const reader = createReader(doc, () => {});
    assert.equal(reader.collect(true).segments[0].text, 'selected');
    assert.equal(
      reader
        .collect()
        .segments.map((s) => s.text)
        .join(''),
      'Hello selected words, then more.',
    );
  } finally {
    win.happyDOM.abort();
  }
});

test('inline controls follow new and removed posts, stay bounded, and clean up', async () => {
  const { win, doc } = page(
    '<main><article><div data-testid="tweetText">First post.</div></article></main>',
    'https://x.com/home',
  );
  const clicked: string[] = [];
  const controls = createInlineControls(doc, (id) => clicked.push(id));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 220));
  try {
    await tick();
    const shadow = doc.querySelector('#speechify-inline-controls')!.shadowRoot!;
    const first = shadow.querySelector('button')!;
    first.click();
    assert.equal(controls.find(clicked[0])?.roots[0].textContent, 'First post.');
    controls.status(clicked[0], 'playing');
    await tick();
    assert.equal(first.getAttribute('aria-label'), 'Pause post with Bella');
    const firstArticle = doc.querySelector('article')!;
    for (let i = 0; i < 50; i++) {
      const article = doc.createElement('article');
      article.innerHTML = `<div data-testid="tweetText">New post ${i}.</div>`;
      doc.querySelector('main')!.append(article);
    }
    firstArticle.remove();
    await tick();
    assert.equal(controls.find(clicked[0]), undefined);
    assert.equal(shadow.querySelectorAll('button').length, 40);
    assert.equal(first.isConnected, false);
    assert.equal(controls.isFeed(), true);
    controls.destroy();
    assert.equal(doc.querySelector('[data-speechify-ui]'), null);
    assert.equal(doc.querySelectorAll('[data-testid="tweetText"]').length, 50);
  } finally {
    controls.destroy();
    win.happyDOM.abort();
  }
});

test('a recycled feed node gets a fresh target identity instead of resuming stale speech', () => {
  const { win, doc } = page(
    '<main><div data-testid="tweetText">Original post.</div></main>',
    'https://x.com/home',
  );
  try {
    const finder = createTargetFinder(doc);
    const original = finder.discover()[0];
    original.anchor.firstChild!.textContent = 'Replacement post.';
    const replacement = finder.discover()[0];
    assert.notEqual(replacement.id, original.id);
    assert.equal(replacement.anchor, original.anchor);
  } finally {
    win.happyDOM.abort();
  }
});

// Happy DOM has no layout hit testing, so supply only the browser's caret result.
function pointAt(doc: Document, node: Node, offset: number) {
  doc.caretRangeFromPoint = () => {
    const range = doc.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    return range;
  };
}

test('hover previews the destination sentence without moving audio or replacing DOM', async () => {
  const { win, doc, registry } = page(
    '<article><p>First sentence. Next <strong>important</strong> sentence.</p></article>',
  );
  const sought: string[] = [];
  const reader = createReader(doc, (id) => sought.push(id));
  try {
    const article = reader.collect();
    const p = doc.querySelector('p')!;
    const markup = p.innerHTML;
    const text = doc.querySelector('strong')!.firstChild!;
    reader.highlight({
      segment: article.segments[0],
      start: 0,
      end: 5,
      follow: false,
      focus: false,
    });
    pointAt(doc, text, 3);
    p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    await new Promise((resolve) => win.requestAnimationFrame(resolve));
    assert.equal(registry.get('speechify-hover')?.ranges[0].toString(), 'Next important sentence.');
    assert.equal(registry.get('speechify-word')?.ranges[0].toString(), 'First');
    assert.deepEqual(sought, [], 'hover does not seek or synthesize');
    assert.equal(p.innerHTML, markup);
    assert.equal(doc.querySelector('strong')!.firstChild, text);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    p.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true);
    assert.deepEqual(sought, [article.segments[1].id]);
    assert.equal(registry.has('speechify-hover'), false);
    assert.equal(p.hasAttribute('data-speechify-hover'), false);
    assert.equal(registry.has('speechify-word'), true);
  } finally {
    reader.deactivate();
    win.happyDOM.abort();
  }
});

test('hover works before playback and click starts at the first chunk of a long sentence', async () => {
  const { win, doc, registry } = page(
    `<article><p>${'Long sentence words '.repeat(25)}end.</p></article>`,
  );
  const sought: string[] = [];
  const reader = createReader(doc, (id) => sought.push(id));
  try {
    const article = reader.collect();
    const p = doc.querySelector('p')!;
    pointAt(doc, p.firstChild!, 320);
    p.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    await new Promise((resolve) => win.requestAnimationFrame(resolve));
    assert.equal(registry.get('speechify-hover')?.ranges[0].toString(), p.textContent);
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.deepEqual(sought, [article.segments[0].id]);
  } finally {
    reader.deactivate();
    win.happyDOM.abort();
  }
});

test('hovering another feed item keeps current speech mapping and routes the clicked sentence', async () => {
  const { win, doc, registry } = page(
    '<main><div data-testid="tweetText">Current post.</div><div data-testid="tweetText">Other post. Start here.</div></main>',
  );
  const targets = createTargetFinder(doc).discover();
  const navigation: unknown[] = [];
  const reader = createReader(
    doc,
    () => assert.fail('other posts must be captured separately'),
    undefined,
    {
      targetAt: (element) => targets.find((t) => t.anchor.contains(element)),
      read: (targetId, startSegment) => navigation.push({ targetId, startSegment }),
    },
  );
  try {
    const article = reader.collect(false, targets[0]);
    const other = targets[1].anchor;
    pointAt(doc, other.firstChild!, 15);
    other.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    await new Promise((resolve) => win.requestAnimationFrame(resolve));
    assert.equal(registry.get('speechify-hover')?.ranges[0].toString(), 'Start here.');
    reader.highlight({
      segment: article.segments[0],
      start: 0,
      end: 7,
      follow: false,
      focus: false,
    });
    assert.equal(registry.get('speechify-word')?.ranges[0].toString(), 'Current');
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.deepEqual(navigation, [{ targetId: targets[1].id, startSegment: '0:12' }]);
  } finally {
    reader.deactivate();
    win.happyDOM.abort();
  }
});

test('links, text selection, drag, modified clicks and a closed reader keep normal page behavior', async () => {
  const { win, doc, registry } = page(
    '<article><p>Ordinary text <a href="/story">a link</a>.</p></article>',
  );
  const sought: string[] = [];
  const reader = createReader(doc, (id) => sought.push(id));
  const hover = async (element: Element, buttons = 0) => {
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons }));
    await new Promise((resolve) => win.requestAnimationFrame(resolve));
  };
  try {
    reader.collect();
    const p = doc.querySelector('p')!;
    const a = doc.querySelector('a')!;
    pointAt(doc, a.firstChild!, 1);
    await hover(a);
    assert.equal(registry.has('speechify-hover'), false);
    // Prevent the test browser actually navigating, while observing reader handling first.
    a.addEventListener('click', (event) => {
      assert.equal(event.defaultPrevented, false);
      event.preventDefault();
    });
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    pointAt(doc, p.firstChild!, 2);
    await hover(p, 1);
    assert.equal(registry.has('speechify-hover'), false);
    const selected = doc.createRange();
    selected.setStart(p.firstChild!, 0);
    selected.setEnd(p.firstChild!, 8);
    doc.getSelection()!.addRange(selected);
    await hover(p);
    const selecting = new MouseEvent('click', { bubbles: true, cancelable: true });
    p.dispatchEvent(selecting);
    assert.equal(selecting.defaultPrevented, false);
    assert.equal(registry.has('speechify-hover'), false);
    doc.getSelection()!.removeAllRanges();
    const modified = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    p.dispatchEvent(modified);
    assert.equal(modified.defaultPrevented, false);
    await hover(p);
    assert.equal(registry.has('speechify-hover'), true);
    doc.dispatchEvent(new Event('scroll'));
    assert.equal(registry.has('speechify-hover'), false);
    reader.deactivate();
    await hover(p);
    p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(registry.has('speechify-hover'), false);
    assert.deepEqual(sought, []);
  } finally {
    reader.deactivate();
    win.happyDOM.abort();
  }
});
