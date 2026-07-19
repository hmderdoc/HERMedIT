import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Controller } from '../src/ui/controller';
import { Screen } from '../src/ui/screen';
import { parseTdf } from '../src/core/tdf';
import { InputEvent, TerminalCaps } from '../src/host/types';

function loadFont(name: string) {
  const buf = readFileSync(join(__dirname, 'fixtures', 'tdf', name + '.tdf'));
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]!);
  return parseTdf(s)!;
}

it('WP session mixes fonts and commits cohesive art', () => {
  const big = loadFont('block');
  const small = loadFont('4maxcol');
  const caps: TerminalCaps = { cols: 80, rows: 24, utf8: false, mouse: true };
  const scr = new Screen(80, 24, false, () => undefined);
  const queue: InputEvent[] = [];
  const ctl = new Controller(
    { bodyPath: '', meta: { from: '', to: '', subject: 's', area: '', privateMsg: false, charset: '', source: 'none' }, sourceText: '', quoteLines: [], utf8: false },
    caps, scr, () => queue.shift() ?? { type: 'none' }, () => queue.length > 0
  );
  const anyCtl = ctl as any;
  anyCtl.mode = 'draw';
  anyCtl.wp = { fonts: [], curFont: big, text: '', caret: 0, originX: 0, originY: 0, gap: 0 };
  anyCtl.wpInsert('A');
  anyCtl.wp.curFont = small;   // simulate ^K mid-session
  anyCtl.wpInsert('B');
  expect(anyCtl.wp.text).toBe('AB');
  expect(anyCtl.wp.fonts[0]).toBe(big);
  expect(anyCtl.wp.fonts[1]).toBe(small);
  // caret movement re-syncs the typing font from context
  anyCtl.wp.caret = 1;
  anyCtl.wpSyncFont();
  expect(anyCtl.wp.curFont).toBe(big);
  // commit stamps everything as art
  anyCtl.commitWp();
  expect(anyCtl.wp).toBeNull();
  const doc = anyCtl.doc;
  let minY = 999, maxY = -1;
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 79; x++)
      if (doc.artAt(x, y) !== null) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  // committed art spans the big font's height
  expect(maxY - minY + 1).toBeGreaterThan(small.height);
  expect(maxY - minY + 1).toBeLessThanOrEqual(big.height);
});
