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
import { DEFAULTS, VOICES, type Article, type Bookmark, type Preferences } from '../shared';
import * as api from '../lib/api';
import * as platform from '../lib/platform';
import { ReaderPlayer, type PlayerState } from '../lib/player';
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
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [trying, setTrying] = useState('');
  const previewAudio = useRef<HTMLAudioElement | undefined>(undefined);
  const previewAbort = useRef<AbortController | undefined>(undefined);
  const previewURL = useRef('');

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

  async function capture(selection = false) {
    player.stop();
    setCapturing(true);
    setError('');
    try {
      const page = await platform.readPage(selection);
      const index = await platform.resumeFor(page.url);
      articleRef.current = page;
      setArticle(page);
      player.load(page, index);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This page could not be read.');
    } finally {
      setCapturing(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void Promise.all([platform.preferences(), platform.bookmarks()]).then(
      ([preferences, marks]) => {
        if (cancelled) return;
        setPrefs(preferences);
        setDraft(preferences.key);
        setSaved(marks);
        player.configure(preferences);
        setReady(true);
        void platform.requestedSelection().then(capture);
      },
    );
    const ping = () => {
      if (!document.hidden)
        void api
          .health()
          .then((v) => setOnline(v.models_ready))
          .catch(() => setOnline(false));
    };
    ping();
    const timer = setInterval(ping, 12000);
    const remove = platform.subscribe(
      (id, tabId) => {
        if (tabId && tabId !== articleRef.current?.tabId) return;
        const index = articleRef.current?.segments.findIndex((s) => s.id === id) ?? -1;
        if (index >= 0) {
          player.seek(index);
          void player.play(index);
        }
      },
      (selection) => void capture(selection),
    );
    const leave = () => {
      player.destroy();
      stopPreview();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      cancelled = true;
      clearInterval(timer);
      remove();
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);
  function update(next: Partial<Preferences>) {
    const value = { ...prefs, ...next };
    setPrefs(value);
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
  const canPlay = !!article && !!prefs.key && online;
  const progress = article
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
  return (
    <div className="reader-app" data-speechify-ui>
      <header className="app-header">
        <div className="wordmark">
          <span className="brand-mark">
            <AudioLines size={21} />
          </span>
          <div>
            Speechify<small>YOUR LOCAL READER</small>
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="Reader settings"
          onClick={() => {
            setSettings(!settings);
            setError('');
          }}
        >
          <Settings size={19} />
        </button>
      </header>
      <div className="connection-status">
        <span className={online ? 'status-dot online' : 'status-dot'} />
        {online ? 'On your Mac' : 'Reader offline'}
        {platform.isPreview && <span className="preview-badge">Preview</span>}
      </div>
      <nav className="tabs" aria-label="Reader sections">
        {(['listen', 'voices', 'saved'] as const).map((value) => (
          <button
            key={value}
            className={tab === value ? 'tab active' : 'tab'}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === 'listen' ? 'Listen' : value === 'voices' ? 'Voices' : 'Saved'}
          </button>
        ))}
      </nav>
      <main className="panel-content">
        {(settings || (ready && !prefs.key)) && (
          <section className="connection-card" aria-label="Connect local reader">
            <div className="card-heading">
              <Headphones size={20} />
              <h2>Connect to this Mac</h2>
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
            <p>
              Start the local reader, then paste the connection key shown in its Terminal window.
              You only need to do this once.
            </p>
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
              {connecting ? 'Connecting…' : 'Connect reader'}
            </button>
          </section>
        )}
        {(error || state.error) && (
          <div className="error-note" role="alert">
            <CircleHelp size={18} />
            <span>{error || state.error}</span>
          </div>
        )}
        {tab === 'listen' && (
          <>
            <section className="page-context">
              <div className="eyebrow">
                ON THIS PAGE
                <button
                  className="icon-button small"
                  aria-label="Read current page"
                  disabled={capturing}
                  onClick={() => void capture()}
                >
                  <RefreshCw size={14} className={capturing ? 'spin' : ''} />
                </button>
              </div>
              <h1>{article?.title || 'Something good to read.'}</h1>
              <div className="source-name">
                {article
                  ? new URL(article.url).hostname
                  : 'Open an article, then click the extension icon.'}
              </div>
            </section>
            {current && (
              <section className="passage" aria-label="Current passage">
                <div className="passage-label">
                  {preparing
                    ? 'PREPARING YOUR NEXT WORDS'
                    : playing
                      ? 'READING WITH YOU'
                      : 'YOUR PLACE IS KEPT'}
                </div>
                <p>
                  {state.word ? (
                    <>
                      {current.text.slice(0, state.word.start_char)}
                      <mark>{current.text.slice(state.word.start_char, state.word.end_char)}</mark>
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
                ? 'Bella is getting this passage ready…'
                : playing
                  ? 'A little easier, one passage at a time.'
                  : state.phase === 'finished'
                    ? 'You’ve reached the end.'
                    : state.phase === 'paused'
                      ? 'Paused. Pick up whenever you’re ready.'
                      : 'Ready when you are.'}
            </div>
            <div className="position">
              <label htmlFor="reading-position">
                {article
                  ? `Section ${state.index + 1} of ${article.segments.length}`
                  : 'Reading position'}
              </label>
              <span>{progress}%</span>
              <input
                id="reading-position"
                type="range"
                min="0"
                max={Math.max(1, (article?.segments.length || 1) - 1)}
                value={state.index}
                disabled={!article}
                onChange={(e) => player.seek(Number(e.target.value))}
              />
            </div>
            <div className="divider" />
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
              <label htmlFor="listening-speed">Listening speed</label>
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
                <span>Take it slowly</span>
                <span>Move a little faster</span>
              </div>
            </div>
            <label className="toggle-row">
              <span>Follow the words on the page</span>
              <input
                type="checkbox"
                checked={prefs.follow}
                onChange={(e) => update({ follow: e.target.checked })}
              />
            </label>
            <label className="toggle-row">
              <span>Dim surrounding paragraphs</span>
              <input
                type="checkbox"
                checked={prefs.focus}
                onChange={(e) => update({ focus: e.target.checked })}
              />
            </label>
            <div className="secondary-actions">
              <button
                className="subtle-button"
                disabled={!current || savedHere}
                onClick={savePassage}
              >
                <BookmarkIcon size={16} fill={savedHere ? 'currentColor' : 'none'} />
                {savedHere ? 'Passage saved' : 'Save this passage'}
              </button>
              <button
                className="icon-button"
                aria-label="Stop reading and clear highlights"
                onClick={() => player.stop()}
              >
                <Square size={15} />
              </button>
            </div>
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
              Read selected text instead
            </button>
          </>
        )}
        {tab === 'voices' && (
          <section className="voices-panel">
            <div className="section-intro">
              <h1>A voice you feel at home with.</h1>
              <p>Choose your everyday reading companion.</p>
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
                  <span>
                    {prefs.voice === item.id ? 'Your everyday voice' : 'Available on your Mac'}
                  </span>
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
        {tab === 'saved' && (
          <section className="saved-panel">
            <div className="section-intro">
              <h1>A place to come back to.</h1>
              <p>Your saved passages stay on this device.</p>
            </div>
            {!saved.length ? (
              <div className="empty-saved">
                <BookmarkIcon size={31} />
                <h2>Keep a thought for later.</h2>
                <p>Save a passage while you listen. It will be waiting here.</p>
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
      <footer className="app-footer">
        <span className="footer-mark">
          <AudioLines size={13} />
        </span>{' '}
        Your words. Your voice. On your Mac.
      </footer>
    </div>
  );
}
