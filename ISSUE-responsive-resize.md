# Issue: responsive layout / live terminal resize

Status: **fix applied 2026-07-19, not yet verified on a live session.** This
doc is self-contained so the work can be handed off, verified, or reverted
without any other context.

## Requirements (as specified by the sysop)

1. Poll for screen-size changes at runtime and adapt the view.
2. Below 100 columns (no room for the side panel), stack the Draw-mode
   panel as a block at the bottom of the terminal.
3. When stacked at the bottom, flow its items inline/horizontally so it
   uses width, not rows.

## Symptom reported

No responsive behavior visible — not dynamically, not at start time.
Editor looked identical to the previous build.

## Root cause of the missing DYNAMIC behavior (confirmed in server source)

The first implementation polled `console.screen_columns/rows` passively each
frame. **Those values never change after logon:**

- A mid-session telnet NAWS report is stored into `sbbs->telnet_cols/rows`
  (`src/sbbs3/main.cpp:1827-1836`) and is only copied into the terminal's
  `term->cols` during connection answer (`src/sbbs3/answer.cpp:554,760`).
- `console.screen_columns` reads `term->cols` (`src/sbbs3/js_console.cpp`,
  `CON_PROP_COLUMNS`), so passive polling observes a constant.

Live resize detection requires an **active probe**: `console.ansi_getdims()`
(`src/sbbs3/js_console.cpp:2848` → `ANSI_Terminal::getdims()`,
`src/sbbs3/ansi_terminal.cpp:344`). It emits
`ESC[s ESC[255B ESC[255C ESC[6n ESC[u` (cursor save/restore — visually
inert) and consumes the CPR reply via `inkey(K_ANSI_CPR, ...)`, which
updates `term->cols/rows` server-side. This is exactly the mechanism the
local `future_shell` uses and has proven live:
`/sbbs/mods/future_shell/lib/shell/shelllib.js` — `_checkConsoleResize`
(line ~1725) on a 3s timer (line ~346), `_getConsoleDimensions`
(line ~1021).

Caveats that are real (verified in `ansi_terminal.cpp:346-352`):

- The probe only fires for remote sessions whose user record has
  columns/rows on auto-detect (`useron.cols == TERM_COLS_AUTO` or rows
  equivalent). Fixed-dimension accounts never re-measure.
- The probe's blocking reply-read can swallow a keystroke that races the
  CPR response. The editor therefore only probes when the input loop is
  idle (see below); the shell accepts the race on its 3s timer.

## The fix as applied

- `src/host/sbbs.ts` — `terminalSize()`: calls `console.ansi_getdims()` at
  most once per 3s (throttled via timestamp), then returns
  `screen_columns/rows` (which the probe just refreshed). try/catch guards
  non-ANSI terminals.
- `src/ui/controller.ts` — `run()`: `pollResize()` is gated on `this.idle`
  (previous input wait timed out, i.e. a 1s drought) so a probe can never
  race active typing. Detection latency: ≤ ~4s after the user pauses.
- `pollResize()` adopts a changed size: mutates `caps`, `Screen.resize()`
  (fresh buffers + full repaint). `applyLayout()` recomputes all chrome
  geometry every frame from `caps` + mode.

The static requirements (2) and (3) were already implemented in the same
files: `applyLayout()` decides `bottomPanel = no side panel && draw mode`,
`composeBottomPanel()` renders the two inline rows (colors/char/recent,
then the tool list) above the character-set bar, sharing hit-region ids
with the side panel.

## How to verify which build is running (added for this dispute)

- The **title bar, top-right** shows the build stamp (esbuild `define`
  `BUILD_STAMP` in `scripts/bundle.mjs`), e.g. `2026-07-19T16:15:53Z`.
  An editor without a stamp there predates 2026-07-19.
- Startup logs one line:
  `future_edit build <stamp> starting; terminal <W>x<H> cp437 mouse` —
  shows both the build identity and the size Synchronet reported.
- There is exactly one bundle on the system:
  `/sbbs/repo/xtrn/future_edit/future_edit.js` (reached via the
  `/sbbs/xtrn` symlink); `ctrl/xtrn.ini` `[editor:FUTURE]`
  `cmd=?/sbbs/xtrn/future_edit/future_edit.js %f`. Synchronet compiles
  `?script.js` externals fresh per launch (no cross-launch script cache),
  so a relaunched editor always runs the current file.
- Rebuild + full gate: `npm run check` (typecheck, 154 vitest tests,
  jsexec smoke). `npm run build` alone refreshes the bundle.

## Live test plan (needs a real session; not yet done)

1. Connect with SyncTERM at 80×25, account cols/rows on auto-detect.
   Open the editor, press `^D`: expect the two-row bottom panel
   (`FG …  BG …  Char … / Tab Pencil Type …`) above the magenta F-key bar.
2. Resize the terminal window to ≥100 cols, wait ~4s without typing:
   expect full repaint with the side panel; back down to 80: bottom panel
   returns (Draw mode).
3. Check the node log for the startup line and, at DEBUG level, any
   `future_edit input:` lines (those also capture the still-unidentified
   F4–F8 sequences from the earlier report).
4. If dynamic resize still fails: confirm the account's columns/rows are
   auto-detect, then test whether the shell's own resize detection fires
   for the same session (same probe — if the shell doesn't see it either,
   the client isn't answering CPR).

## Open items

- F4–F8 keys reported dead-or-menu on the sysop's terminal; parser now
  logs every undecoded sequence (`src/host/input.ts` `debugLog`) — needs
  one keypress + a log grep to identify the client's encoding.
- Live verification of the resize probe (this doc's test plan).
