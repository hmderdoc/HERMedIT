import { describe, it, expect, beforeEach } from 'vitest';
import { Screen } from '../src/ui/screen';
import { HitMap } from '../src/ui/widgets';

describe('Screen diff renderer', () => {
  let out: string[];
  let scr: Screen;

  beforeEach(() => {
    out = [];
    scr = new Screen(10, 4, false, (s) => out.push(s));
  });

  it('first flush paints, second flush with no changes emits no cells', () => {
    scr.putStr(0, 0, 'hello', 0x07);
    scr.flush();
    expect(out.length).toBe(1);
    expect(out[0]).toContain('hello');
    out.length = 0;
    scr.flush();
    // only cursor positioning remains, no cell writes
    expect(out.join('')).not.toContain('hello');
  });

  it('repaints only changed cells', () => {
    scr.putStr(0, 0, 'hello', 0x07);
    scr.flush();
    out.length = 0;
    scr.put(1, 0, 'a'.charCodeAt(0), 0x07);
    scr.flush();
    var s = out.join('');
    expect(s).toContain('a');
    expect(s).not.toContain('hello');
    // positioned at row 1, col 2
    expect(s).toContain('\x1b[1;2H');
  });

  it('emits SGR from a reset for attribute changes', () => {
    scr.put(0, 0, 'x'.charCodeAt(0), 0x1e); // yellow on blue
    scr.flush();
    expect(out.join('')).toContain('\x1b[0;1;33;44m');
  });

  it('never writes the bottom-right cell', () => {
    scr.fill(0, 0, 10, 4, 'Z'.charCodeAt(0), 0x07);
    scr.flush();
    var joined = out.join('');
    var zs = joined.split('Z').length - 1;
    expect(zs).toBe(10 * 4 - 1);
  });

  it('invalidate forces a full repaint', () => {
    scr.putStr(0, 0, 'hi', 0x07);
    scr.flush();
    out.length = 0;
    scr.invalidate();
    scr.flush();
    expect(out.join('')).toContain('hi');
  });
});

describe('HitMap', () => {
  it('returns the latest overlapping region (modal overlays win)', () => {
    var h = new HitMap();
    h.add('under', 0, 0, 9, 9);
    h.add('over', 2, 2, 4, 4);
    expect(h.test(3, 3)).toBe('over');
    expect(h.test(0, 0)).toBe('under');
    expect(h.test(20, 20)).toBeNull();
  });
});
