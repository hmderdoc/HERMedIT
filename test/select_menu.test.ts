/**
 * Select-tool selection lifecycle and dropdown-menu mouse behavior (the
 * SyncTerm drag-tick bugs): hover follows the pointer, drag reports never
 * activate, marquees clear eagerly, paste stamps only on a real click.
 */
import { describe, it, expect } from 'vitest';
import { Controller } from '../src/ui/controller';
import { Screen } from '../src/ui/screen';
import { InputEvent, MessageSession, TerminalCaps } from '../src/host/types';

const ESC = '\x1b';
const ENTER = '\r';
const TAB = '\x09';

function key(k: string): InputEvent {
  return { type: 'key', key: k };
}
function press(x: number, y: number): InputEvent {
  return { type: 'mouse', x, y, button: 0, press: true, release: false, motion: false, wheel: 0 };
}
function rel(x: number, y: number): InputEvent {
  return { type: 'mouse', x, y, button: 0, press: false, release: true, motion: false, wheel: 0 };
}
/** SGR drag report: motion with the press flag set (ends in 'M'). */
function drag(x: number, y: number): InputEvent {
  return { type: 'mouse', x, y, button: 0, press: true, release: false, motion: true, wheel: 0 };
}

function run(events: InputEvent[], setup?: (c: any) => void) {
  const caps: TerminalCaps = { cols: 80, rows: 24, utf8: false, mouse: true };
  const scr = new Screen(80, 24, false, () => undefined);
  const queue = events.slice();
  const session: MessageSession = {
    bodyPath: '', meta: { from: '', to: '', subject: 's', area: '', privateMsg: false, charset: '', source: 'none' },
    sourceText: '', quoteLines: [], utf8: false
  };
  const ctl = new Controller(session, caps, scr, () => queue.shift() ?? { type: 'none' }, () => queue.length > 0);
  if (setup) setup(ctl as any);
  ctl.run();
  return ctl as any;
}

function selectSetup(c: any): void {
  c.mode = 'draw';
  c.setTool('select');
}

describe('select tool lifecycle', () => {
  // canvas doc (x,y) -> 1-based mouse (x+1, y+4)
  it('drag creates a selection; a plain click then clears it', () => {
    const c1 = run([press(2, 4), drag(6, 6), rel(6, 6)], selectSetup);
    expect(c1.selRect).toEqual({ x0: 1, y0: 0, x1: 5, y1: 2 });
    const c2 = run([press(2, 4), drag(6, 6), rel(6, 6), press(4, 5), rel(4, 5)], selectSetup);
    expect(c2.selRect).toBeNull();
    expect(c2.anchor).toBeNull();
  });

  it('starting a new selection dismisses the old marquee immediately', () => {
    const c = run([press(2, 4), drag(6, 6), rel(6, 6), press(10, 8)], selectSetup);
    expect(c.selRect).toBeNull();       // gone at press time, before any commit
    expect(c.anchor).toEqual({ x: 9, y: 4 });
  });

  it('leaving the Select tool clears the selection', () => {
    const c = run([press(2, 4), drag(6, 6), rel(6, 6), key(TAB)], selectSetup);
    expect(c.drawTool).not.toBe('select');
    expect(c.selRect).toBeNull();
  });
});

describe('paste placement', () => {
  it('paste commits at the cursor immediately; later clicks never re-place', () => {
    const c = run([press(10, 8), rel(10, 8)], (ct: any) => {
      ct.mode = 'draw';
      ct.setTool('select');
      ct.clipArt = { w: 1, h: 1, cells: [{ dx: 0, dy: 0, ch: 0x58, attr: 7 }] };
      ct.pasteArt(); // brush at 0,0
    });
    expect(c.doc.artAt(0, 0)).not.toBeNull();  // settled at paste time
    expect(c.pendingStamp).toBeNull();         // no placement mode armed
    expect(c.doc.artAt(9, 4)).toBeNull();      // the later click placed nothing
  });

  it('font-stamp placement still requires a real click (drag ticks ignored)', () => {
    const c = run([drag(10, 5), press(3, 6), rel(3, 6)], (ct: any) => {
      ct.mode = 'draw';
      ct.pendingStamp = [{ x: 0, y: 0, ch: 0x58, attr: 7 }];
      ct.pendingW = 1;
      ct.pendingH = 1;
    });
    expect(c.doc.artAt(9, 1)).toBeNull();      // motion position: nothing
    expect(c.doc.artAt(2, 2)).not.toBeNull();  // click position: stamped
    expect(c.pendingStamp).toBeNull();
  });
});

describe('dropdown menu mouse behavior', () => {
  // Esc menu opens at 0-based (1,2); item li renders at 1-based row 4+li.
  // Text-mode items: 0 save, 1 subject, 2 sep, 3 mode-draw, ...
  it('hover (motion) moves the lightbar; Enter activates the hovered item', () => {
    const c = run([key(ESC), drag(5, 7), key(ENTER)]);
    expect(c.mode).toBe('draw'); // hovered 'Switch to draw mode', Enter took it
  });

  it('a drag tick never activates an item (click-hold in SyncTerm)', () => {
    const c = run([key(ESC), drag(5, 7), key(ESC)]);
    expect(c.mode).toBe('text'); // menu just closed, nothing activated
  });

  it('a real click activates the clicked item', () => {
    const c = run([key(ESC), press(5, 7)]);
    expect(c.mode).toBe('draw');
  });
});
