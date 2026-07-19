import { describe, it, expect } from 'vitest';
import { Document, Region } from '../src/core/doc';

/** Draw a rectangular box of art glyphs; return its interior Region. */
function drawBox(d: Document, x0: number, y0: number, x1: number, y1: number): Region {
  for (var x = x0; x <= x1; x++) {
    d.setArt(x, y0, { ch: 0xc4, attr: 7 });
    d.setArt(x, y1, { ch: 0xc4, attr: 7 });
  }
  for (var y = y0; y <= y1; y++) {
    d.setArt(x0, y, { ch: 0xb3, attr: 7 });
    d.setArt(x1, y, { ch: 0xb3, attr: 7 });
  }
  return { left: x0 + 1, top: y0 + 1, width: x1 - x0 - 1, height: y1 - y0 - 1 };
}

describe('box detection', () => {
  it('finds the interior rectangle of a drawn box', () => {
    var d = new Document(79);
    drawBox(d, 2, 1, 12, 5);
    expect(d.detectBox(6, 3)).toEqual({ left: 3, top: 2, width: 9, height: 3 });
  });

  it('returns null when the point is on a border cell', () => {
    var d = new Document(79);
    drawBox(d, 2, 1, 12, 5);
    expect(d.detectBox(2, 3)).toBeNull();
  });

  it('returns null when the point is not enclosed on all sides', () => {
    var d = new Document(79);
    // just a left wall, no right/top/bottom
    d.setArt(2, 3, { ch: 0xb3, attr: 7 });
    expect(d.detectBox(6, 3)).toBeNull();
  });
});

describe('typing constrained to a box', () => {
  it('wraps at the box interior width, not the document width', () => {
    var d = new Document(79);
    var region = drawBox(d, 2, 1, 12, 5); // interior width 9
    d.setRegion(region);
    d.caret = { row: 0, col: 0 };
    var text = 'aaaa bbbb cccc'; // 14 chars, must wrap inside width 9
    for (var i = 0; i < text.length; i++) d.insertChar(text.charCodeAt(i));
    for (var r = 0; r < d.lines.length; r++) {
      expect(d.lines[r]!.text.length).toBeLessThanOrEqual(9);
    }
    // lossless
    var joined = '';
    for (var k = 0; k < d.lines.length; k++) joined += d.lines[k]!.text;
    expect(joined).toBe(text);
  });

  it('never displaces the border glyphs', () => {
    var d = new Document(79);
    var region = drawBox(d, 2, 1, 12, 5);
    d.setRegion(region);
    d.caret = { row: 0, col: 0 };
    var text = 'the quick brown fox jumps';
    for (var i = 0; i < text.length; i++) d.insertChar(text.charCodeAt(i));
    // right and left walls still exactly where they were drawn
    for (var y = 1; y <= 5; y++) {
      expect(d.artAt(2, y)).not.toBeNull();
      expect(d.artAt(12, y)).not.toBeNull();
    }
  });

  it('renders prose at the box offset via cellAt', () => {
    var d = new Document(79);
    var region = drawBox(d, 2, 1, 12, 5); // interior left=3, top=2
    d.setRegion(region);
    d.caret = { row: 0, col: 0 };
    d.insertChar('H'.charCodeAt(0));
    d.insertChar('i'.charCodeAt(0));
    // prose 'H' lands at canvas (3,2), not (0,0)
    expect(d.cellAt(3, 2).ch).toBe('H'.charCodeAt(0));
    expect(d.cellAt(0, 0).ch).toBe(0x20);
    // caret reports absolute canvas coordinates
    expect(d.caretDocX()).toBe(3 + 2);
    expect(d.caretDocY()).toBe(2);
  });

  it('exports the box borders plus the wrapped interior prose', () => {
    var d = new Document(79);
    var region = drawBox(d, 0, 0, 6, 2); // interior left=1,top=1,width=5,height=1
    d.setRegion(region);
    d.caret = { row: 0, col: 0 };
    var text = 'hello';
    for (var i = 0; i < text.length; i++) d.insertChar(text.charCodeAt(i));
    var body = d.toMessageBody(false);
    var rows = body.split('\r\n');
    // row 1 is the interior: left wall, prose, right wall
    expect(rows[1]!.charCodeAt(0)).toBe(0xb3);
    expect(rows[1]!.substring(1, 6)).toBe('hello');
    expect(rows[1]!.charCodeAt(6)).toBe(0xb3);
  });

  it('keeps the box text in the box after leaving, and re-entering returns to it', () => {
    var d = new Document(79);
    var region = drawBox(d, 2, 1, 12, 5);
    d.setRegion(region);
    d.caret = { row: 0, col: 0 };
    var text = 'aaaa bbbb cccc';
    for (var i = 0; i < text.length; i++) d.insertChar(text.charCodeAt(i));
    expect(d.lines.length).toBeGreaterThan(1); // wrapped inside the box

    // Leaving the box goes to the body flow, which is SEPARATE and empty —
    // the box text does not spill into it.
    d.clearRegion();
    expect(d.region).toBeNull();
    expect(d.lines.length).toBe(1);
    expect(d.lines[0]!.text).toBe('');
    // and the box's text still renders at its offset
    expect(d.cellAt(region.left, region.top).ch).toBe('a'.charCodeAt(0));

    // Re-entering the same box returns to the text already typed there.
    d.setRegion(region);
    var joined = '';
    for (var k = 0; k < d.lines.length; k++) joined += d.lines[k]!.text;
    expect(joined).toBe(text);
  });

  it('lets the body and a box hold independent text at the same time', () => {
    var d = new Document(79);
    var region = drawBox(d, 40, 0, 60, 4); // interior left=41,top=1
    // type in the body first
    d.caret = { row: 0, col: 0 };
    var body = 'hello body';
    for (var i = 0; i < body.length; i++) d.insertChar(body.charCodeAt(i));
    // now enter the box and type there
    d.setRegion(region);
    d.caret = { row: 0, col: 0 };
    var inbox = 'in box';
    for (var j = 0; j < inbox.length; j++) d.insertChar(inbox.charCodeAt(j));
    // both survive, at their own positions
    expect(d.cellAt(0, 0).ch).toBe('h'.charCodeAt(0));        // body
    expect(d.cellAt(41, 1).ch).toBe('i'.charCodeAt(0));       // box interior
    // body text does not bleed into the box interior
    d.clearRegion();
    expect(d.lines[0]!.text).toBe(body);
  });
});
