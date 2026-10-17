import { createTargetFinder, type ReadingTarget } from './targets';

const PLAY =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';

export function createInlineControls(doc: Document, read: (id: string) => void) {
  const finder = createTargetFinder(doc);
  const host = doc.createElement('div');
  host.setAttribute('data-speechify-ui', '');
  host.id = 'speechify-inline-controls';
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483645';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
    button{all:initial;box-sizing:border-box;position:absolute;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:transparent;color:#9282d6;cursor:pointer;pointer-events:auto}
    button:hover,button:focus-visible{background:#89818f1c;color:#a394e5}
    button:focus-visible{outline:2px solid #9c8cff;outline-offset:2px}
    button[aria-pressed=true]{color:#b3a3f1;background:#89818f12}
    button svg{display:block;flex:none;width:12px;height:12px}
    button[hidden]{display:none}
    @media(prefers-color-scheme:light){button{color:#7465b1}button:hover{color:#5e4f99;background:#7465b112}}
    @media(pointer:coarse){button{width:36px;height:36px}}
  `;
  shadow.append(style);
  doc.documentElement.append(host);
  let targets: ReadingTarget[] = [];
  const buttons = new Map<string, HTMLButtonElement>();
  let activeId: string | undefined;
  let playing = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function paint() {
    frame = 0;
    // Only keep controls near the viewport; never accumulate a feed's entire history.
    const visible = targets
      .filter((t) => {
        const r = t.anchor.getBoundingClientRect();
        return (
          t.anchor.isConnected && r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0
        );
      })
      .slice(0, 40);
    const keep = new Set(visible.map((t) => t.id));
    for (const [id, button] of buttons)
      if (!keep.has(id)) {
        button.remove();
        buttons.delete(id);
      }
    for (const target of visible) {
      let button = buttons.get(target.id);
      if (!button) {
        button = doc.createElement('button');
        button.type = 'button';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          read(target.id);
        });
        shadow.append(button);
        buttons.set(target.id, button);
      }
      const selected = target.id === activeId && playing;
      const label = `${selected ? 'Pause' : 'Read'} ${target.kind} with Bella`;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(selected));
      const icon = selected ? PAUSE : PLAY;
      if (button.innerHTML !== icon) button.innerHTML = icon;
      const box = target.anchor.getBoundingClientRect();
      const left = box.left >= 36 ? box.left - 34 : Math.min(innerWidth - 34, box.right + 4);
      button.style.left = `${Math.max(4, left)}px`;
      button.style.top = `${Math.max(4, Math.min(innerHeight - 34, box.top))}px`;
    }
  }
  function schedulePaint() {
    if (!frame && !stopped) frame = requestAnimationFrame(paint);
  }
  function scan() {
    timer = undefined;
    targets = finder.discover();
    schedulePaint();
  }
  const observer = new MutationObserver((records) => {
    if (
      records.every((record) =>
        (record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
          '[data-speechify-ui]',
        ),
      )
    )
      return;
    if (!timer) timer = setTimeout(scan, 180);
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  doc.addEventListener('scroll', schedulePaint, { passive: true, capture: true });
  window.addEventListener('resize', schedulePaint);
  const resize = new ResizeObserver(schedulePaint);
  resize.observe(doc.body);
  scan();
  return {
    targetAt: (element: Element) => targets.find((t) => t.roots.some((r) => r.contains(element))),
    find: (id: string) => {
      targets = finder.discover();
      schedulePaint();
      return targets.find((t) => t.id === id && t.roots.every((r) => r.isConnected));
    },
    defaultTarget: () => targets.find((t) => t.kind === 'article'),
    isFeed: () =>
      targets.some((t) => t.kind !== 'article') && !targets.some((t) => t.kind === 'article'),
    status(id: string | undefined, phase: string) {
      activeId = id;
      playing = phase === 'playing' || phase === 'preparing';
      schedulePaint();
    },
    destroy() {
      stopped = true;
      observer.disconnect();
      resize.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      doc.removeEventListener('scroll', schedulePaint, true);
      window.removeEventListener('resize', schedulePaint);
      host.remove();
      targets = [];
      buttons.clear();
    },
  };
}
