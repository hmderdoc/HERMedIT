# Gated plan

The requested cycle is **Research -> Design -> Plan -> Delegate -> Deliver**.
This file deliberately uses review gates so a future session can stop without
losing its place.

## Stage 1: Research

**Status:** checkpoint complete

Completed evidence:

- traced Synchronet's real external-editor lifecycle and metadata formats;
- compared FSEditor and SlyEdit behavior/configuration;
- separated CP437 glyphs, terminal display, message transport, Ctrl-A, and ANSI;
- assessed resource-editor model, UI, hotspot behavior, formats, and tests;
- found Synchronet's direct mouse parser and a coordinate-hit-testing example;
- reviewed Mystic's documented MPL/editor integration shape;
- reviewed SAUCE and representative textmode editor features;
- established the 79-column message-safe versus 80-column art distinction.

**Gate:** review `RESEARCH.md` and `SYNCHRONET_CONTRACT.md`. Resolve any local
board configuration that contradicts the checked-in reference configuration.

## Stage 2: Design

**Status:** draft; not approved

### 2.1 Headless semantic spike

Build only enough model code and tests to prove:

- a fixed CP437 border remains unchanged while prose inside it inserts, deletes,
  and rewraps;
- multiple hard paragraphs survive region resize;
- a style span follows its text through reflow;
- art added over a laid-out text cell follows the chosen interaction policy;
- undo/redo reverses both text and art commands;
- flattening produces deterministic cells;
- native save/reload retains all semantics.

Do not render a full UI during this spike. Use small fixtures that make failures
obvious.

### 2.2 Contract/codec spike

Build pure parsers/encoders and fixtures for:

- `EDITOR.INF`, `MSGINF`, and `RESULT.ED`;
- CP437 and UTF-8 message bodies;
- valid/minimal Synchronet Ctrl-A attributes;
- CRLF, hard paragraphs, and soft-wrap behavior;
- malformed input and unsupported glyph reporting.

### 2.3 Interaction prototype

Prototype one 80x24 screen with:

- top mode bar, large canvas, bottom status;
- Text/Draw/Select switching by key and mouse;
- direct mouse click/drag/release events;
- contextual glyph/color overlay;
- text-region activation and visible boundaries;
- resize behavior and keyboard-only parity.

This prototype may use fake session data. Its purpose is to validate concepts and
latency, not post messages.

**Gate:** choose text-region creation, Draw-over-text behavior, native draft
storage, v1 encoding scope, and minimum terminal geometry. Update `DESIGN.md`
with the decisions before integration.

## Stage 3: Plan refinement

**Status:** initial plan exists here; estimates and module names wait for the
spikes

After the design gate:

1. freeze v1 acceptance cases;
2. define module boundaries from the working spikes;
3. decide whether code lives directly under `xtrn/future_edit` or is built from
   TypeScript/source elsewhere into a Synchronet-compatible bundle;
4. identify reusable `fshell_ts` primitives by contract, not file copying;
5. write a test/run command and local fixture layout;
6. document installation and rollback for this board;
7. split independent work units for delegation.

## Stage 4: Delegate

**Status:** not started

Delegation should happen only after the design gate, because the current hardest
questions change module contracts. Likely bounded work units are:

- semantic document model, layout, commands, and native project codec;
- Synchronet drop-file/message/encoding adapter and fixture harness;
- normalized keyboard/mouse input and terminal-state restoration;
- composited renderer and diff engine;
- 80x24 controller/layout and contextual overlays;
- compatibility/UX test pass against FSEditor/SlyEdit behaviors;
- later ANSI/SAUCE/BIN target codecs.

Each unit should own tests and avoid editing the same files where practical. One
integrator remains responsible for invariants across model, renderer, and host
adapter.

## Stage 5: Deliver

**Status:** not started

Suggested delivery slices follow usable vertical behavior.

### Slice A: conventional message editor

- Synchronet session/drop files;
- subject, source/draft, quotes;
- paragraph editing, wrap, insert/overwrite, navigation;
- save/abort, dirty confirmation, terminal cleanup;
- CP437 and UTF-8 fixture coverage;
- keyboard-only UI.

This creates a safe fallback before art behavior is introduced.

### Slice B: fixed art and direct mouse

- CP437 pencil/erase/eyedropper;
- foreground/background colors;
- direct press/drag/release input;
- art layer composited with text;
- compact contextual picker;
- undo/redo across both tool types.

### Slice C: semantic text regions

- create/activate/resize text regions;
- type inside a CP437 border and reflow only prose;
- visible overflow and obstacle behavior;
- convert/flatten selection commands;
- native project save/reopen.

This is the central proof of the product idea and may be merged with Slice B if
the headless spike makes it low-risk.

### Slice D: selection and art tools

- rectangular selection, move/copy/cut;
- line, rectangle, fill;
- keyboard equivalents and mode-aware help;
- incremental-render latency tests.

### Slice E: standalone art targets

- ANSI import/export with SAUCE dimensions/flags;
- BIN import/export with explicit dimensions;
- target-loss warnings and 80-column art profiles;
- conservative imported-art semantics.

### Slice F: optional Mystic adapter

- validate against an actual Mystic version/installation;
- define an MPL wrapper or door/file bridge;
- map Mystic session metadata and buffer APIs into `MessageSession`;
- run the same headless document and codec tests plus Mystic integration cases.

This is intentionally optional. It should not delay a board-specific editor.

## Definition of done for the first board deployment

- A user can write and reply to messages using keyboard alone.
- A mouse-capable terminal can place the caret, choose modes/controls, drag a
  drawing stroke, and select without per-cell hotspots.
- A CP437 box does not shift when text inside is inserted or rewrapped.
- Save produces a message Synchronet accepts with the intended subject, colors,
  charset, line endings, and column metadata.
- Abort, exception, and disconnect do not post a false success or leave mouse/
  terminal state enabled.
- Draft/native reopen retains the typed-versus-art distinction.
- The 79-column message-safe boundary and 80-column art target are explicit.
- Undo/redo covers text and drawing changes.
- Dirty exit asks before losing work.
- Automated fixtures cover both encodings and all supported drop files.
- Installation, configuration, backup/rollback, and known limitations are
  documented for the board.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Text/art rules feel surprising | Prove them headlessly, then test a tiny interaction prototype before full UI work |
| UTF-8 looks correct but saved bytes are wrong | Byte-exact fixtures and explicit codecs; follow SlyEdit's boundary discipline |
| Remote terminal feels slow | Direct mouse events, dirty rectangles, batched output, and latency-oriented tests |
| ANSI import falsely classifies prose | Import as fixed art; require explicit conversion |
| Native draft is lost while posted message survives | Atomic project writes, recovery path, and separate flattened message export |
| Host-specific globals leak everywhere | Narrow `EditorHost` and `MessageSession` adapters |
| Feature growth recreates the resource editor's crowded UI | Canvas-first layout and contextual controls as an invariant |
| Supporting Mystic distorts v1 | Synchronet first; Mystic only through a verified adapter later |

## Explicit non-goals for the first slice

- universal BBS plug-and-play compatibility;
- every SlyEdit feature;
- arbitrary ANSI terminal-control sequences inside posted messages;
- perfect semantic recovery from existing ANSI art;
- collaborative editing or a network service;
- a permanent on-screen 256-glyph palette;
- pixel graphics or fonts outside the textmode target model.
