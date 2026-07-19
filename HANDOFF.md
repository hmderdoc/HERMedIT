# Handoff / resume point

## State

- Workflow: `Research -> Design -> Plan -> Delegate -> Deliver`
- Current gate: **Delivered (slices A+B + GUI chrome), 2026-07-17**
- Implementation: TypeScript under `src/`, ES5 bundle at `future_edit.js`,
  registered as `[editor:FUTURE]` in `/sbbs/ctrl/xtrn.ini` (backup:
  `xtrn.ini.bak-future_edit`). See README.md for build/test/rollback.
- v1 decisions (sysop-directed): Synchronet only; persistent GUI button
  chrome with key labels; art cells anchored to absolute document rows
  (full semantic text regions deferred); no native project format yet.
- Research snapshot: 2026-07-17 (`sbbs` `53ba5083`; `fshell_ts` `d32e615d`)

## One-paragraph summary

Build a Synchronet-first external message editor around a headless semantic
document. Fixed CP437 art cells and rectangular text-flow objects must remain
distinct until export so inserting prose inside a box reflows the prose without
moving its border. Use direct Synchronet mouse reports and coordinate hit-testing,
not per-cell hotspots. Present Text/Draw/Select as tool intent while keeping both
keyboard and mouse live. Save through explicit CP437/UTF-8 and Synchronet Ctrl-A
codecs. Default an 80-column message session to a 79-column safe boundary, while
allowing 80-column ANSI/BIN art targets. Isolate Synchronet behind an adapter;
only add Mystic after validating a separate integration against a real system.

## Read in this order

1. `README.md`
2. `RESEARCH.md`
3. `SYNCHRONET_CONTRACT.md`
4. `DESIGN.md`
5. `PLAN.md`

## Source files to reopen first

```text
/sbbs/repo/src/sbbs3/writemsg.cpp
/sbbs/repo/src/sbbs3/sbbsdefs.h
/sbbs/repo/src/sbbs3/scfg/scfgxtrn.c
/sbbs/repo/ctrl/xtrn.ini
/sbbs/repo/exec/fseditor.js
/sbbs/repo/exec/SlyEdit.js
/sbbs/repo/exec/load/mouse_getkey.js
/sbbs/repo/exec/avatar_chooser.js
/sbbs/mods/fshell_ts/src/subprograms/resource_editor.ts
/sbbs/mods/fshell_ts/src/subprograms/resource_canvas.ts
/sbbs/mods/fshell_ts/test/resource_editor.test.ts
/sbbs/mods/fshell_ts/test/resource_canvas.test.ts
```

High-value host sections are `writemsg.cpp:36-59`, `95-131`, `160-211`,
`590-704`, and `813-887`. High-value FSEditor sections are its output/save code
around line 1521 and startup/drop-file/result handling around lines 2022-2124.
High-value resource-editor sections are layout around line 252, hotspot
publication around line 455, and input handling around line 566.

## Decisions still open

1. Text-region creation: explicit drag, border inference, or both.
2. Draw-over-text: obstacle/reflow, destructive removal, or front override.
3. Native project/draft storage and disconnect recovery.
4. Whether v1 integration enables both CP437 and UTF-8 profiles immediately.
5. Minimum supported terminal rows and columns.
6. Whether standalone ANSI/BIN follows the message editor or ships alongside it.

Draft answers and tradeoffs are in `DESIGN.md`.

## Recommended next action

Do not port the resource-editor UI. Create a small, headless spike with tests for
one fixed box, one text-flow region, insert/delete/wrap, an art-over-text command,
undo/redo, flattening, and native save/reload. In parallel only after its types
are stable, create byte-exact fixtures for the Synchronet drop files and message
codecs. Review those results before committing to the full screen/controller.

## Things not to lose during implementation

- `mouse` is an input capability, not an edit mode;
- the posted message is a flattened target, not the source document;
- runtime CP437 display and UTF-8 file bytes are different boundaries;
- raw ANSI screen controls do not belong in a Synchronet message body;
- 79 columns is message-safe policy, not a universal art width;
- imported ANSI has no reliable typed/drawn provenance;
- terminal state must be restored on success, abort, exception, and disconnect;
- UX space and remote latency are part of the acceptance criteria.
