# Research notes

## Scope and method

This research answers four questions:

1. What does a BBS message editor normally need to do?
2. What must a replacement editor do to satisfy Synchronet's real contract?
3. Which parts of the existing resource editor prove useful ideas, and which
   parts should not be carried forward?
4. How much of the editor can reasonably be portable to Mystic or other BBSes?

The local host implementation is treated as the source of truth. Public Mystic,
SAUCE, and textmode-editor documentation is supporting evidence, not a presumed
common API.

Research snapshot: 2026-07-17, Synchronet repository commit
`53ba5083fbfd560ceab72ac286925dbf13896a10`, and `fshell_ts` repository commit
`d32e615d21c81b46b624da185cd178dd257400dd`. Recheck the host contract if either
repository changes before implementation.

## Local source map

| Source | What it establishes |
| --- | --- |
| `/sbbs/repo/src/sbbs3/writemsg.cpp` | Host lifecycle, filenames, drop files, quote conversion/wrapping, success rules, result parsing, soft-CR processing, and stored editor metadata |
| `/sbbs/repo/src/sbbs3/sbbsdefs.h` | External-editor setting flags |
| `/sbbs/repo/src/sbbs3/scfg/scfgxtrn.c` | Settings exposed by Synchronet configuration |
| `/sbbs/repo/ctrl/xtrn.ini` | Current reference registrations for FSEditor and SlyEdit |
| `/sbbs/repo/exec/fseditor.js` | Compact Synchronet-native editor and the requested reference (the local filename is `fseditor.js`, not `fsedit.js`) |
| `/sbbs/repo/exec/SlyEdit.js` | More complete editor, including QuickBBS metadata and explicit CP437/UTF-8 output handling |
| `/sbbs/repo/exec/load/mouse_getkey.js` | Existing parser for X10 and SGR mouse reports, including motion, modifiers, press/release, and coordinates |
| `/sbbs/repo/exec/avatar_chooser.js` | Direct coordinate hit-testing and wheel handling without per-cell hotspots |
| `/sbbs/mods/fshell_ts/src/subprograms/resource_editor.ts` | Existing combined keyboard/mouse CP437 canvas UI |
| `/sbbs/mods/fshell_ts/src/subprograms/resource_canvas.ts` | Tested grid, palette, BIN, and ANSI serialization primitives |
| `/sbbs/mods/fshell_ts/test/resource_editor.test.ts` | Current editor behavior, including known legacy limitations |
| `/sbbs/mods/fshell_ts/test/resource_canvas.test.ts` | Grid/serialization/layout coverage worth retaining conceptually |

## What a BBS message editor normally includes

The exact presentation varies, but the functional baseline is stable:

- message metadata: To, From, Subject, area/context, private/anonymous state;
- a full-screen editing viewport and a status row;
- cursor, word, line, page, home/end, and paragraph navigation;
- insert/overwrite, backspace/delete, line joining, hard paragraph breaks, and
  soft word wrapping;
- quote selection/insertion when replying;
- subject editing where the host permits it;
- save/post, abort, help, and protection from accidental dirty-buffer loss;
- terminal-width awareness and a useful keyboard-only path;
- optional colors, text attributes, spell checking, macros/taglines, upload,
  drafts/recovery, and text replacement.

For this project, art editing adds:

- all 256 CP437 glyphs, foreground/background colors, and an eyedropper;
- erase, line, rectangle, fill, and block selection/move/copy operations;
- mouse press/drag/release and keyboard equivalents;
- import/export rules for ANSI/BIN and, eventually, SAUCE metadata;
- awareness of blink versus iCE colors and font/9th-column rendering;
- a semantic distinction between fixed artwork and reflowable prose.

FSEditor demonstrates the compact baseline: header fields, insert/overwrite,
wrapping, quote selection, color and graphics pickers, help, navigation, and
save/abort. SlyEdit expands this with richer configuration, dictionaries/text
replacement, taglines, additional edit modes, and more defensive encoding.

## FSEditor and SlyEdit findings

### FSEditor

`fseditor.js` is a useful contract example, not an architecture to clone.

- It receives the output path as `argv[0]`, with `INPUT.MSG` as a fallback.
- It prefers `QUOTES.TXT` as reply input and otherwise loads the passed message
  file.
- It reads `EDITOR.INF` for Subject, To, and From and removes that drop file.
- Its line objects keep text, parallel per-character attributes, and a `hardcr`
  distinction. Insert/delete can therefore rewrap soft lines without erasing
  explicit paragraph breaks.
- It wraps against `console.screen_columns - 1`.
- It writes the body in binary mode with embedded Synchronet Ctrl-A attribute
  changes and CRLF line endings.
- It writes `RESULT.ED` with status placeholder, possibly edited subject, and
  editor identification.
- It returns non-zero on abort and success on save.

The parallel text/attribute strings are sufficient for a conventional message
editor, but not for distinguishing fixed art from a text flow.

### SlyEdit

SlyEdit is the stronger compatibility reference.

- It handles both WWIV-style `EDITOR.INF` and QuickBBS-style `MSGINF`.
- `MSGINF` explicitly declares `CP437` or `UTF-8` on its eighth line.
- It explicitly encodes UTF-8 bytes when the configured session requires them,
  rather than assuming display strings and file bytes are interchangeable.
- It implements the same basic temp-file and `RESULT.ED` lifecycle with a much
  larger feature and configuration surface.

The first implementation should target one well-defined Synchronet profile,
then add compatibility variants only when tests demand them. Supporting every
legacy drop-file flavor on day one would obscure the important model work.

## Resource editor assessment

The resource editor proves that CP437 cells, colors, ANSI import, BIN output,
mouse-click painting, and a testable model can work inside the existing terminal
stack. Its `ResourceCanvasModel` and tests are valuable behavioral references.
It is not a good base for a blind port.

### Reusable ideas

- a pure bounded grid with `{ch, attr}` cells;
- cursor/view separation and `ensureCursorVisible()` behavior;
- isolated ANSI attribute composition;
- exact interleaved character/attribute BIN serialization;
- profile-specific path policy;
- incremental repaint of a changed cell;
- tests for crop/pad, resizing, viewport behavior, palettes, and codecs.

Reuse should mean extracting or reimplementing small tested primitives after
their contracts are understood. The message editor should not inherit the
resource editor's entire subprogram or screen layout.

### Problems to avoid

1. **Input device is treated as a mode.** In `mouse` mode printable keys are
   ignored; in `keyboard` mode a printable key paints one cell and advances.
   Neither mode represents the user's intent to edit prose versus draw art.
2. **The controls dominate the canvas.** At 80x24, the tested layout gives the
   canvas only 10 rows and permanently gives 4 rows to colors plus 8 to glyphs,
   in addition to header and status.
3. **Every visible cell is a hotspot.** The editor publishes up to 2,000
   one-cell regions and republishes them on viewport changes. The hotspot
   manager must clear and recreate them, which is a credible source of the
   perceived slowness and cannot support natural drag gestures well.
4. **The model is already flattened.** `{ch, attr}` records neither provenance
   nor text order/region. It cannot insert a word and reflow only prose while
   holding a CP437 border fixed.
5. **Editing basics are absent.** There is no paragraph model, undo/redo, block
   selection, text insert/delete semantics, quote workflow, or dirty-buffer
   confirmation. Escape exits immediately.
6. **The format support is deliberately narrow.** BIN has no dimension header;
   ANSI output is simple SGR-per-row output; there is no SAUCE, font, iCE/blink,
   or semantic project data.

### Mouse input finding

Synchronet already ships `mouse_getkey.js`. It enables click and release
passthrough, parses both older X10 and SGR mouse reports, and returns coordinates,
button, modifier, motion, press, and release state. `avatar_chooser.js` shows
coordinate hit-testing and wheel buttons 64/65.

The new editor should normalize this into an input event such as:

```text
KeyEvent { key, modifiers }
MouseEvent { x, y, button, phase, motion, modifiers }
ResizeEvent { cols, rows }
```

Canvas hit-testing is then arithmetic. A small number of toolbar labels may use
regions, but no cell needs its own registration. This is both faster and capable
of drag-to-draw, drag-to-select, and mouse-wheel scrolling.

## The text-versus-art problem

The requested behavior cannot be recovered reliably from a flattened ANSI
screen. Consider a CP437 box with prose inside it:

- the border consists of fixed cells;
- the prose has a logical character order, paragraphs, styles, and a wrap
  region;
- inserting in the middle should move only subsequent prose characters;
- moving up/down should follow the prose flow, not treat the whole screen as an
  undifferentiated grid;
- drawing is allowed to change the final cell composition directly.

Adding `origin: typed | drawn` to each cell helps selection and inspection, but
does not preserve enough information to reconstruct paragraphs, style spans, or
the intended wrapping rectangle. A text-flow object is required. The draft
model is in `DESIGN.md`.

Imported ANSI should be treated conservatively as fixed art. Guessing that runs
of letters are prose will fail on logos, diagrams, and deliberate spacing. A
user can explicitly convert a selection into a text region when semantic
editing is wanted.

## Character sets and color are separate boundaries

Several concepts are easy to conflate:

| Concept | Example | Required treatment |
| --- | --- | --- |
| Glyph identity | CP437 byte `0xDB` means full block | Keep a stable 0-255 glyph value in art cells |
| Runtime/display string | The JS value sent through Synchronet console APIs | Let the terminal adapter perform CP437/UTF-8 display conversion deliberately |
| Message file bytes | CP437 or actual UTF-8, according to the editor session | Encode explicitly on read/write |
| Message color | Synchronet Ctrl-A attribute codes | Message codec, validated by the host |
| ANSI file color | CSI/SGR sequences | ANSI export/import codec |
| BIN color | Attribute byte adjacent to character byte | BIN codec |
| Native semantics | Art layers, text flows, regions, style spans | Versioned project format; never inferred from exported bytes |

Synchronet's console output path understands CP437 glyph bytes and can translate
them for a UTF-8 terminal. That does not mean `File.write()` has produced UTF-8.
SlyEdit's explicit file conversion is the safer precedent.

Ctrl-A color is appropriate for Synchronet message bodies. Raw ANSI control
sequences are appropriate for ANSI artwork files. The editor should not silently
post raw cursor movement or screen-clearing sequences in a message body.

## Why 79 columns is not just a hack

The local host wraps quotes to `term->cols - 1` by default, and FSEditor wraps to
`console.screen_columns - 1`. Mystic's documented MPL editor example also uses
`WrapPos := 79`. Avoiding the physical terminal's last column prevents automatic
wrap/scroll behavior from corrupting an interactive 80-column display.

That supports a **79-column safe message viewport** on an 80-column terminal.
It does not prove that all ANSI art must be 79 columns. ANSI and binary textmode
art commonly uses an 80-column canvas, and SAUCE can declare other widths.

Recommended policy:

- message target: safe width defaults to terminal width minus one;
- ANSI/BIN art target: canvas/export width is explicit, commonly 80;
- UI: show the safe boundary and overflow state rather than destructively
  changing the document merely because the current viewport is narrow;
- posting: validate or deliberately crop/wrap according to a named target
  profile, never as a surprising save-time side effect.

## Cross-BBS feasibility

The evidence supports portability of the editor's **core**, not a universal
external-editor API.

Synchronet launches configured editors with a temp filename and node-directory
drop files. Its JavaScript programs also receive Synchronet-specific globals and
terminal services.

Mystic's public documentation exposes its internal full-screen editor to MPL
through `MsgEditor`, `MsgEditSet`, and `MsgEditGet`, with templates such as
`msg_editor.ini` and `.ans` resources. That is a different integration shape.
No evidence in this research established that Mystic consumes Synchronet's
`EDITOR.INF`/`MSGINF`/`RESULT.ED` lifecycle as a general native contract.

Therefore:

- implement `SynchronetHostAdapter` first;
- keep the document, commands, layout decisions, and codecs independent of
  Synchronet globals where practical;
- define a narrow `EditorHost`/`MessageSession` interface;
- if Mystic becomes a real target, write a Mystic wrapper around its buffer APIs
  or a door/file bridge and validate it against a running Mystic installation;
- do not constrain the local editor to the weakest hypothetical common API.

Native hooks are desirable for this board: terminal capabilities, real mouse
events, session charset, quote text, subject updates, save/abort lifecycle, and
draft handling all improve correctness. Isolation, not avoidance, is the key.

## Public references

- [Mystic 1.10 changes and MPL message-editor API](https://wiki.mysticbbs.com/doku.php?id=whats_new_110)
- [Mystic 1.12 changes, message-editor templates, drafts, and spell work](https://wiki.mysticbbs.com/doku.php?id=whats_new_112)
- [Mystic text-editor configuration](https://wiki.mysticbbs.com/doku.php?id=config_text_editor)
- [Mystic spell checker](https://wiki.mysticbbs.com/doku.php?id=spell_checker)
- [ACiD SAUCE specification, revision 5](https://www.acid.org/info/sauce/sauce.htm)
- [Moebius textmode editor](https://blocktronics.github.io/moebius/)
- [Sixteen Colors browser textmode editor](https://sixteencolors.github.io/js-textmode-editor/)
- [libansilove supported textmode formats](https://github.com/ansilove/libansilove)

## Research conclusions

- The host contract and encoding boundary are understood well enough to design
  and test a Synchronet adapter.
- The hardest product problem is semantic text flow inside fixed art, not glyph
  painting.
- The resource editor should be mined for tests and small model/codec ideas, not
  used as the UI or command architecture.
- Direct mouse events remove the largest obvious input/UI performance trap.
- A native project format is necessary if typed-versus-drawn behavior must
  survive closing and reopening.
- The next justified work is a headless document/command/codec spike followed by
  an 80x24 interaction prototype. It is not a full UI port.
