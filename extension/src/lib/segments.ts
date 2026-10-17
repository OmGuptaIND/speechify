import type { Segment } from '../shared';

export function splitParagraph(text: string, paragraph: number, heading?: string): Segment[] {
  const result: Segment[] = [];
  const sentences = new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text);
  for (const sentence of sentences) {
    const sentenceStart = sentence.index;
    const sentenceEnd = sentenceStart + sentence.segment.length;
    let at = sentenceStart;
    while (at < sentenceEnd) {
      while (at < sentenceEnd && /\s/.test(text[at])) at++;
      if (at >= sentenceEnd) break;
      let end = Math.min(at + 220, sentenceEnd);
      if (end < sentenceEnd) {
        const boundary = text.lastIndexOf(' ', end);
        if (boundary > at) end = boundary;
        if (end > at && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      }
      result.push({
        id: `${paragraph}:${at}`,
        paragraph,
        text: text.slice(at, end),
        start: at,
        end,
        sentenceStart,
        sentenceEnd,
        heading,
      });
      at = end;
    }
  }
  return result;
}
