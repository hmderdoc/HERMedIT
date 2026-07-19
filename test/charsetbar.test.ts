/**
 * Drives the real Controller with scripted input to verify the F-key
 * character-set bar: rendering on row 2, F1-F10 typing, F11/F12 + arrow
 * cycling, and the Ctrl+,/. CSI-u keys.
 */
import { describe, it, expect } from 'vitest';
import { Controller } from '../src/ui/controller';
import { Screen } from '../src/ui/screen';
import { CHARSETS, DEFAULT_CHARSET } from '../src/ui/charsets';
import { theme } from '../src/ui/theme';
import { InputEvent, MessageSession, TerminalCaps } from '../src/host/types';

const CTRL_D = '\x04'; // draw mode
const CTRL_A = '\x01'; // abort
const COLS = 80;
const ROWS = 24;

function session(): MessageSession {
  return {
    bodyPath: '',
    meta: { from: 'Alice', to: '', subject: 'test', area: '', privateMsg: false, charset: '', source: 'none' },
    sourceText: '',
    quoteLines: [],
    utf8: false
  };
}

function key(k: string): InputEvent {
  return { type: 'key', key: k };
}

function click(x1: number, y1: number): InputEvent[] {
  return [
    { type: 'mouse', x: x1, y: y1, button: 0, press: true, release: false, motion: false, wheel: 0 },
    { type: 'mouse', x: x1, y: y1, button: 0, press: false, release: true, motion: false, wheel: 0 }
  ];
}

/** Run a script through the editor; returns the screen and the final result. */
function run(events: InputEvent[]) {
  const caps: TerminalCaps = { cols: COLS, rows: ROWS, utf8: false, mouse: true };
  const scr = new Screen(COLS, ROWS, false, () => undefined);
  // Ending with ^A aborts through the confirm dialog only when dirty; a
  // clean doc aborts immediately. Scripts append their own 'D' when needed.
  const queue = events.slice();
  const ctl = new Controller(session(), caps, scr, () => {
    const ev = queue.shift();
    return ev === undefined ? { type: 'none' } : ev;
  }, () => queue.length > 0);
  const result = ctl.run();
  return { scr, result };
}

/** Read a cell (0-based) out of the screen's private buffer. */
function cellAt(scr: Screen, x: number, y: number): { ch: number; attr: number } {
  const anyScr = scr as unknown as { ch: number[]; attr: number[] };
  return { ch: anyScr.ch[y * COLS + x]!, attr: anyScr.attr[y * COLS + x]! };
}

// Bar geometry at 80x24 in TEXT mode: the status bar lives at the top
// (row 2) and narrow terminals stack canvas / charset bar / divider /
// bottom panel, so with the one-row text panel the bar sits at rows-3
// (0-based 21). The "[◄] F1x .. F10x [►]  Set n/16" cluster (58 cells) is
// centered at x=8: prev button [F11 ◄] 8..14, slot i label at 16+4i (glyph
// at +2, F10's at +3), next button [F12 ►] 58..64, indicator from 67.
const BAR_Y = ROWS - 3;
const SLOT_X = (i: number) => 16 + i * 4;
const GLYPH_X = (i: number) => SLOT_X(i) + (i === 9 ? 3 : 2);

/** The ten glyph codes shown in the bar's F1..F10 slots. */
function barGlyphs(scr: Screen): number[] {
  const out: number[] = [];
  for (let i = 0; i < 10; i++) out.push(cellAt(scr, GLYPH_X(i), BAR_Y).ch);
  return out;
}

describe('character-set bar', () => {
  it('renders the default (blocks) set centered above the status bar', () => {
    const { scr } = run([key(CTRL_A)]);
    expect(barGlyphs(scr)).toEqual(CHARSETS[DEFAULT_CHARSET]);
  });

  it('labels the slots F1..F10 on a magenta bar', () => {
    const { scr } = run([key(CTRL_A)]);
    // 'F1' label ahead of the first glyph; 'F10' ahead of the last
    expect(cellAt(scr, SLOT_X(0), BAR_Y).ch).toBe('F'.charCodeAt(0));
    expect(cellAt(scr, SLOT_X(0) + 1, BAR_Y).ch).toBe('1'.charCodeAt(0));
    expect(cellAt(scr, SLOT_X(9) + 1, BAR_Y).ch).toBe('1'.charCodeAt(0));
    expect(cellAt(scr, SLOT_X(9) + 2, BAR_Y).ch).toBe('0'.charCodeAt(0));
    expect(cellAt(scr, SLOT_X(0), BAR_Y).attr).toBe(theme.charsetKey);
    // background fill (far left, outside the cluster) is the magenta bar
    expect(cellAt(scr, 0, BAR_Y).attr).toBe(theme.charsetBar);
  });

  // Scripts below end by running dry: the controller's disconnect path
  // preserves the document, so the typed glyph is observable in the body.
  it('F1 stamps the set glyph as art at the brush in draw mode', () => {
    const { result } = run([key(CTRL_D), key('F1')]);
    // brush starts at 0,0; F1 of the blocks set is 176 (░)
    expect(result.bodyCp437.charCodeAt(0)).toBe(176);
  });

  it('F10 types the tenth slot, not F1 (slot arithmetic)', () => {
    const { result } = run([key(CTRL_D), key('F10')]);
    expect(result.bodyCp437.charCodeAt(0)).toBe(CHARSETS[DEFAULT_CHARSET]![9]);
  });

  it('F1 inserts into the text flow in text mode', () => {
    const { result } = run([key('F1')]);
    expect(result.bodyCp437.charCodeAt(0)).toBe(176);
  });

  it('F12/F11 cycle next/previous and wrap around', () => {
    let r = run([key('F12'), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET + 1]);
    r = run([key('F11'), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET - 1]);
    // full wrap: 16 nexts returns to the default
    const wrap: InputEvent[] = [];
    for (let i = 0; i < CHARSETS.length; i++) wrap.push(key('F12'));
    wrap.push(key(CTRL_A));
    r = run(wrap);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET]);
  });

  it('CSI-u Ctrl+, / Ctrl+. / Ctrl+/ cycle and reset', () => {
    let r = run([key('C-.'), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET + 1]);
    r = run([key('C-.'), key('C-,'), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET]);
    r = run([key('C-.'), key('C-.'), key('C-/'), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET]);
  });

  it('clicking the arrow buttons cycles sets', () => {
    // next button 0-based 58..64 -> 1-based click (60, 22)
    let r = run([...click(60, BAR_Y + 1), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET + 1]);
    // prev button 0-based 8..14 -> 1-based (13, 22)
    r = run([...click(13, BAR_Y + 1), key(CTRL_A)]);
    expect(barGlyphs(r.scr)).toEqual(CHARSETS[DEFAULT_CHARSET - 1]);
  });

  it('clicking a slot types that character', () => {
    // slot 0 spans 0-based 15..17 -> 1-based (17, 23) hits its glyph cell
    const { result } = run([...click(GLYPH_X(0) + 1, BAR_Y + 1)]);
    expect(result.bodyCp437.charCodeAt(0)).toBe(176);
  });
});
