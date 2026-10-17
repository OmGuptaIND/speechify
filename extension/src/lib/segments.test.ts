import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitParagraph } from './segments';
test('chunks preserve the exact original character ranges across sentences', () => {
  const text =
    '  Hello, reader. ' +
    'A long paragraph can contain inline links and meaningful numbers. '.repeat(14) +
    ' Done.';
  const pieces = splitParagraph(text, 4);
  assert.ok(pieces.length > 3);
  for (const piece of pieces) {
    assert.equal(text.slice(piece.start, piece.end), piece.text);
    assert.ok(piece.text.length <= 220);
    assert.ok(piece.start >= piece.sentenceStart);
    assert.ok(piece.end <= piece.sentenceEnd);
    assert.equal(piece.paragraph, 4);
  }
  assert.equal(
    pieces
      .map((s) => s.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
    text.replace(/\s+/g, ' ').trim(),
  );
});
test('long unbroken text and emoji never make a chunk loop or split a surrogate pair', () => {
  const text = '👋'.repeat(300) + ' end';
  const pieces = splitParagraph(text, 0);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((p) => p.text.length <= 220));
  for (const p of pieces) assert.ok(!/[\uD800-\uDBFF]$/.test(p.text));
});
