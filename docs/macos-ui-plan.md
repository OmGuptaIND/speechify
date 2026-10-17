# Mac app UI replan

Status: proposal, not yet implemented. Scope: `macos/Sources/SpeechifyDesktop/`.
Nothing here changes the reader runtime, the extension, or the resource budget.

## 1. What is wrong today

The app works, but it reads like a generated landing page wrapped around a
utility. Specific problems, all visible in the current source:

- **Marketing copy on every screen.** Each page opens with an uppercase eyebrow,
  a rounded display title and a subtitle ("Made for your Mac / Your reading, all
  here." … "Just the essentials / Make yourself at home."). The sidebar ends with
  the tagline "A little more listening. A little less effort." The error alert is
  titled "Let's get you reading". `docs/product.md` already forbids taglines and
  decorative headings in the reader; the Mac app ignores that rule.
- **Home is a brochure.** It restates status that the sidebar and header already
  show, adds three stat cards that duplicate Voice library, and a "Light on your
  Mac" card that exists only to carry the Stop button.
- **Flows are duplicated instead of designed.** "Start reader" appears in five
  places, "Prepare this Mac" in four, the Chrome guide twice (Browser page and
  onboarding step 3), and the resource table in Settings repeats the Home card.
  Voice selection lives in two places with different controls (Picker on Listen,
  rows on Voice library).
- **Status is shown three times at once.** Sidebar pill, header pill and the
  Browser page pills all render the same booleans with different wording
  ("On this Mac" vs "Ready · engine resting" vs "Reader paired and open").
- **Everything is a card.** Panels inside panels, each with 24pt padding and a
  20pt radius, including a single toggle. Nothing uses native lists, tables,
  forms or the toolbar, so the app does not feel like a Mac app.
- **The player is buried.** Transport controls sit inside a card below a text
  editor, Paste is a button, the speed slider is 105pt wide, and only the current
  240-character section is visible while playing. Preview from Voice library
  navigates away to Listen.
- **Operation progress and logs are appended to whatever page is open**, so the
  Listen page can grow a "Preparing this Mac" card and a monospace log.
- **Onboarding is a 740×735 sheet** with a quote card ("Take a breath…"), a
  feature trio, and a repeated setup checklist, sitting over an app that is
  itself empty until setup finishes.

## 2. Design language

One rule: the Mac app should look like a first-party reading utility
(Books, Podcasts, Voice Memos), sharing colours with the extension, with no
marketing surface anywhere.

### Tokens (shared with `extension/src/panel/styles.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#FFFFFF` | `#252629` | reading surface, sheets |
| `surface` | `#FCFBF9` | `#1D1E20` | window content background |
| `soft` | `#F3F1EE` | `#292A2E` | hover, secondary fills |
| `border` | `#EAE8E5` | `#34353A` | hairlines, 1pt |
| `accent` | `#6550C6` | `#A99AEA` | one accent, controls and current word |
| `tint` | `#F1EDFC` | `#302B43` | selection and current-section wash |
| `error` | `#974A2E` on `#FCEFE9` | `#F4B99D` on `#3B2925` | inline errors |

Keep `readerPurple` as the accent; drop `readerLilac` in favour of `tint`.
Success states use the system green dot only, never a green-washed banner.

### Typography

| Role | Font | Size / leading |
| --- | --- | --- |
| Window title and toolbar | system | native |
| Section heading | system semibold | 15 / 20 |
| Body and controls | system | 13 / 18 |
| Caption and footnotes | system | 11 / 15 |
| Reading passage | system serif (`.serif`) | 19 / 30, max measure 68 characters |
| Numbers (sizes, time, speed) | system monospaced digits | same as body |

No rounded design face except nowhere. No letter-spaced uppercase labels.

### Layout

- Content column max 720pt, 28pt side padding, 20pt vertical rhythm.
- Native `Form` with `.grouped` style for settings-type content, native `List`
  with `.inset` style for voices and folders, `Table` for files.
- Radii: 10pt for grouped rows and fields, 14pt only for the reading surface.
  No stroked 20pt cards.
- Dividers are hairlines in `border`. No drop shadows in light mode.
- Standard title bar and unified toolbar. Sidebar uses `List(.sidebar)` for
  vibrancy, keyboard navigation and ⌘1–⌘4.
- Respect Reduce Motion and Increase Contrast. Word highlight animates nothing.

### Copy rules

- Sentence case everywhere. Page titles are nouns: Listen, Voices, Browser,
  Settings.
- Buttons are verbs: Start, Stop, Download, Copy, Preview, Choose folder.
- No eyebrows, taglines, quotes, exclamation marks, or second-person
  reassurance ("you don't have to…"). No "your Mac", "right on your Mac".
- One sentence of help per control, as a caption below it, only when the
  control is not self-explanatory.
- Error text: what happened, then one action. Never "we", never apologise.
- Status vocabulary, used identically everywhere:

| State | Label |
| --- | --- |
| reader running, worker loaded | Ready |
| reader running, worker unloaded | Ready, engine resting |
| reader generating | Preparing speech |
| starting / stopping | Starting… / Stopping… |
| not running | Stopped |
| running but started elsewhere | Running outside this app |
| extension seen in last 75 s | Chrome connected |
| otherwise | Chrome not connected |

## 3. Information architecture

```
Window: Speechify
├─ Sidebar
│  ├─ Listen        ⌘1   (default destination)
│  ├─ Voices        ⌘2
│  ├─ Browser       ⌘3
│  └─ (footer) ● Ready            [Stop ▾]
├─ Toolbar: page title · (Listen only) voice + speed menus
├─ Content
└─ Bottom bar (Listen only): transport
Settings window (⌘,): General · Storage · Advanced
First-run setup: replaces window content until complete
```

Changes from today:

- **Home is removed.** Its three real functions move: reader status and
  Start/Stop to the sidebar footer, "go listen" becomes the default page, and
  "Manage here" becomes a menu item in the footer control and the Reader menu.
- **Voice library becomes Voices.** Storage inventory stays on the page but as a
  collapsed section below the voice list, with the per-file table on demand.
- **Settings leaves the sidebar** and becomes a standard ⌘, window with three
  tabs. The sidebar keeps three everyday destinations.
- **Onboarding becomes first-run setup**, rendered in the window itself. The
  sheet, quote card and feature list are gone. "Set up again…" lives in Help.
- **Operation progress, notices and logs** get one home each (section 9) rather
  than being appended to every page.

## 4. Window shell and sidebar

```
┌───────────────┬──────────────────────────────────────────────────┐
│ ○ Listen      │ Listen                      Bella ▾   1.0× ▾      │
│   Voices      ├──────────────────────────────────────────────────┤
│   Browser     │                                                  │
│               │                 (page content)                   │
│               │                                                  │
│ ● Ready       ├──────────────────────────────────────────────────┤
│   [Stop  ▾]   │  ⏮   ▶   ⏭    ───────●──────────  0:42 / 1:58    │
└───────────────┴──────────────────────────────────────────────────┘
```

- Sidebar: `List` with `.sidebar` style, SF Symbols `headphones`,
  `person.wave.2`, `globe`. No wordmark block; the app icon lives in the Dock
  and About.
- Footer: status dot and label from the table above, then a small split button.
  Primary action depends on state: Start (stopped), Stop (owned), Manage here
  (running outside). The menu holds the other actions plus "Open log".
- Toolbar: page title via `navigationTitle`. On Listen only, trailing items are a
  voice menu (Bella / Heart / Nicole, radio style) and a speed menu
  (0.8× to 2.5× presets plus a slider in the popover). These replace the inline
  Picker and the 105pt slider.
- One transient notice area: a 13pt line that slides into the bottom bar area
  for 4 seconds, then disappears. Nothing green. Nothing dismissable.
- Window: default 1040×720, minimum 860×600. Standard title bar; remove
  `.hiddenTitleBar`.
- The error alert keeps its native form but gets a neutral title taken from
  the failing action ("Reader couldn't start") and a body with one next step.

## 5. Listen

The only page most people use after setup. It should look like a page from
Books with a transport under it, not a form.

```
│ Listen                                     Bella ▾   1.0× ▾      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  Paste or type something to listen to.                   │   │  empty state
│   │                                                          │   │
│   │  ⌘V to paste · Read a webpage with the Chrome extension  │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  ⏮   ▶   ⏭    ───────────────────────────   Part 1 of 1         │
```

- **One surface for editing and listening.** The reading surface is a `paper`
  rectangle, 14pt radius, 32pt inner padding, serif 19/30, max measure 68
  characters, centred in the content column. Before playback it is an editor
  with a placeholder; during playback the same rectangle renders the whole
  text, not just the current section, with:
  - current section washed in `tint`,
  - current word in `accent` background at 22% with primary text colour,
  - other sections in secondary colour at full size.
  Clicking a section while playing jumps to it (`Playback.move` already
  supports index changes). Clicking while paused or finished does the same.
- **No Paste button.** ⌘V works in the editor. The empty-state caption mentions
  it. The 50,000-character limit is enforced with a footnote counter that only
  appears above 45,000 characters.
- **Transport bar** is pinned to the bottom of the window, 56pt tall, `surface`
  background, hairline on top. Left: previous, play/pause, next, fixed 22pt
  symbols with no scaling animation. Centre: section scrubber showing elapsed
  and duration for the current section, monospaced digits. Right: "Part 3 of
  12" caption. Stop lives in the Reader menu and as ⌘. while playing; a visible
  Stop control is unnecessary because Pause keeps the place and editing the
  text clears the session.
- **Preparing state**: play button shows a small indeterminate spinner in place
  of the symbol; no "Preparing…" text in the button.
- **Offline state**: the transport stays visible but disabled, and a single line
  appears above it: "Reader is stopped." with a Start button. No alert.
- **Error state**: playback errors show as a one-line `error`-styled bar above
  the transport with Retry. The alert is reserved for start failures.
- **Finished state**: the whole text returns to primary colour, play button
  becomes Replay.
- **Keyboard**: Space toggles play/pause when the editor is not first responder,
  ⌘← / ⌘→ move sections, ⌘. stops.
- Remove "Audio stays in memory." and "Highlights follow the model's audio
  timings." Neither helps a listener.

Copy

| Current | New |
| --- | --- |
| A moment to listen / Let Bella take it from here. | (none; title is Listen) |
| Something you've been meaning to read… | Paste or type something to listen to. |
| Section 3 of 12 · Highlights follow… | Part 3 of 12 |
| Start your local reader to listen. | Reader is stopped. |
| Choose a passage of 50,000 characters or fewer. | Text is limited to 50,000 characters. |

## 6. Voices

```
│ Voices                                                           │
├──────────────────────────────────────────────────────────────────┤
│  ● Bella        Default                               ▶ Preview  │
│  ○ Heart                                              ▶ Preview  │
│  ○ Nicole                                             ▶ Preview  │
│  Voices share one 142 MB Kokoro download. Changing voice adds    │
│  no download.                                                    │
│                                                                  │
│  Storage                                              142.3 MB   │
│  ▸ Speechify downloads            2 files   142.3 MB   ✓ Verified │
│  ▸ ~/Models/other-tts              7 files   1.2 GB    Read only  │
│  [Add folder…]  [Verify files]  [Show in Finder]                 │
```

- Voice list is a native inset `List` with radio selection. Selecting a row is
  the only way to choose a voice; the toolbar menu on Listen mirrors it.
  Remove "Use voice" buttons and the "Selected" caption.
- Preview plays a fixed neutral sentence inline on this page using a separate
  lightweight player so a paused Listen session is untouched. The row's
  Preview control becomes a stop control while playing. No navigation to
  Listen. Preview text: "This is Bella. Reading a short sample at normal
  speed." Same pattern for the other two names.
- Drop the invented descriptors ("warm and clear", "Another voice, same shared
  download"). Show "Default" as a badge on Bella only.
- Storage is a second grouped section. Summary row shows total measured size.
  Each folder is a disclosure row; expanding shows a `Table` with name, detail,
  size and a reveal button, paginated at 100 as today. Tracked folders show a
  trailing "Remove" in the row's context menu and a minus button, not a
  standalone "Untrack" button.
- The warning text about allocation, APFS clones and symlinks moves to a single
  footnote under the section, shortened to one sentence: "Sizes are measured
  from files; shared and cloned files may be counted once."
- Download/verify state replaces the StatusPill: a trailing "Verified" caption
  or a "Download" button on the Speechify downloads row.

## 7. Browser

```
│ Browser                                       ● Chrome connected  │
├──────────────────────────────────────────────────────────────────┤
│  ✓  Reader running                                               │
│  ✓  Extension prepared                                           │
│  ○  Add to Chrome                                                │
│       Open chrome://extensions, turn on Developer mode, choose   │
│       Load unpacked, press ⌘⇧G and paste the folder path.        │
│       Folder   ~/Library/…/BrowserExtension          [Copy]      │
│                                          [Open Chrome extensions]│
│  ○  Connect                                                      │
│       Open any article, click Speechify, paste the key, Connect. │
│       Key     ••••••••••••••••••                      [Copy]      │
│                                                                  │
│  Chrome reports in only while its reader panel is open; the      │
│  status resets 75 seconds after it closes.                       │
```

- One vertical checklist that reflects real state. Done steps collapse to a
  single line with a check. The first incomplete step is expanded and carries
  exactly one primary action.
- Folder and key render as labelled credential rows with Copy buttons. The key
  is masked; Copy still copies the real value.
- Remove the second panel ("One last click belongs to you") and the fourth
  step ("Press Play. Keep your place."). The 75-second note becomes a footnote.
- The "Check" button goes; the page polls through the existing 4-second
  refresh and the toolbar status reflects it.
- If Chrome is not installed, the Add to Chrome step shows that inline with a
  link, instead of an alert.

## 8. Settings window (⌘,)

Standard `Settings` scene, 520pt wide, three tabs.

**General**
- Toggle: Start the reader when Speechify opens.
- Caption: The reader stops when Speechify quits. No login item is installed.
- Default voice (menu) and default speed (slider with value). These are the
  same preferences the Listen toolbar edits.

**Storage**
- Data folder path with Show in Finder.
- Import previous setup… with its one-sentence caption.
- Caption: Removing the app keeps this folder.

**Advanced**
- Repair installation (today's Prepare / repair this Mac).
- Open service log.
- Disclosure "Resource limits" containing the current LabeledContent table,
  trimmed to one line each. This is the only place the numbers appear.
- Port, read-only, for support.

Remove "Show onboarding" from Settings; it becomes Help › Set Up Again….

## 9. Global states

- **Long operations** (download, verify, migrate, manage here): the sidebar
  footer swaps to a progress row: spinner or determinate bar, operation label,
  and a "Details" button that opens a sheet with the log. Pages do not grow
  cards. If the backend download prints byte progress, show a determinate bar;
  otherwise indeterminate with the last log line as caption.
- **Notices**: single transient line as described in section 4. Reword
  current notices to one clause each ("Connection key copied.",
  "Extension folder copied.", "Voice files verified.").
- **Errors**: inline where the action lives when possible; alert only when the
  app cannot continue (missing runtime, reader failed to start). Alert titles
  name the failure; bodies give one step.
- **Quit while busy**: keep the current block, retitle "Setup is still running"
  with body "Wait for it to finish, then quit."

## 10. First-run setup

Rendered in the main window content area while `onboardingComplete` is false.
Sidebar is hidden until setup finishes. Four short screens, each one heading,
one paragraph at most, one primary button.

1. **Welcome**: "Speechify reads text aloud with a voice that runs on this
   Mac." Button: Continue. Secondary: Import previous setup….
2. **Download voices**: "Bella, Heart and Nicole share one 142 MB download.
   Speech works offline afterwards." Determinate or indeterminate progress,
   last log line as caption, Retry on failure. Advances automatically when
   verified and the reader has started.
3. **Add to Chrome**: the same checklist component as the Browser page,
   steps 3 and 4 only. Button: Continue. Secondary: Skip for now.
4. **Done**: "Ready." One button: Start listening, which lands on Listen with
   the editor focused. No sample quote, no toggle; auto-start stays on by
   default and is adjustable in Settings.

## 11. Menus and shortcuts

- Reader menu: Start, Stop, Manage here, Open log. Remove Show onboarding.
- View menu additions: Listen ⌘1, Voices ⌘2, Browser ⌘3.
- Playback: Space play/pause, ⌘← ⌘→ sections, ⌘. stop.
- Help: Set Up Again…, Browser setup guide.

## 12. Implementation order

Each step is independently shippable and keeps `make check` green.

1. **Tokens and components** (`Components.swift`): replace `readerLilac` with
   the token set above, delete `PageHeading`, `Stat` and `StepRow`, add
   `SectionHeader`, `CredentialRow`, `ChecklistStep`, `StatusLabel`.
2. **Shell** (`ContentView.swift`, `SpeechifyApp.swift`, `AppModel.swift`):
   remove `.home` and `.settings` from `Destination`, sidebar `List`, footer
   status control, standard title bar, toolbar titles, notice line, operation
   row, log sheet, keyboard shortcuts.
3. **Settings scene** (`SettingsView.swift`, new): three tabs; delete the old
   `SettingsView`.
4. **Listen** (`ListenView.swift`, new file split from `ContentView.swift`;
   `Playback.swift`): full-text rendering with section and word highlight,
   click-to-jump, bottom transport, toolbar menus, offline and error bars.
   Playback gains a separate preview player so Voices does not disturb a
   session.
5. **Voices** (`VoicesView.swift`): radio list, inline preview, storage section
   with disclosure rows and file table.
6. **Browser** (`BrowserView.swift`): checklist component, credential rows,
   footnote; reuse in setup.
7. **First-run setup** (`SetupViews.swift`): replace the sheet with the in-window
   flow.
8. **Docs**: update `docs/macos-app.md` screenshots and the install section;
   add the status vocabulary to `docs/product.md`.

Tests: `DesktopCoreTests` are unaffected. Add a small test for the status
label mapping and for section-click index mapping once Listen renders full text.
Run `make check` and the real-model `scripts/test-standalone.py` after step 4
because preview and transport touch the inference path.

## 13. Acceptance

- No page shows an eyebrow, tagline, quote or decorative heading.
- Reader status appears in exactly one place in the main window.
- Start, Stop, Download and Chrome setup each have one home.
- Listen shows the whole text with section and word highlights, and the place
  survives pause, speed change and section jumps.
- Voice preview never clears or restarts a Listen session.
- Every long operation shows progress in the sidebar footer, never on a page.
- Light and dark mode both match the extension's colours.
- Reduce Motion produces no animation beyond system transitions.

## 14. Decisions to confirm

1. Remove Home and make Listen the default page (recommended).
2. Move Settings to a ⌘, window instead of a sidebar item (recommended).
3. Render the full text on Listen with the current section washed, rather than
   only the current 240-character section (recommended; it is the biggest
   perceived-quality change and needs no backend work).
