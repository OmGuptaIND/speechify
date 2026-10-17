# Product direction

The user wants a reading companion for a MacBook and Chrome-based browsers,
including Chrome and Comet. Listening makes reading easier for them. Bella is the
chosen everyday voice. The experience matters as much as voice generation.

## Core flow

Open a page → click the extension → use the compact floating player. On X and
Substack feeds, press the play button beside the post or comment you want to hear.
On articles, use either the article play button or the floating player. Keep the source page visible.
Use a quiet sentence highlight and a stronger current-word highlight. Support
clicking a sentence during reading, jumping between paragraphs, following the
page automatically, pausing, and resuming from the same place.

## UI decisions

- Keep the default in-page controls as a slim dark rail on the right edge, following
  the original extension presentation. Do not replace it with an always-open player
  card, page title, branded header or crowded horizontal button row.
- Expand Listen, Voices and Saved only when the user opens the rail controls.
  Connection settings and status messages stay out of the way until needed.
- Inline play buttons scope reading to a single X post, Substack Note, comment or
  article. A feed does not automatically read every post, author and engagement count.
- If a page blocks the embedded player, use the sidebar or reusable floating
  window fallback. Keep the original source tab explicit.
- Small, fixed-size Play/Pause icons with no enlarging animation or oversized
  colored circle. Keep only Play, speed and Controls on the collapsed rail; voice,
  Stop and paragraph navigation belong in the expanded controls.
- Use short, functional labels. No taglines, motivational copy or decorative
  introductory headings in the reader.
- Hover previews the destination sentence on the original page. Clicking starts
  at that sentence, including in another post. Hover alone never changes audio.
  Preserve links, text selection, drag and modified clicks.
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

## Mac companion

The Mac app is a parallel native project with its speech runtime and browser
extension bundled for installation without developer tools or the source project.
It is the home for one-time onboarding, service controls, pasted-text listening,
voice previews, model downloads and storage inventory, and guided Chrome setup.
Bella remains the default. Voice previews preserve pasted source text. Browser
reading and original-page highlights remain in the extension; the Mac app’s
listening screen highlights its own current passage using the same model timings.

Handle first-run voice downloads or migration inside the app. Keep user data in
macOS Application Support and keep ordinary use free of Terminal windows. Show runtime details only in setup,
storage and diagnostics. Model storage must come from real files, with shared
voice assets counted once. Track other model folders only when selected by the
user, and distinguish inventory from supported playback. Chrome extension
installation remains an explicit user action, guided from the app.

## Later exploration

Summaries, chat, OCR, other languages and mobile support remain outside this
implementation. Image-only posts need actual OCR work; never imply their text
has been extracted when only the surrounding post text is available.
