export type Voice = 'af_bella' | 'af_heart' | 'af_nicole';
export interface ReaderRequest {
  tabId: number;
  windowId: number;
  selection: boolean;
  targetId?: string;
  autoplay?: boolean;
  startSegment?: string;
}
export interface Segment {
  id: string;
  paragraph: number;
  text: string;
  start: number;
  end: number;
  sentenceStart: number;
  sentenceEnd: number;
  heading?: string;
}
export interface Article {
  title: string;
  url: string;
  segments: Segment[];
  tabId?: number;
  targetId?: string;
  kind?: 'article' | 'post' | 'comment' | 'feed';
}
export interface HighlightRequest {
  segment: Segment;
  start: number;
  end: number;
  follow: boolean;
  focus: boolean;
}
export interface WordTiming {
  text: string;
  start_char: number;
  end_char: number;
  start: number;
  end: number;
}
export interface Speech {
  audio: string;
  mime_type: string;
  duration: number;
  words: WordTiming[];
  alignment: string;
  generation_ms: number;
}
export interface Preferences {
  key: string;
  voice: Voice;
  rate: number;
  follow: boolean;
  focus: boolean;
}
export interface Bookmark {
  url: string;
  title: string;
  index: number;
  excerpt: string;
}
export const DEFAULTS: Preferences = {
  key: '',
  voice: 'af_bella',
  rate: 1,
  follow: true,
  focus: false,
};
export const VOICES: { id: Voice; name: string; initial: string }[] = [
  { id: 'af_bella', name: 'Bella', initial: 'B' },
  { id: 'af_heart', name: 'Heart', initial: 'H' },
  { id: 'af_nicole', name: 'Nicole', initial: 'N' },
];
