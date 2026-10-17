import * as api from './api';
import type { Article, Preferences, Speech, WordTiming } from '../shared';
import * as platform from './platform';

export type Phase = 'ready' | 'preparing' | 'playing' | 'paused' | 'finished' | 'error';
export interface PlayerState {
  index: number;
  phase: Phase;
  word?: WordTiming;
  error?: string;
  elapsed?: number;
}
export class ReaderPlayer {
  state: PlayerState = { index: 0, phase: 'ready' };
  private article?: Article;
  private prefs: Preferences;
  private audio = new Audio();
  private abort = new AbortController();
  private cache = new Map<string, Promise<Speech>>();
  private epoch = 0;
  private frame = 0;
  private objectURL = '';
  private lastWord = -1;
  private shownSecond = -1;
  constructor(
    prefs: Preferences,
    private notify: (state: PlayerState) => void,
  ) {
    this.prefs = prefs;
    this.audio.preservesPitch = true;
    if (platform.isPreview && new URLSearchParams(location.search).has('muted'))
      this.audio.muted = true;
  }
  configure(prefs: Preferences) {
    const changed = prefs.voice !== this.prefs.voice || prefs.key !== this.prefs.key;
    this.prefs = prefs;
    this.audio.playbackRate = prefs.rate;
    if (changed) {
      this.stop(false);
      this.cache.clear();
    } else if (this.article && this.state.word) {
      void platform
        .highlight(this.article, {
          segment: this.article.segments[this.state.index],
          start: this.state.word.start_char,
          end: this.state.word.end_char,
          follow: prefs.follow,
          focus: prefs.focus,
        })
        .catch(() => {});
    }
  }
  load(article: Article, index = 0) {
    this.stop();
    this.article = article;
    this.state = {
      index: Math.max(0, Math.min(index, article.segments.length - 1)),
      phase: 'ready',
    };
    this.emit();
  }
  private emit() {
    this.notify({ ...this.state });
  }
  private request(index: number) {
    const text = this.article!.segments[index].text;
    const key = this.prefs.voice + ':' + text;
    if (!this.cache.has(key)) {
      const promise = api.speak(text, this.prefs.voice, this.prefs.key, this.abort.signal);
      this.cache.set(key, promise);
      promise.catch(() => {
        if (this.cache.get(key) === promise) this.cache.delete(key);
      });
      while (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value!);
    }
    return this.cache.get(key)!;
  }
  async play(index = this.state.index) {
    if (!this.article || !this.prefs.key) return;
    if (this.state.phase === 'paused' && index === this.state.index && this.audio.src) {
      try {
        await this.audio.play();
        this.state.phase = 'playing';
        this.emit();
        this.follow(this.epoch);
      } catch {
        this.fail('Press Play again to resume audio.');
      }
      return;
    }
    const epoch = ++this.epoch;
    this.audio.pause();
    cancelAnimationFrame(this.frame);
    this.state = { index, phase: 'preparing' };
    this.emit();
    try {
      const data = await this.request(index);
      if (epoch !== this.epoch) return;
      if (this.objectURL) URL.revokeObjectURL(this.objectURL);
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      this.objectURL = URL.createObjectURL(new Blob([bytes], { type: data.mime_type }));
      this.audio.src = this.objectURL;
      this.audio.playbackRate = this.prefs.rate;
      this.lastWord = -1;
      this.audio.onended = () => {
        if (epoch !== this.epoch) return;
        if (index + 1 < this.article!.segments.length) void this.play(index + 1);
        else {
          this.state.phase = 'finished';
          this.emit();
          void platform.remember(this.article!, 0);
        }
      };
      this.audio.onerror = () =>
        this.fail('The audio could not be played. Try this passage again.');
      await this.audio.play();
      if (epoch !== this.epoch) {
        this.audio.pause();
        return;
      }
      this.state.phase = 'playing';
      this.emit();
      this.follow(epoch, data);
      // One following chunk only; never render the entire article in advance.
      if (index + 1 < this.article.segments.length) void this.request(index + 1).catch(() => {});
    } catch (error) {
      if (epoch === this.epoch && !this.abort.signal.aborted)
        this.fail(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Press Play in the reader to allow audio on this page.'
            : error instanceof TypeError
              ? 'Open Speechify on your Mac, then press Play again.'
              : error instanceof Error
                ? error.message
                : 'The local reader is not available.',
        );
    }
  }
  private currentData?: Speech;
  private follow(epoch: number, data = this.currentData) {
    if (!data) return;
    this.currentData = data;
    const tick = () => {
      if (epoch !== this.epoch || this.audio.paused) return;
      const at = this.audio.currentTime;
      const wordIndex = data.words.findIndex((w) => w.start <= at && w.end > at);
      let changed = false;
      if (wordIndex !== this.lastWord && wordIndex >= 0) {
        this.lastWord = wordIndex;
        this.state.word = data.words[wordIndex];
        void platform
          .highlight(this.article!, {
            segment: this.article!.segments[this.state.index],
            start: this.state.word.start_char,
            end: this.state.word.end_char,
            follow: this.prefs.follow,
            focus: this.prefs.focus,
          })
          .catch(() => {});
        changed = true;
      }
      const second = Math.floor(at);
      if (second !== this.shownSecond) {
        this.shownSecond = second;
        this.state.elapsed = at;
        changed = true;
      }
      if (changed) this.emit();
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }
  pause() {
    this.audio.pause();
    cancelAnimationFrame(this.frame);
    if (this.state.phase === 'preparing') {
      this.epoch++;
      this.abort.abort();
      this.abort = new AbortController();
      this.cache.clear();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.currentData = undefined;
    }
    this.state.phase = 'paused';
    this.state.elapsed = Number.isFinite(this.audio.currentTime)
      ? this.audio.currentTime
      : this.state.elapsed;
    this.emit();
    if (this.article) void platform.remember(this.article, this.state.index);
  }
  stop(clear = true) {
    this.epoch++;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.abort = new AbortController();
    this.cache.clear();
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = '';
    this.currentData = undefined;
    if (clear) void platform.clear(this.article);
    this.shownSecond = -1;
    this.state = { index: this.state.index, phase: 'ready', elapsed: 0 };
    this.emit();
  }
  seek(index: number) {
    if (!this.article) return;
    const playing = this.state.phase === 'playing' || this.state.phase === 'preparing';
    this.stop(false);
    this.state.index = Math.max(0, Math.min(index, this.article.segments.length - 1));
    this.emit();
    if (playing) void this.play();
    else {
      const segment = this.article.segments[this.state.index];
      void platform
        .highlight(this.article, {
          segment,
          start: 0,
          end: segment.text.match(/\S+/)?.[0].length || 1,
          follow: this.prefs.follow,
          focus: this.prefs.focus,
        })
        .catch(() => {});
    }
  }
  private fail(error: string) {
    this.audio.pause();
    cancelAnimationFrame(this.frame);
    this.state = { ...this.state, phase: 'error', error };
    this.emit();
  }
  destroy() {
    if (this.article)
      void platform.remember(this.article, this.state.phase === 'finished' ? 0 : this.state.index);
    this.stop();
  }
}
