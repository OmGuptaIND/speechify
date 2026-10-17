// Scope speech to original text nodes. Never invoke the site's own media controls.
export interface ReadingTarget {
  id: string;
  roots: Element[];
  anchor: Element;
  title: string;
  url: string;
  kind: 'article' | 'post' | 'comment';
}

const OMIT = '[data-speechify-ui],nav,aside,footer,[hidden],[aria-hidden="true"]';
const NOTE = '.feed-shared-item, [data-testid="note"], .note, .comment';
const BODY = '.comment-body, .note-body, [data-testid="note-body"]';
export function createTargetFinder(doc: Document) {
  const ids = new WeakMap<Element, { id: string; fingerprint: string }>();
  let next = 0;
  function target(roots: Element[], kind: ReadingTarget['kind'], container = roots[0]) {
    const anchor = roots[0];
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href*="/status/"],a[href*="/note/"],a.comment-date',
    );
    const text = roots
      .map((root) => root.textContent?.trim())
      .join(' ')
      .replace(/\s+/g, ' ');
    // Feed virtualization can reuse a text element for a different post.
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    const fingerprint = `${text.length}:${hash}`;
    let identity = ids.get(anchor);
    if (!identity || identity.fingerprint !== fingerprint) {
      identity = { id: `target-${++next}`, fingerprint };
      ids.set(anchor, identity);
    }
    const id = identity.id;
    return {
      id,
      roots,
      anchor,
      kind,
      title:
        kind === 'article'
          ? doc.querySelector('h1')?.textContent?.trim() || doc.title
          : text.length > 85
            ? text.slice(0, 82).trimEnd() + '…'
            : text,
      url: link?.href || doc.location.href,
    };
  }
  function discover(): ReadingTarget[] {
    const result: ReadingTarget[] = [];
    const seen = new Set<Element>();
    const add = (roots: Element[], kind: ReadingTarget['kind'], container?: Element) => {
      roots = roots.filter((el) => !el.closest(OMIT) && !!el.textContent?.trim());
      if (!roots.length || seen.has(roots[0])) return;
      seen.add(roots[0]);
      result.push(target(roots, kind, container));
    };
    // X marks the post's text independently of author, metrics and media.
    for (const text of doc.querySelectorAll('[data-testid="tweetText"]')) {
      add([text], 'post', text.closest('[data-testid="tweet"],article') || text);
    }
    // Substack Notes and comments, including publication custom domains.
    for (const body of doc.querySelectorAll(BODY)) {
      if (body.parentElement?.closest(BODY)) continue;
      const container = body.closest(NOTE) || body;
      add([body], container.matches('.comment') ? 'comment' : 'post', container);
    }
    const articleBody = doc.querySelector(
      '.available-content .body.markup, .body.markup, .post-content',
    );
    if (articleBody && !articleBody.closest(NOTE)) {
      const heading = doc.querySelector('h1');
      add(
        heading && !articleBody.contains(heading) ? [heading, articleBody] : [articleBody],
        'article',
      );
    }
    if (!result.length) {
      const article = doc.querySelector('article');
      if (article && article.querySelector('p')) add([article], 'article');
    }
    return result;
  }
  return { discover };
}
