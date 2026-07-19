/**
 * Markdown-style ``` fences in the message body, language auto-detection
 * through the editor path, and keyboard escape from box regions.
 */
import { describe, it, expect } from 'vitest';
import { Controller } from '../src/ui/controller';
import { Screen } from '../src/ui/screen';
import { HL_KEYWORD, HL_COMMENT, HL_DEFAULT } from '../src/core/syntax';
import { InputEvent, MessageSession, TerminalCaps } from '../src/host/types';

const KEY_UP = '\x1e';
const KEY_DOWN = '\x0a';
const KEY_END = '\x05';
const BS = '\x08';

function run(script: string[], setup?: (ctl: Controller) => void) {
  const caps: TerminalCaps = { cols: 80, rows: 24, utf8: false, mouse: true };
  const scr = new Screen(80, 24, false, () => undefined);
  const queue: InputEvent[] = [];
  for (const item of script) {
    if (item.length === 1) queue.push({ type: 'key', key: item });
    else for (const ch of item) queue.push({ type: 'key', key: ch });
  }
  const session: MessageSession = {
    bodyPath: '', meta: { from: '', to: '', subject: 's', area: '', privateMsg: false, charset: '', source: 'none' },
    sourceText: '', quoteLines: [], utf8: false
  };
  const ctl = new Controller(session, caps, scr, () => queue.shift() ?? { type: 'none' }, () => queue.length > 0);
  if (setup) setup(ctl);
  ctl.run();
  return ctl as any;
}

describe('body code fences', () => {
  it('highlights between tagged fences and dims the fence lines', () => {
    const ctl = run(['```js', '\r', 'var x = 1', '\r', '```']);
    const lines = ctl.doc.lines;
    expect(lines[0].attr[0]).toBe(HL_COMMENT);  // ```js dim
    expect(lines[1].attr[0]).toBe(HL_KEYWORD);  // var
    expect(lines[2].attr[0]).toBe(HL_COMMENT);  // closing ```
  });

  it('auto-detects the language on a bare fence', () => {
    const ctl = run(['```', '\r', 'def main():', '\r', '    print(1)', '\r', '```']);
    expect(ctl.doc.lines[1].attr[0]).toBe(HL_KEYWORD); // def (python)
  });

  it('an unclosed fence highlights to the end, and deleting it resets', () => {
    const ctl = run(['```js', '\r', 'var x']);
    expect(ctl.doc.lines[1].attr[0]).toBe(HL_KEYWORD);
    // go up and erase the fence line -> highlighting must be undone
    const ctl2 = run(['```js', '\r', 'var x', KEY_UP, KEY_END, BS, BS, BS, BS, BS]);
    expect(ctl2.doc.lines[0].text).toBe('');
    expect(ctl2.doc.lines[1].attr[0]).toBe(HL_DEFAULT);
  });
});

describe('insert code block (fence-based)', () => {
  it('inserts plain-text fences with the caret between them — no box, no art', () => {
    const ctl = run([], (c) => (c as any).insertCodeBlock('js'));
    const lines = ctl.doc.lines;
    expect(lines[0].text).toBe('```js');
    expect(lines[1].text).toBe('');
    expect(lines[2].text).toBe('```');
    expect(ctl.doc.caret.row).toBe(1);
    expect(ctl.doc.region).toBeNull();       // not a box region
    expect(ctl.doc.artCellCount()).toBe(0);  // no CP437 border art
  });

  it('long code lines wrap to the next line instead of truncating', () => {
    let long = 'var x = ';
    for (let i = 0; i < 12; i++) long += 'aaaaaaaaaa';   // > 79 cols
    const ctl = run([long], (c) => (c as any).insertCodeBlock('js'));
    const flat = ctl.doc.lines.map((l: { text: string }) => l.text).join('');
    expect(flat.indexOf('```js')).toBe(0);
    expect(flat.indexOf(long)).toBeGreaterThan(0);       // nothing lost
    expect(ctl.doc.lines.length).toBeGreaterThan(4);     // wrapped over lines
  });

  it('a fenced message never auto-selects the ANSI-art save format', () => {
    // enough art to trip the ANSI heuristic, plus a fence
    const ctl = run(['```js', '\r', 'var x', '\r', '```'], (c) => {
      const cells = [];
      for (let i = 0; i < 60; i++) cells.push({ x: i % 20, y: 15 + Math.floor(i / 20), ch: 0xdb, attr: 7 });
      (c as any).doc.paintCells(cells);
    });
    expect((ctl as any).detectSaveMode()).toBe('ctrla');
    // same art without a fence still reads as ANSI art
    const art = run([], (c) => {
      const cells = [];
      for (let i = 0; i < 60; i++) cells.push({ x: i % 20, y: 15 + Math.floor(i / 20), ch: 0xdb, attr: 7 });
      (c as any).doc.paintCells(cells);
    });
    expect((art as any).detectSaveMode()).toBe('ansi');
  });
});

describe('keyboard escape from boxes', () => {
  function codeSetup(ctl: Controller) {
    const anyCtl = ctl as any;
    anyCtl.doc.setRegion({ left: 1, top: 2, width: 40, height: 6 });
    anyCtl.doc.markRegionCode('javascript');
  }

  it('arrow down past the last line leaves the box', () => {
    const ctl = run(['var x', KEY_DOWN], codeSetup);
    expect(ctl.doc.region).toBeNull();
  });

  it('arrow up past the first line leaves the box', () => {
    const ctl = run(['var x', KEY_UP], codeSetup);
    expect(ctl.doc.region).toBeNull();
  });

  it('typing ``` then Enter closes a code box', () => {
    const ctl = run(['var x', '\r', '```', '\r'], codeSetup);
    expect(ctl.doc.region).toBeNull();
    // the fence backticks were removed, not stamped into the block
    const flows = ctl.doc.flowList();
    expect(flows[1].lines[1].text).toBe('');
  });
});
