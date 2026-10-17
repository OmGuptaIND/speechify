# Product direction

The user wants a reading companion for a MacBook and Chrome-based browsers,
including Chrome and Comet. Listening makes reading easier for them. Bella is the
chosen everyday voice. The experience matters as much as voice generation.

## Core flow

Open a page → click the extension → press Play. Keep the source page visible.
Use a quiet sentence highlight and a stronger current-word highlight. Support
clicking a sentence during reading, jumping between paragraphs, following the
page automatically, pausing, and resuming from the same place.

## UI decisions

- A calm, narrow sidebar with three destinations: Listen, Voices, Saved.
- A prominent Play/Pause control. Keep Stop and paragraph navigation nearby.
- Bella selected by default, with voice preview and selection in one place.
- One speed slider, with changes applied to playback immediately.
- Soft purple highlights, clear typography and comfortable spacing, following
  the system appearance. Retain native focus indicators and reduced-motion behavior.
- A small current-passage view makes the words easy to follow even if the original
  website is visually busy. The original page also receives the highlight.
- Local setup is a one-time connection. Keep implementation details out of the
  everyday reading surface.
- Bookmarks and the most recent place are local. No accounts or subscriptions.

## Acceptance priorities

1. No lost place after pause, replay, speed changes or seeking.
2. Highlights follow actual audio and preserve inline links and website layouts.
3. Playback prepares only a little ahead; pausing stops new generation requests.
4. Errors explain how to get back to reading without suggesting the user did something wrong.
5. Confirm Chrome behavior first, then Comet, then representative X pages.
6. Treat Kindle as a separate integration requiring actual book-surface testing.

## Later exploration

The approved visual concept also included a compact-control layout. The initial
implementation focuses on the complete sidebar. Compact controls can follow after
the tab integration and reading experience have been exercised. Summaries, chat,
OCR, other languages and mobile support are not part of this first implementation.
