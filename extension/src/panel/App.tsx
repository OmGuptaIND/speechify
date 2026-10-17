import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  Check,
  ChevronRight,
  CircleHelp,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULTS,
  VOICES,
  type Article,
  type Bookmark,
  type Preferences,
  type ReaderRequest,
} from '../shared';
import * as api from '../lib/api';
import * as platform from '../lib/platform';
import { ReaderPlayer, type PlayerState } from '../lib/player';
import { RailFrame } from './Rail';
import './styles.css';

export function App() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [article, setArticle] = useState<Article>();
  const articleRef = useRef<Article | undefined>(undefined);
  const [state, setState] = useState<PlayerState>({ index: 0, phase: 'ready' });
  const [player] = useState(() => new ReaderPlayer(DEFAULTS, setState));
  const [tab, setTab] = useState<'listen' | 'voices' | 'saved'>('listen');
  const [saved, setSaved] = useState<Bookmark[]>([]);
  const [online, setOnline] = useState(false);
  const [settings, setSettings] = useState(false);
  const [details, setDetails] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [trying, setTrying] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const previewAudio = useRef<HTMLAudioElement | undefined>(undefined);
  const previewAbort = useRef<AbortController | undefined>(undefined);
  const previewURL = useRef('');
  const captureVersion = useRef(0);
  const prefsRef = useRef(DEFAULTS);

  function stopPreview() {
    previewAudio.current?.pause();
    previewAudio.current?.removeAttribute('src');
    previewAudio.current?.load();
    previewAudio.current = undefined;
    previewAbort.current?.abort();
    if (previewURL.current) URL.revokeObjectURL(previewURL.current);
    previewURL.current = '';
    setTrying('');
  }

  async function capture(selection = false, target?: ReaderRequest) {
    if (
      target?.autoplay &&
      !target.startSegment &&
      target.targetId === articleRef.current?.targetId &&
      target.tabId === articleRef.current?.tabId
    ) {
      stopPreview();
      if (player.state.phase === 'playing' || player.state.phase === 'preparing') player.pause();
      else if (prefsRef.current.key)
        void player.play(player.state.phase === 'finished' ? 0 : player.state.index);
      else setSettings(true);
      return;
    }
    const version = ++captureVersion.current;
    stopPreview();
    player.destroy();
    articleRef.current = undefined;
    setArticle(undefined);
    setCapturing(true);
    setError('');
    try {
      const page = await platform.readPage(selection, target);
      const index = target?.startSegment
        ? Math.max(
            0,
            page.segments.findIndex((s) => s.id === target.startSegment),
          )
        : target?.autoplay
          ? 0
          : await platform.resumeFor(page.url);
      if (version !== captureVersion.current) return;
      articleRef.current = page;
      setArticle(page);
      player.load(page, index);
      if (target?.autoplay && page.segments.length) {
        if (prefsRef.current.key) void player.play(index);
        else setSettings(true);
      }
    } catch (e) {
      if (version === captureVersion.current)
        setError(e instanceof Error ? e.message : 'This page could not be read.');
    } finally {
      if (version === captureVersion.current) setCapturing(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void Promise.all([platform.preferences(), platform.bookmarks()]).then(
      ([preferences, marks]) => {
        if (cancelled) return;
        setPrefs(preferences);
        prefsRef.current = preferences;
        setDraft(preferences.key);
        setSaved(marks);
        player.configure(preferences);
        setReady(true);
        const version = captureVersion.current;
        void platform.initialRequest().then((request) => {
          if (!cancelled && version === captureVersion.current)
            void capture(!!request?.selection, request);
          if (platform.isPage) parent.postMessage({ source: 'speechify-rail', type: 'ready' }, '*');
        });
      },
    );
    const ping = () => {
      void api
        .health()
        .then((v) => {
          if (!cancelled) setOnline(v.models_ready);
        })
        .catch(() => {
          if (!cancelled) setOnline(false);
        });
    };
    const refreshHealth = () => {
      if (!document.hidden) ping();
    };
    // A sidebar or floating window can mount before the browser marks it visible.
    // Check once regardless, then refresh immediately when it comes back into view.
    ping();
    const timer = setInterval(refreshHealth, 12000);
    document.addEventListener('visibilitychange', refreshHealth);
    const remove = platform.subscribe(
      (id, tabId) => {
        if (tabId && tabId !== articleRef.current?.tabId) return;
        const index = articleRef.current?.segments.findIndex((s) => s.id === id) ?? -1;
        if (index >= 0) {
          const wasPlaying = player.state.phase === 'playing' || player.state.phase === 'preparing';
          player.seek(index);
          if (!wasPlaying) void player.play(index);
        }
      },
      (selection, target) => void capture(selection, target),
    );
    const leave = () => {
      player.destroy();
      stopPreview();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshHealth);
      remove();
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);
  useEffect(() => {
    void platform.playbackStatus(article, state.phase);
  }, [article, state.phase]);
  function update(next: Partial<Preferences>) {
    const value = { ...prefs, ...next };
    setPrefs(value);
    prefsRef.current = value;
    player.configure(value);
    void platform.savePreferences(value);
  }
  async function pair() {
    setConnecting(true);
    setError('');
    try {
      await api.connect(draft);
      update({ key: draft.trim() });
      setOnline(true);
      setSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Start the local reader and try again.');
    } finally {
      setConnecting(false);
    }
  }
  const current = article?.segments[state.index];
  const voice = VOICES.find((v) => v.id === prefs.voice)!;
  const playing = state.phase === 'playing';
  const preparing = state.phase === 'preparing';
  const canPlay = !!article?.segments.length && !!prefs.key && online;
  const progress = article?.segments.length
    ? Math.round(
        ((state.index + (state.word && current ? state.word.end_char / current.text.length : 0)) /
          article.segments.length) *
          100,
      )
    : 0;
  const savedHere = saved.some((b) => b.url === article?.url && b.index === state.index);
  function jump(direction: -1 | 1) {
    if (!article || !current) return;
    let index = state.index;
    while (index + direction >= 0 && index + direction < article.segments.length) {
      index += direction;
      if (article.segments[index].paragraph !== current.paragraph) break;
    }
    if (direction === -1) {
      const paragraph = article.segments[index].paragraph;
      while (index > 0 && article.segments[index - 1].paragraph === paragraph) index--;
    }
    player.seek(index);
  }
  function savePassage() {
    if (!article || !current || savedHere) return;
    const value = [
      { url: article.url, title: article.title, index: state.index, excerpt: current.text },
      ...saved,
    ].slice(0, 50);
    setSaved(value);
    void platform.saveBookmarks(value);
  }
  async function tryVoice(id: Preferences['voice']) {
    player.pause();
    stopPreview();
    const abort = new AbortController();
    previewAbort.current = abort;
    setTrying(id);
    setError('');
    let url = '';
    try {
      const response = await api.speak(
        "Take your time. I'll keep your place, and we can read this together.",
        id,
        prefs.key,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(response.audio), (c) => c.charCodeAt(0))], {
          type: response.mime_type,
        }),
      );
      previewURL.current = url;
      const audio = new Audio(url);
      if (platform.isPreview && new URLSearchParams(location.search).has('muted'))
        audio.muted = true;
      previewAudio.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        previewURL.current = '';
        setTrying('');
      };
      await audio.play();
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : 'The sample could not be played.');
      setTrying('');
    }
  }
  const headings =
    article?.segments.filter(
      (s, i, list) => s.heading && (i === 0 || s.heading !== list[i - 1].heading),
    ) || [];
  const compact = platform.isPreview || platform.isPage;
  const sheetOpen = settings || details;
  const showConnection = settings || (ready && !prefs.key);
  function collapseControls() {
    setSettings(false);
    setDetails(false);
  }
  const rates = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
  const rateLabel = `${Number((Math.round(prefs.rate * 100) / 100).toFixed(2))}×`;
  function dismissRail() {
    if (playing || preparing) player.pause();
    stopPreview();
    setSettings(false);
    setDetails(false);
    if (platform.isPage) parent.postMessage({ source: 'speechify-rail', type: 'close' }, '*');
    else {
      platform.dismissPreview();
      setDismissed(true);
    }
  }
  return (
    <RailFrame
      compact={compact}
      dismissed={dismissed}
      open={sheetOpen}
      feed={article?.kind === 'feed'}
      playing={playing}
      preparing={preparing}
      canPlay={canPlay}
      rate={rateLabel}
      error={error || state.error}
      hint={
        ready && !prefs.key
          ? 'Connect in settings.'
          : !online
            ? 'Open Speechify on your Mac.'
            : article?.kind === 'feed'
              ? 'Choose a post.'
              : undefined
      }
      onToggle={() => {
        stopPreview();
        if (playing || preparing) player.pause();
        else void player.play(state.phase === 'finished' ? 0 : state.index);
      }}
      onRate={() => {
        const index = rates.findIndex((rate) => Math.abs(rate - prefs.rate) < 0.01);
        update({ rate: rates[(index + 1) % rates.length] });
      }}
      onDetails={() => {
        setDetails(!sheetOpen);
        setSettings(false);
      }}
      onCollapse={collapseControls}
      onSettings={() => {
        setSettings(!settings);
        setDetails(false);
        setError('');
      }}
      onClose={dismissRail}
      onReopen={() => {
        setDismissed(false);
        void capture();
      }}
    >
      <header className="app-header">
        <div className="wordmark">
          <span className="brand-mark">
            <AudioLines size={21} />
          </span>
          <div>Speechify</div>
        </div>
        {compact && (
          <button className="icon-button" aria-label="Close controls" onClick={collapseControls}>
            <X size={18} />
          </button>
        )}
      </header>
      <nav className="tabs" aria-label="Reader sections" hidden={showConnection}>
        {(['listen', 'voices', 'saved'] as const).map((value) => (
          <button
            key={value}
            className={tab === value ? 'tab active' : 'tab'}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === 'listen' ? (
              <Headphones size={15} />
            ) : value === 'voices' ? (
              <AudioLines size={15} />
            ) : (
              <BookmarkIcon size={15} />
            )}
            {value === 'listen' ? 'Listen' : value === 'voices' ? 'Voices' : 'Saved'}
          </button>
        ))}
      </nav>
      <main className="panel-content">
        {showConnection && (
          <section className="connection-card" aria-label="Connect local reader">
            <div className="card-heading">
              <Headphones size={20} />
              <h2>Connect to your Mac</h2>
              {prefs.key && (
                <button
                  className="icon-button small"
                  aria-label="Close settings"
                  onClick={() => setSettings(false)}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <p>Open Speechify on your Mac and paste your connection key.</p>
            <label className="field-label" htmlFor="connection-key">
              Connection key
            </label>
            <input
              id="connection-key"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste your connection key"
            />
            <button
              className="primary-button full"
              disabled={!draft.trim() || connecting}
              onClick={() => void pair()}
            >
              {connecting ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{' '}
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </section>
        )}
        {(error || state.error) && (
          <div className="error-note" role="alert">
            <CircleHelp size={18} />
            <span>{error || state.error}</span>
          </div>
        )}
        {!showConnection && tab === 'listen' && (
          <>
            {article?.segments.length ? (
              <div className="listening-section">
                <section className="page-context">
                  <div className="eyebrow">
                    Now reading
                    <button
                      className="icon-button small"
                      aria-label="Read current page"
                      disabled={capturing}
                      onClick={() => void capture()}
                    >
                      <RefreshCw size={14} className={capturing ? 'spin' : ''} />
                    </button>
                  </div>
                  <h1>{article?.title || 'Choose text'}</h1>
                  <div className="source-name">
                    {article ? new URL(article.url).hostname : 'Open a page to start.'}
                  </div>
                  {platform.isFloating && article && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void platform
                          .showSource(article)
                          .catch(() =>
                            setError(
                              'The original tab was closed. Click the extension icon on another page.',
                            ),
                          )
                      }
                    >
                      Show page <ArrowRight size={13} />
                    </button>
                  )}
                </section>
                {current && (
                  <section className="passage" aria-label="Current passage">
                    <div className="passage-label">
                      {preparing ? 'LOADING' : playing ? 'PLAYING' : 'PASSAGE'}
                    </div>
                    <p>
                      {state.word ? (
                        <>
                          {current.text.slice(0, state.word.start_char)}
                          <mark>
                            {current.text.slice(state.word.start_char, state.word.end_char)}
                          </mark>
                          {current.text.slice(state.word.end_char)}
                        </>
                      ) : (
                        current.text
                      )}
                    </p>
                  </section>
                )}
                <div className="playback-controls">
                  <button
                    className="icon-button skip"
                    aria-label="Previous paragraph"
                    disabled={!article || state.index === 0}
                    onClick={() => jump(-1)}
                  >
                    <SkipBack size={20} />
                  </button>
                  <button
                    className="play-button"
                    aria-label={playing || preparing ? 'Pause reading' : 'Play reading'}
                    disabled={!canPlay}
                    onClick={() => {
                      stopPreview();
                      if (playing || preparing) player.pause();
                      else void player.play(state.phase === 'finished' ? 0 : state.index);
                    }}
                  >
                    {preparing ? (
                      <LoaderCircle className="spin" size={24} />
                    ) : playing ? (
                      <Pause size={24} fill="currentColor" />
                    ) : (
                      <Play size={24} fill="currentColor" />
                    )}
                  </button>
                  <button
                    className="icon-button skip"
                    aria-label="Next paragraph"
                    disabled={!article || state.index >= article.segments.length - 1}
                    onClick={() => jump(1)}
                  >
                    <SkipForward size={20} />
                  </button>
                </div>
                <div className="reading-status" aria-live="polite">
                  {preparing
                    ? 'Loading…'
                    : playing
                      ? 'Playing'
                      : state.phase === 'finished'
                        ? 'Finished'
                        : state.phase === 'paused'
                          ? 'Paused'
                          : 'Ready'}
                </div>
                <div className="position">
                  <label htmlFor="reading-position">
                    {article?.segments.length
                      ? `Section ${state.index + 1} of ${article.segments.length}`
                      : 'Choose a passage to begin'}
                  </label>
                  <span>{progress}%</span>
                  <input
                    id="reading-position"
                    type="range"
                    min="0"
                    max={Math.max(1, (article?.segments.length || 1) - 1)}
                    value={state.index}
                    disabled={!article?.segments.length}
                    onChange={(e) => player.seek(Number(e.target.value))}
                  />
                </div>
              </div>
            ) : (
              <div className="reading-empty">
                <Headphones size={20} />
                <div>
                  <h1>
                    {article?.kind === 'feed' ? 'Choose a post to listen' : 'Choose text to listen'}
                  </h1>
                  <p>
                    {article?.kind === 'feed'
                      ? 'Press play beside a post on the page.'
                      : 'Open a page or select a passage.'}
                  </p>
                </div>
              </div>
            )}
            <div className="listening-preferences">
              <button className="voice-row" onClick={() => setTab('voices')}>
                <span className="voice-avatar">{voice.initial}</span>
                <span>
                  <strong>{voice.name}</strong>
                  <small>American English</small>
                </span>
                <span className="change-label">Change</span>
                <ChevronRight size={16} />
              </button>
              <div className="speed-control">
                <label htmlFor="listening-speed">Speed</label>
                <span className="speed-value">{prefs.rate}×</span>
                <input
                  id="listening-speed"
                  type="range"
                  min="0.75"
                  max="2.5"
                  step="0.25"
                  value={prefs.rate}
                  onChange={(e) => update({ rate: Number(e.target.value) })}
                />
                <div className="speed-labels">
                  <span>0.75×</span>
                  <span>2.5×</span>
                </div>
              </div>
              <label className="toggle-row">
                <span>Auto-scroll</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={prefs.follow}
                  onChange={(e) => update({ follow: e.target.checked })}
                />
              </label>
              <label className="toggle-row">
                <span>Dim other text</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={prefs.focus}
                  onChange={(e) => update({ focus: e.target.checked })}
                />
              </label>
            </div>
            {!!current && (
              <div className="secondary-actions">
                <button
                  className="subtle-button"
                  disabled={!current || savedHere}
                  onClick={savePassage}
                >
                  <BookmarkIcon size={16} fill={savedHere ? 'currentColor' : 'none'} />
                  {savedHere ? 'Saved' : 'Save'}
                </button>
                <button
                  className="icon-button"
                  aria-label="Stop reading and clear highlights"
                  onClick={() => player.stop()}
                >
                  <Square size={15} />
                </button>
              </div>
            )}
            {!!headings.length && (
              <details className="outline">
                <summary>On this page</summary>
                {headings.map((s) => (
                  <button key={s.id} onClick={() => player.seek(article!.segments.indexOf(s))}>
                    <span>{s.heading}</span>
                    <ArrowRight size={13} />
                  </button>
                ))}
              </details>
            )}
            <button
              className="text-button selection-button"
              disabled={capturing}
              onClick={() => void capture(true)}
            >
              Read selection
            </button>
          </>
        )}
        {!showConnection && tab === 'voices' && (
          <section className="voices-panel">
            <div className="section-intro">
              <h1>Choose your voice</h1>
            </div>
            {VOICES.map((item) => (
              <div
                key={item.id}
                className={prefs.voice === item.id ? 'voice-choice selected' : 'voice-choice'}
              >
                <button
                  className="voice-select"
                  aria-pressed={prefs.voice === item.id}
                  onClick={() => {
                    stopPreview();
                    update({ voice: item.id });
                  }}
                >
                  <span className="voice-avatar large">{item.initial}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>English · United States</small>
                  </span>
                  {prefs.voice === item.id && <Check className="selected-check" size={18} />}
                </button>
                <div className="voice-choice-bottom">
                  <span>{prefs.voice === item.id ? 'Selected' : 'English'}</span>
                  <button
                    className="text-button"
                    aria-label={
                      trying === item.id ? `Stop ${item.name} preview` : `Listen to ${item.name}`
                    }
                    disabled={!prefs.key || !online || (!!trying && trying !== item.id)}
                    onClick={() => {
                      if (trying === item.id) {
                        stopPreview();
                      } else void tryVoice(item.id);
                    }}
                  >
                    {trying === item.id ? <Square size={12} /> : <Play size={12} />}{' '}
                    {trying === item.id ? 'Stop' : 'Listen'}
                  </button>
                </div>
              </div>
            ))}
            <button className="subtle-button back-to-reading" onClick={() => setTab('listen')}>
              <ArrowLeft size={15} />
              Back to reading
            </button>
          </section>
        )}
        {!showConnection && tab === 'saved' && (
          <section className="saved-panel">
            <div className="section-intro">
              <h1>Saved passages</h1>
            </div>
            {!saved.length ? (
              <div className="empty-saved">
                <BookmarkIcon size={31} />
                <h2>No saved passages</h2>
                <p>Save a passage while listening to return to it here.</p>
              </div>
            ) : (
              saved.map((item, i) => (
                <div className="saved-passage" key={item.url + item.index}>
                  <div className="saved-title">
                    {item.title}
                    <button
                      className="icon-button small"
                      aria-label={'Remove saved passage ' + (i + 1)}
                      onClick={() => {
                        const value = saved.filter((_, index) => index !== i);
                        setSaved(value);
                        void platform.saveBookmarks(value);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p>{item.excerpt}</p>
                  {article?.url === item.url ? (
                    <button
                      className="text-button"
                      onClick={() => {
                        player.seek(item.index);
                        setTab('listen');
                      }}
                    >
                      <Play size={13} />
                      Return to passage
                    </button>
                  ) : (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-button">
                      Open article
                      <ArrowRight size={13} />
                    </a>
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </main>
      <footer className="panel-footer">
        <button
          className="connection-button"
          aria-label="Reader settings"
          aria-expanded={showConnection}
          onClick={() => {
            setSettings(!settings);
            setError('');
          }}
        >
          <span className={online && prefs.key ? 'status-dot online' : 'status-dot'} />
          <span>{online && prefs.key ? 'Connected to your Mac' : 'Connect to your Mac'}</span>
          <Settings size={14} />
        </button>
        {platform.isPreview && <span className="preview-badge">Preview</span>}
      </footer>
    </RailFrame>
  );
}
