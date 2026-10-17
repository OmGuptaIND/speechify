import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, LoaderCircle, Pause, Play, Settings, X } from 'lucide-react';
import { isPage } from '../lib/platform';

export function RailFrame(props: {
  compact: boolean;
  dismissed: boolean;
  open: boolean;
  feed: boolean;
  playing: boolean;
  preparing: boolean;
  canPlay: boolean;
  rate: string;
  error?: string;
  hint?: string;
  onToggle: () => void;
  onRate: () => void;
  onSettings: () => void;
  onDetails: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onReopen: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const controlsButton = useRef<HTMLButtonElement>(null);
  const [showHint, setShowHint] = useState(false);
  const [hiddenError, setHiddenError] = useState<string>();
  const notice =
    !props.open && ((props.error !== hiddenError && props.error) || (showHint && props.hint));
  useEffect(() => {
    if (!props.compact) return;
    const receive = (event: MessageEvent) => {
      if (!isPage || event.source !== parent || event.data?.source !== 'speechify-host') return;
      if (event.data.type === 'viewport' && Number.isFinite(event.data.height))
        document.documentElement.style.setProperty(
          '--reader-viewport-height',
          `${Math.max(0, event.data.height)}px`,
        );
      if (event.data.type === 'collapse') props.onCollapse();
    };
    const dismiss = (event: KeyboardEvent) => {
      if (props.open && event.key === 'Escape') {
        event.preventDefault();
        props.onCollapse();
        controlsButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (props.open && !isPage && !root.current?.contains(event.target as Node))
        props.onCollapse();
    };
    window.addEventListener('message', receive);
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', outside);
    };
  }, [props.compact, props.open, props.onCollapse]);
  useEffect(() => {
    if (props.open) sheet.current?.focus({ preventScroll: true });
  }, [props.open]);
  useEffect(() => {
    if (!props.compact || !isPage || !root.current) return;
    const el = root.current;
    const send = () => {
      parent.postMessage(
        {
          source: 'speechify-rail',
          type: 'resize',
          // Request the intended width even while the iframe is still collapsed.
          width: props.open ? 456 : notice ? 300 : 64,
          height: Math.ceil(el.getBoundingClientRect().height),
        },
        '*',
      );
    };
    const observer = new ResizeObserver(send);
    observer.observe(el);
    send();
    return () => observer.disconnect();
  }, [props.compact, props.open, notice]);
  if (!props.compact)
    return (
      <div className="reader-app" data-speechify-ui>
        {props.children}
      </div>
    );
  if (props.dismissed)
    return (
      <button className="rail-reopen" data-speechify-ui onClick={props.onReopen}>
        Listen
      </button>
    );

  const busy = props.playing || props.preparing;
  const playLabel = busy ? 'Pause' : props.feed ? 'Choose a post' : 'Play';
  return (
    <div
      className={`page-rail${props.open ? ' rail-expanded' : notice ? ' rail-with-notice' : ''}`}
      ref={root}
      data-speechify-ui
    >
      {props.open && (
        <div
          className="rail-sheet"
          id="reader-controls"
          role="region"
          aria-label="Reader controls"
          tabIndex={-1}
          ref={sheet}
        >
          {props.children}
        </div>
      )}
      {notice && (
        <div
          className="rail-notice"
          role={props.error && props.error !== hiddenError ? 'alert' : 'status'}
        >
          <button
            className="rail-notice-close"
            aria-label="Dismiss message"
            onClick={() => {
              setShowHint(false);
              setHiddenError(props.error);
            }}
          >
            <X size={12} />
          </button>
          <p>{notice}</p>
          {!props.feed && (
            <button className="rail-notice-action" onClick={props.onSettings}>
              Settings
            </button>
          )}
        </div>
      )}
      <div className="rail-stack" aria-label="Floating reader">
        <div className="rail-pill">
          <button
            className={`rail-play${busy ? ' is-playing' : ''}`}
            aria-label={playLabel}
            title={playLabel}
            onClick={() => {
              if (props.canPlay || busy) {
                setShowHint(false);
                props.onToggle();
              } else setShowHint((value) => !value);
            }}
          >
            {props.preparing ? (
              <LoaderCircle className="spin" size={14} />
            ) : props.playing ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
          </button>
          <span className="rail-divider" />
          <button
            className="rail-speed"
            aria-label={`Speed ${props.rate}`}
            title="Speed"
            onClick={props.onRate}
          >
            {props.rate}
          </button>
          <button
            ref={controlsButton}
            className="rail-icon"
            aria-label={props.open ? 'Close controls' : 'Controls'}
            title="Controls"
            aria-expanded={props.open}
            aria-controls={props.open ? 'reader-controls' : undefined}
            onClick={props.onDetails}
          >
            <Settings size={15} />
          </button>
          {props.error && props.error === hiddenError && (
            <button
              className="rail-icon"
              aria-label="Show message"
              title="Show message"
              onClick={() => setHiddenError(undefined)}
            >
              <CircleHelp size={15} />
            </button>
          )}
        </div>
        <button
          className="rail-close"
          aria-label="Close reader"
          title="Close"
          onClick={props.onClose}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
