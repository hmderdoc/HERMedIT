/**
 * Responsive layout: live resize polling, the narrow-terminal bottom panel
 * (Draw mode) with its inline controls, and chrome clicks during a font WP
 * session.
 */
import { describe, it, expect } from 'vitest';
import { Controller } from '../src/ui/controller';
import { Screen } from '../src/ui/screen';
import { theme } from '../src/ui/theme';
import { InputEvent, MessageSession, TerminalCaps } from '../src/host/types';

const CTRL_D = '\x04';
const CTRL_A = '\x01';

function session(): MessageSession {
  return {
    bodyPath: '',
    meta: { from: '', to: '', subject: 's', area: '', privateMsg: false, charset: '', source: 'none' },
    sourceText: '',
    quoteLines: [],
    utf8: false
  };
}

function key(k: string): InputEvent {
  return { type: 'key', key: k };
}

/** An input-wait timeout: marks the loop idle, which gates the size poll. */
const IDLE: InputEvent = { type: 'none' };

function click(x1: number, y1: number): InputEvent[] {
  return [
    { type: 'mouse', x: x1, y: y1, button: 0, press: true, release: false, motion: false, wheel: 0 },
    { type: 'mouse', x: x1, y: y1, button: 0, press: false, release: true, motion: false, wheel: 0 }
  ];
}

function harness(cols: number, rows: number, events: InputEvent[], sizes?: { cols: number; rows: number }[]) {
  const caps: TerminalCaps = { cols, rows, utf8: false, mouse: true };
  const scr = new Screen(cols, rows, false, () => undefined);
  const queue = events.slice();
  let size = { cols, rows };
  const sizeQueue = sizes === undefined ? [] : sizes.slice();
  const ctl = new Controller(session(), caps, scr, () => {
    // each input pull may also advance the scripted terminal size
    if (sizeQueue.length > 0) size = sizeQueue.shift()!;
    const ev = queue.shift();
    return ev === undefined ? { type: 'none' } : ev;
  }, () => queue.length > 0, undefined, () => size);
  const result = ctl.run();
  return { scr, ctl, result };
}

function text(scr: Screen, x: number, y: number, len: number): string {
  const anyScr = scr as unknown as { ch: number[] };
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(anyScr.ch[y * scr.cols + x + i]!);
  return s;
}

describe('resize polling', () => {
  it('adopts a new terminal size mid-session and shows the side panel', () => {
    // starts 80x24 (no side panel); grows to 120x30 after the first event.
    // The poll only runs after an idle tick (input-wait timeout).
    const r = harness(80, 24, [key(CTRL_D), IDLE, key(CTRL_A)], [
      { cols: 120, rows: 30 }
    ]);
    expect(r.scr.cols).toBe(120);
    expect(r.scr.rows).toBe(30);
    // side panel sits right next to the 79-col canvas (panelX = 80)
    expect(text(r.scr, 81, 3, 4)).toBe('Mode');
    // status bar sits at the top (row 2) at the new width
    expect(text(r.scr, 1, 2, 9)).toBe('Mode:DRAW');
  });

  it('ignores bogus tiny size reports', () => {
    const r = harness(80, 24, [IDLE, key(CTRL_A)], [{ cols: 0, rows: 0 }]);
    expect(r.scr.cols).toBe(80);
  });

  it('does not poll while actively receiving input (keystroke-race guard)', () => {
    // size change available, but no idle tick before the events end
    const r = harness(80, 24, [key(CTRL_D), key(CTRL_A)], [{ cols: 120, rows: 30 }]);
    expect(r.scr.cols).toBe(80);
  });
});

describe('narrow-terminal bottom panel', () => {
  it('appears in both modes: two rows in draw, one color row in text', () => {
    const r = harness(80, 24, [key(CTRL_D), key(CTRL_A)]);
    // draw (pencil has options): bar 18, status 19, divider 20, colors 21,
    // tools 22, options 23
    expect(text(r.scr, 1, 21, 2)).toBe('FG');
    expect(text(r.scr, 5, 22, 6)).toBe('Pencil');
    expect(text(r.scr, 1, 23, 5)).toBe('S-Tab');
    expect(text(r.scr, 7, 23, 5)).toBe('Size:');
    const t = harness(80, 24, [key(CTRL_A)]);
    // text: bar 20, status 21, divider 22, colors row 23 (no tools row)
    expect(text(t.scr, 1, 23, 2)).toBe('FG');
    expect(text(t.scr, 1, 22, 2)).not.toBe('FG');
  });

  it('tool labels, color swatches, and tool options are clickable', () => {
    // 'Type' label on the tools row: 'Tab ' (x=1..4) + 'Pencil ' (7) -> x=12,
    // 1-based (13, 23)
    const r = harness(80, 24, [key(CTRL_D), ...click(13, 23), key(CTRL_A)]);
    expect((r.ctl as any).drawTool).toBe('type');
    // FG swatch 4 (red): x = 4 + 4 = 8 0-based -> 1-based (9, 22)
    const c = harness(80, 24, [key(CTRL_D), ...click(9, 22), key(CTRL_A)]);
    expect((c.ctl as any).doc.curAttr & 0x0f).toBe(4);
    // pencil size option '2' on the options row: 'S-Tab ' (6) + 'Size:' +
    // gap -> 0-based x=15 -> 1-based (16, 24)
    const o = harness(80, 24, [key(CTRL_D), ...click(16, 24), key(CTRL_A)]);
    expect((o.ctl as any).pencilSize).toBe(2);
  });

  it('Shift+Tab opens the tool options menu (keyboard path)', () => {
    const DOWN = '\x0a';
    const ENTER = '\r';
    const ESC = '\x1b';
    // open the menu, arrow to 'Size: 2', Enter
    const r = harness(80, 24, [key(CTRL_D), key('STAB'), key(DOWN), key(ENTER), key(CTRL_A)]);
    expect((r.ctl as any).pencilSize).toBe(2);
    // Esc closes it without changing anything
    const e = harness(80, 24, [key(CTRL_D), key('STAB'), key(ESC), key(CTRL_A)]);
    expect((e.ctl as any).pencilSize).toBe(1);
  });

  it('is absent on wide terminals (side panel instead)', () => {
    const r = harness(120, 30, [key(CTRL_D), key(CTRL_A)]);
    expect(text(r.scr, 1, 26, 2)).not.toBe('FG');
    expect(text(r.scr, 81, 3, 4)).toBe('Mode');
  });
});

describe('chrome clicks during a font WP session', () => {
  function wpHarness(events: InputEvent[]) {
    const caps: TerminalCaps = { cols: 80, rows: 24, utf8: false, mouse: true };
    const scr = new Screen(80, 24, false, () => undefined);
    const queue = events.slice();
    const ctl = new Controller(session(), caps, scr, () => {
      const ev = queue.shift();
      return ev === undefined ? { type: 'none' } : ev;
    }, () => queue.length > 0);
    // open a WP session directly (the picker modal is interactive)
    const anyCtl = ctl as any;
    anyCtl.mode = 'draw';
    const font = { name: 'T', fonttype: 1, spacing: 1, height: 3, charlist: [], glyphs: [] };
    anyCtl.wp = { fonts: [], curFont: font, text: '', caret: 0, originX: 0, originY: 0, gap: 0 };
    const result = ctl.run();
    return { scr, ctl: anyCtl, result };
  }

  it('color swatch clicks work without ending the session', () => {
    // bottom panel FG swatch 4 at 1-based (9, 22) (draw mode: colors row 21)
    const r = wpHarness([...click(9, 22), key(CTRL_A)]);
    expect(r.ctl.doc.curAttr & 0x0f).toBe(4);
    expect(r.ctl.wp).not.toBeNull(); // session survived
  });

  it('charset arrows work without ending the session', () => {
    // draw mode narrow (pencil options row): bar at 0-based 19 -> 1-based 20;
    // next button [F12 ►] at 0-based 58..64 -> click (60, 20)
    const r = wpHarness([...click(60, 20), key(CTRL_A)]);
    expect(r.ctl.charsetIdx).toBe(6); // default 5 + 1
    expect(r.ctl.wp).not.toBeNull();
  });

  it('other chrome clicks raise the finish prompt (discard path)', () => {
    // click the Save button (top bar: [Esc Menu] [^G Help] [^O Save] puts it
    // at 0-based x=22..30 -> 1-based 24), then 'D' answers the WP prompt
    const r = wpHarness([...click(24, 2), key('D'), key(CTRL_A)]);
    expect(r.ctl.wp).toBeNull(); // prompt ran; discard ended the session
  });
});
