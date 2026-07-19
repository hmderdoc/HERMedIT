# Draft design

This is a direction to review, not a frozen specification.

## Product statement

HERMedIT is a canvas-first BBS message editor in which prose behaves like
prose and CP437 artwork behaves like fixed artwork. Keyboard and mouse are equal
input paths. The UI exposes only the controls relevant to the current editing
intent and produces a Synchronet-compliant message without sacrificing a richer
native working document.

## Design invariants

1. `Text`, `Draw`, and `Select` are tools/modes. `Mouse` and `keyboard` are input
   sources, never mutually exclusive modes.
2. Text insertion/deletion/reflow changes the active text flow, not fixed art.
3. Draw commands operate on addressed cells and may overwrite the visible
   composition; their precise interaction with underlying text remains an
   explicit policy, not an accident of serialization.
4. A flattened message/ANSI/BIN export is not the editable source of truth.
5. Every mouse command has a discoverable keyboard equivalent.
6. The canvas receives most of an 80x24 screen. Palettes and help are contextual.
7. Host APIs and encodings terminate at adapters/codecs; the document model does
   not contain Synchronet globals, ANSI escape strings, or drop-file paths.
8. All mutations are commands so undo/redo and deterministic tests are possible.

## Conceptual architecture

```text
SynchronetHostAdapter
  -> MessageSession + TerminalCapabilities
  -> InputAdapter  -> normalized key/mouse/resize events
  -> ScreenRenderer

EditorController
  -> command/keymap dispatch
  -> active tool and selection
  -> layout/view state
  -> undo/redo history

Document
  -> fixed art cells/layers
  -> text flows, regions, and style spans
  -> metadata and target profile

Codecs
  -> Synchronet Ctrl-A message (CP437 or UTF-8 transport)
  -> native project format
  -> ANSI/SAUCE and BIN (later slices)
```

The controller and model should be runnable headlessly in tests. Rendering is a
projection of state, not the owner of state.

## Proposed host boundary

Names are illustrative; the important point is the small boundary.

```text
EditorHost
  openSession() -> MessageSession
  readInput(timeout) -> InputEvent
  render(patches)
  terminalCapabilities() -> { cols, rows, utf8, ansi, mouse }
  restoreTerminal()

MessageSession
  bodySource
  quoteSource
  subject / to / from / context
  encoding: CP437 | UTF8
  limits and read-only fields
  save({ bodyBytes, subject, editorDetails })
  abort()
```

`SynchronetHostAdapter` implements this from `argv[0]`, node drop files, runtime
globals, mouse reporting, `RESULT.ED`, and process return status. A future Mystic
adapter would populate the same conceptual session from Mystic's editor buffers
without pretending the two host protocols are identical.

## Document model

### Why a plain cell grid is insufficient

Cells can describe a rendered screen but not why characters occupy it. Reflow
requires a logical sequence, paragraph boundaries, region geometry, and style
spans. Merely tagging each cell `typed` or `drawn` loses that information as soon
as lines wrap or a region is resized.

### Recommended model

```text
Document
  schemaVersion
  canvas { cols, rows, defaultAttr, font, iceColors }
  artLayers[]
    id, name, visible
    sparse cells or row runs: { x, y, cp437, attr }
  textFlows[]
    id, region, content, paragraphs, styleSpans
    wrap/overflow/alignment policy
    z-order or obstacle policy
  metadata
    target profile, subject snapshot, timestamps
```

For the first slice, one fixed art layer and one or more rectangular text flows
are enough. Sparse rows/RLE keep the project small; an in-memory dense composite
cache can keep painting fast.

Prose content should be Unicode internally. Fixed art cells should retain a
CP437 glyph number plus a normalized 8-bit-style textmode attribute. Mapping
Unicode prose to the selected BBS/file target happens at export and can report
unrepresentable characters before data is lost.

### Text flow and art interaction

Proposed starting behavior:

- entering Text over an existing text flow activates it;
- entering Text in an empty area creates a visible rectangular flow region;
- the initial region can be inferred from nearby fixed borders, but inference
  must be shown and adjustable, never invisible magic;
- insert/delete, arrows, word movement, paragraph breaks, and wrapping operate
  on that flow's logical content;
- fixed art is not shifted by text editing;
- text lays out only within its region and reports overflow;
- Select can convert a fixed-cell selection into a text flow explicitly;
- imported ANSI begins as fixed art unless a native project supplies semantics.

One interaction needs a prototype decision: when Draw paints a cell currently
occupied by flowed text, should it (a) create a fixed obstacle and reflow the
text, (b) destructively remove the corresponding text character, or (c) create
an explicit front-layer override? The safest first prototype is (a), with a
separate **Flatten selection** command for destructive conversion. It preserves
content and still lets the drawing own that visible cell, but it must be tested
for predictability.

### Native project format

Use a versioned, human-inspectable format initially, likely JSON:

```json
{
  "schemaVersion": 1,
  "canvas": { "cols": 80, "rows": 25, "font": "CP437", "iceColors": false },
  "artLayers": [],
  "textFlows": [],
  "metadata": { "target": "synchronet-message" }
}
```

The real schema should be created from tested model types rather than designed
solely in prose. It needs atomic write/replace, size limits, migration hooks, and
unknown-field tolerance. It should not be embedded in the posted message.

## Editing tools

### Text

- click or keyboard-navigate to activate/create a flow;
- caret, selection, insert/overwrite, delete/backspace;
- word/line/paragraph navigation and page scrolling;
- hard paragraph breaks versus display wraps;
- style spans mapped to Synchronet-safe colors on message export;
- undo/redo and visible overflow;
- optional region resize/move through Select.

### Draw

- pencil/paint with current CP437 glyph and attribute;
- erase, eyedropper, line, rectangle, fill;
- press/drag/release with mouse; keyboard anchor/extend/commit equivalents;
- recent glyphs and colors before the full palette;
- no text-editor insertion or automatic line shifting.

### Select

- rectangular block selection;
- move/copy/cut/erase/flip operations as scope permits;
- convert fixed cells to text flow;
- flatten a flow/selection to fixed art;
- set or resize a text-flow region.

The first implementation can ship pencil, erase, eyedropper, and rectangular
selection before line/fill/flip. The architecture should not make later tools
special cases.

## UI direction

### Default 80x24 layout

```text
row 1       [Text] Draw Select | subject/context | Save  Help
rows 2-23   canvas/viewport (context overlays appear here temporarily)
row 24      caret, width/overflow, style/tool, concise keys or status
```

This is intentionally canvas-first. It replaces permanent palette and glyph
panes with a context strip or temporary overlay:

- Text: insert/overwrite, wrap region, style, and overflow status;
- Draw: current glyph/fg/bg, recent choices, and compact tool name;
- Select: selection bounds and available block operation;
- Quote: temporary drawer/modal with preview and insertion controls;
- full glyph/color chooser: modal or popover, filterable by useful groups;
- Help: mode-aware overlay, not another permanent pane.

Clickable controls need visible brackets/highlights, generous contiguous target
regions, and focus feedback. Direct coordinate hit-testing should cover the
canvas and the small chrome. Keyboard shortcuts remain displayed and active
while mouse reporting is enabled.

### Width behavior

- A Synchronet message profile on an 80-column terminal presents a 79-column
  safe boundary.
- The status row shows `col`, flow width, and overflow rather than silently
  wrapping fixed art.
- An art document/export can explicitly be 80 columns or use SAUCE dimensions.
- On smaller terminals, pan the document and reduce chrome; do not reinterpret
  the document width as viewport width.

## Rendering and performance

- Maintain a composited cell cache for the current viewport.
- Diff the new cache against the last rendered cache and output runs/cells that
  actually changed.
- Caret and selection are view overlays and should not mutate document cells.
- A mouse event maps to a cell by subtraction and viewport offset in O(1).
- Re-layout only affected text flows after a command; repaint only their old/new
  dirty rectangles plus chrome that changed.
- Avoid clearing/re-registering thousands of hotspots.
- Batch terminal writes where Synchronet's console API permits it.

Performance acceptance should be measured over a remote-like connection, not
only a local console. Correct incremental rendering matters more than an
elaborate widget hierarchy.

## Codecs and targets

### Synchronet message target (first)

- logical paragraphs and hard CRs -> CRLF body;
- safe style spans -> Ctrl-A attributes;
- explicit CP437 or UTF-8 byte encoding;
- no cursor-positioning ANSI in the posted body;
- subject returned through `RESULT.ED`;
- safe width defaults to terminal columns minus one.

### Native project target (first)

- preserves layers, flows, regions, styles, metadata, and future migrations;
- used for draft/reopen, recovery, and semantic editing;
- atomic and bounded.

### ANSI/SAUCE and BIN targets (later)

- flatten the composite intentionally;
- ANSI emits SGR and appropriate line/cursor behavior plus optional SAUCE;
- BIN emits character/attribute pairs and requires explicit dimensions/metadata;
- warn when target constraints lose semantics, Unicode, blink/iCE state, or
  dimensions.

## Decisions to review before implementation

1. Is text-region creation explicit by drag, inferred from borders, or both?
   Draft answer: both, with visible confirmation.
2. What does Draw-over-text do? Draft answer: create a fixed obstacle and reflow;
   offer explicit flatten/destructive commands.
3. Where are native project drafts stored and how are stale/disconnected drafts
   recovered?
4. Should v1 accept only the configured UTF-8 Synchronet profile, or support
   CP437 and UTF-8 from its first integration test?
5. Is standalone ANSI/BIN editing part of v1 or a second target after message
   posting is correct? Draft answer: second target; native project comes first.
6. What minimum terminal size should the board require? The reference SlyEdit
   requires ANSI and 80 columns; a row minimum should be tested rather than
   guessed.
