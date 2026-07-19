# HERMedIT — roadmap / requested features

## TODO — remove the TDF word processor's "stamp" model (sysop-requested 2026-07-19)

The font word processor currently runs as a captive modal session: typed text
floats as an overlay preview, Esc is reassigned to a stamp/keep/discard
prompt, and chrome interactions are deferred until the block is "stamped".
The sysop's verdict: regular text doesn't need a commit ceremony — TDF text
should behave the same way. Type and it's on the canvas; Esc keeps meaning
"menu"; no new muscle memory.

Design direction for the rework:

- Typed TDF text should land in the document immediately (undo-coalesced per
  word like normal typing), not live in a pending overlay until stamped.
- Kill the finish prompt entirely; leaving the block (click elsewhere, tool
  switch, Esc) just ends editing, the way leaving a text box works today.
- The right substrate is probably a **semantic TDF text flow** attached to
  the document (mirroring how box regions keep their own text flows, and how
  code blocks keep `pre`/`lang` on the region): the logical string + per-char
  fonts persist, cells re-render from it, and clicking the rendered block
  later resumes editing instead of leaving baked art. This also subsumes the
  long-standing "re-editable/reflowable text flows" roadmap item below.
- Mixed-font runs (added 2026-07-19), caret/hit-test, and wrap all already
  live in `core/tdf.ts` (`layoutTdfWpStyled`) and carry over unchanged; this
  is a controller/document lifecycle change, not a layout-engine change.
- The Font *stamp* menu item (place a rendered string as one-shot art) can
  stay — it's the WP session model that goes.

Backlog captured from sysop feedback. Not built yet; recorded so nothing is
lost. Roughly ordered by how they cluster.

## TheDraw font text (big-text tool) — DONE (2026-07-18)

Built: `core/tdf.ts` (pure parser+renderer+`layoutTdfWp` word-wrap, ported from
tdf-browser.js, tested against real fonts + on-engine smoke); `fonts/` holds
the copied `.tdf` set + `tdfont_map.json` + a prebuilt `tdfont_index.json`
(scripts/build-font-index.mjs); host `createSbbsFontProvider` reads them;
`ui/fontpicker.ts` is the picker with **size (←→) + name filters and a live
preview showing rendered W×H**. Two Draw-menu modes:
- **Font text (stamp)** — fixed string, block follows cursor, click/Enter
  stamps (one undo step).
- **Font word processor** — live typing rendered through the font: word-wraps
  at the screen edge from an (originX, originY), full cursor movement + editing
  (left/right/up/down/home/end, backspace), Enter = new line, Tab = 2-space
  indent, click repositions the block, Esc = stamp/keep/discard.

Color-font cells keep their own attributes; the whole collection happens to be
Color-type storage. Remaining polish ideas below (kept for reference).

Original notes (renderer + fonts ship with Synchronet, integration not
from-scratch):
- `exec/load/tdfonts_lib.js` — JS tdfiglet port. `loadfont(path)` returns
  `{ name, fonttype (0=Outline,1=Block,2=Color), spacing, height, count,
  glyphs[] }`. `readchar()` builds per-glyph cells (char + color); we read
  those directly instead of its console-string path.
- `ctrl/tdfonts/*.tdf` — ~1071 bundled fonts (system.ctrl_dir + 'tdfonts/').
  A single .tdf can hold multiple fonts (`font.count`), each pickable by index.

Tool shape: a Draw-mode "Font" action — pick a font, type a string, preview,
then stamp the rendered cells onto the art layer at the cursor (big-text Type
tool). Color fonts carry their own attributes; Outline/Block use the current
color. Whole stamp is one undo step (doc.paintCells).

### REUSE existing work — we already built this for webv4_custom (sysop note)

The mp3-visualizer / FIGlet work in `webv4_custom` already solved the metadata
and rendering. Port these instead of rebuilding:
- `data/figlet_font_map.json` — the metadata index, already generated:
  `{ "<height>": ["fontname", ...] }`, i.e. fonts already bucketed by height.
  Straight up the size-filter data. Generator: `webv4_custom/root/api/
  figlet.ssjs` (uses tdfonts_lib `loadfont`, reads `font.height`/`fonttype`).
- `webv4_custom/root/js/tdf-browser.js` `_renderWith(text, font)` — the render
  routine to port: returns `{ height, width, fontName, fontType, spacing,
  rows:[{chars, colors[]}], charBounds[] }`. Renders to CELLS (not console),
  and `width`/`height`/`charBounds` are exactly the variable-extent data the
  preview needs. Its glyph model matches `tdfonts_lib.js` (loadfont/readchar).
- `webv4_custom/root/api/tdf-serve.ssjs` — serves the map + fonts (reference).
- Also present: `webv4_custom/ansi-editor/src/lib/font.js` and `renderer.js`.

### Size filters + font browser (sysop request)

- Load `figlet_font_map.json` for the **size buckets** (keys are heights); the
  picker filters by height range and by type (Outline/Block/Color via
  `font.fonttype`), plus a name substring filter.

### Preview (sysop request)

- Live-render the highlighted font (port `_renderWith`) into a preview pane so
  the artist sees the look before stamping. `_renderWith` already returns
  `width`/`height`, so surface "renders NxM"; a font that blows past the
  79/80-col width is then obvious before placement. Fit/scroll/clip to the pane.
- Default sample = the user's typed text (fallback "AaBb 123"); cap/window it
  since length varies wildly by font.

### Overflow / placement

- A big font + a few characters easily exceeds the safe width — the stamp step
  needs an explicit policy (clip, or warn, or allow with the boundary marker),
  consistent with the 79-col message vs 80-col art distinction.

## Message output format — DONE (2026-07-18)

Research (real payloads on this board, ad forums): posts are one of three —
plain text, CTRL-A-colored text, or `[ANSI]`-subject art. The ANSI art is
line-by-line **SGR + CP437 + CRLF** (the common FuNToPiA form uses ZERO cursor
positioning; only some use moves). CTRL-A is Synchronet-native and degrades to
monochrome cleanly (stripped on output); raw ANSI does NOT degrade → hence the
`[ANSI]` subject tag so mono readers skip. Threading is by message ID, not
subject, so tagging replies is safe.

Built: two auto-detected save formats —
- **Colored text (CTRL-A)** — default; `doc.toMessageBody(true)`; shapes+color,
  graceful mono. (This is what we already had.)
- **ANSI art** — `doc.toAnsiBody()` = SGR grid (via `ansiFromAttr`), leading/
  trailing reset, no positioning; subject auto-tagged `[ANSI]`.
Auto-detect: `art >= 40 && art > prose` -> ANSI, else CTRL-A. The save dialog
shows the detected format with a Text/ANSI toggle. `compositeBody` now takes a
'none'|'ctrla'|'ansi' mode.
STILL TODO / to verify by screenshot: whether ANSI art on a UTF-8 session
should force CP437 rather than transcode (convention is CP437 ANSI); cursor-
positioning ANSI optimization (not needed for correctness).

## Selection + clipboard — DONE (2026-07-18)

Two clipboards, mode-appropriate, on `^C`/`^X`/`^V` (`^V` == the Insert-key
byte, so paste supersedes the overwrite toggle):
- **Draw box select** — a **Select** tool (Tab), drag a rectangle (blinking
  marquee). `^C`/`^X` copy/cut the art cells; `^V` paste re-uses the font-stamp
  placement (the block follows the cursor, click/Enter drops it, one undo).
- **Text string select** — mouse-drag in Text mode highlights a range;
  `^C`/`^X` copy/cut, `^V` paste at the caret (replaces any active selection).
  Backed by `Document.getRangeText`/`deleteRange`/`insertString` (tested).
- **Positional multi-flow layer** (also done, 2026-07-18): body + each box hold
  independent persistent text (`Document.flows[]`); a box masks the body.
- Still TODO: keyboard (shift-arrow) selection — v1 selects with the mouse;
  optional borderless free-floating text blocks.

## Quote system — DONE (2026-07-18)

Reply-quote flow (`^R`) now: pick lines (quote picker) → choose a **BBS
convention** (`> ` standard / ` AB> ` initials / plain) → optional
"<author> wrote:" attribution → formatted + wrapped + inserted. Pure formatter
in `core/quote.ts` (tested). Still could add: custom prefix strings, tagline
insertion.

## Fill tool — DONE (2026-07-17)

- 4-way flood fill (`floodFill` in core/shapes.ts), Draw mode, left/Space fills
  with the current glyph+color, right-click clears. Bounded + capped.

## Recolor (ink) tool — DONE (2026-07-18)

- Draw-mode brush that repaints existing art cells' color WITHOUT changing the
  glyph. Channel selectable: FG only / BG only / Both (keys 1/2/3, or the menu;
  shown in the status bar). `applyColorChannel` in core/attr.ts (tested).
  Drag to recolor a swath; middle-click eyedrops. Only touches existing art
  cells (it repaints, never places a character).

## Shape tools (Draw mode) — line/box/circle DONE (2026-07-17)

- **Line** (Bresenham; axis-aligned runs auto-use CP437 `─`/`│`), **box**
  (CP437 box-drawing corners/edges), **circle/ellipse** (parametric, brush
  glyph) — all in core/shapes.ts, wired as Draw tools (Tab cycles;
  mouse drag or keyboard anchor→commit; live preview).
- STILL TODO — the second fidelity option: **half-block** rendering for
  diagonals/curves at 2x vertical resolution, user-selectable alongside the
  CP437 sets (+ double-line box variant is in the codec, not yet exposed).

  NOTE — half-block is viable *here* even though it was declined as a freehand
  pixel mode: shapes are computed algorithmically (the line/circle routine
  decides which half-cells to set), so they do **not** need the sub-cell mouse
  resolution Synchronet can't provide. The earlier "no half-block" conclusion
  was specifically about mouse-driven freehand painting.

## Notes carried from earlier rounds

- Mouse is cell-resolution only on this platform (Synchronet supports X10 mode
  9 + SGR mode 1006; no SGR-pixel 1016), verified in `ansi_terminal.cpp`.
- Keybindings were reworked toward muscle memory (`^S` save, `^Z` undo,
  `^Y` redo, `^Q` quit, `^T`/`^D` text/draw, `^L` color, `^K` char, `^G` help,
  `^R` quote). `^S`/`^Q` are XON/XOFF flow control — F2/menu are fallbacks.
