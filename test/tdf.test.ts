import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTdf, renderTdf, tdfTypeName, COLOR_FONT } from '../src/core/tdf';

/** Read a bundled .tdf as a binary string (one char per byte). */
function loadFont(name: string): string {
  var buf = readFileSync(join(__dirname, '..', 'fonts', 'tdf', name + '.tdf'));
  var s = '';
  for (var i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]!);
  return s;
}

describe('parseTdf', () => {
  it('parses a bundled block font header', () => {
    var font = parseTdf(loadFont('block'));
    expect(font).not.toBeNull();
    expect(font!.height).toBeGreaterThan(0);
    expect(font!.glyphs.length).toBe(94);
    // 'A' (charlist index for 'A') has a glyph
    expect(font!.name.length).toBeGreaterThanOrEqual(0);
  });

  it('rejects non-font data', () => {
    expect(parseTdf('not a font at all, too short')).toBeNull();
    // right length, wrong magic
    var junk = '';
    for (var i = 0; i < 300; i++) junk += '\x00';
    expect(parseTdf(junk)).toBeNull();
  });
});

describe('renderTdf', () => {
  it('renders text to a grid matching the font height', () => {
    var font = parseTdf(loadFont('block'))!;
    var r = renderTdf(font, 'HI');
    expect(r.height).toBe(font.height);
    expect(r.rows.length).toBe(font.height);
    // every row has the same width
    for (var i = 0; i < r.rows.length; i++) expect(r.rows[i]!.length).toBe(r.width);
    // something got drawn (not all spaces)
    var inked = 0;
    for (var y = 0; y < r.rows.length; y++)
      for (var x = 0; x < r.rows[y]!.length; x++)
        if (r.rows[y]![x]!.ch !== 0x20) inked++;
    expect(inked).toBeGreaterThan(0);
  });

  it('wider text renders wider (length varies by content)', () => {
    var font = parseTdf(loadFont('block'))!;
    expect(renderTdf(font, 'WWWW').width).toBeGreaterThan(renderTdf(font, 'W').width);
  });

  it('unknown characters become blank columns, not a crash', () => {
    var font = parseTdf(loadFont('block'))!;
    var r = renderTdf(font, '\x01\x02'); // control chars, not in CHARLIST
    expect(r.rows.length).toBe(font.height);
  });
});

describe('tdfTypeName', () => {
  it('names the font types', () => {
    expect(tdfTypeName(0)).toBe('Outline');
    expect(tdfTypeName(1)).toBe('Block');
    expect(tdfTypeName(COLOR_FONT)).toBe('Color');
  });
});

import { layoutTdfWp, tdfWpCaretXY } from '../src/core/tdf';

describe('layoutTdfWp (word wrap)', () => {
  it('keeps short text on one line', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'HI', 1000, 0);
    expect(lay.lines.length).toBe(1);
    expect(lay.lines[0]!.text).toBe('HI');
  });

  it('wraps at the max width on word boundaries', () => {
    var font = parseTdf(loadFont('block'))!;
    // width of one word, force wrap by setting maxWidth to ~1 word
    var oneWord = layoutTdfWp(font, 'WWW', 100000, 0).width;
    var lay = layoutTdfWp(font, 'WWW WWW WWW', oneWord + 2, 0);
    expect(lay.lines.length).toBeGreaterThan(1);
    for (var i = 0; i < lay.lines.length; i++) expect(lay.lines[i]!.render.width).toBeLessThanOrEqual(oneWord + 2);
  });

  it('breaks hard at newlines', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'A\nB', 100000, 0);
    expect(lay.lines.length).toBe(2);
    expect(lay.lines[0]!.text).toBe('A');
    expect(lay.lines[1]!.text).toBe('B');
  });

  it('stacks lines by font height plus gap', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'A\nB', 100000, 1);
    expect(lay.lineHeight).toBe(font.height + 1);
    expect(lay.lines[1]!.yTop).toBe(font.height + 1);
  });
});

describe('tdfWpCaretXY', () => {
  it('maps caret start to origin', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'HI', 100000, 0);
    expect(tdfWpCaretXY(lay, 0)).toEqual({ x: 0, y: 0, line: 0 });
  });

  it('advances x across characters and drops to the next line', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'A\nB', 100000, 0);
    expect(tdfWpCaretXY(lay, 1).x).toBeGreaterThan(0); // after 'A'
    expect(tdfWpCaretXY(lay, 2).line).toBe(1);         // on 'B' line
  });
});

import { tdfWpHitTest } from '../src/core/tdf';

describe('tdfWpHitTest', () => {
  it('clicking before the first char lands at index 0', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'HI', 100000, 0);
    expect(tdfWpHitTest(lay, 0, 0)).toBe(0);
  });

  it('clicking far right lands at end of the line', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'HI', 100000, 0);
    expect(tdfWpHitTest(lay, 99999, 0)).toBe(2);
  });

  it('clicking on the second display line lands on that line', () => {
    var font = parseTdf(loadFont('block'))!;
    var lay = layoutTdfWp(font, 'A\nB', 100000, 0);
    var idx = tdfWpHitTest(lay, 0, font.height + 1);
    expect(idx).toBe(lay.lines[1]!.startIdx);
  });
});

import { layoutTdfWpStyled, TdfFont } from '../src/core/tdf';

describe('layoutTdfWpStyled (mixed-font word processor)', () => {
  function fontsFor(text: string, font: TdfFont): TdfFont[] {
    var out: TdfFont[] = [];
    for (var i = 0; i < text.length; i++) out.push(font);
    return out;
  }

  it('with a uniform font matches the single-font layout', () => {
    var font = parseTdf(loadFont('block'))!;
    var text = 'WWW WWW WWW\n\nHI';
    var oneWord = layoutTdfWp(font, 'WWW', 100000, 0).width;
    var a = layoutTdfWp(font, text, oneWord + 2, 1);
    var b = layoutTdfWpStyled(text, fontsFor(text, font), oneWord + 2, 1, font);
    expect(b.lines.length).toBe(a.lines.length);
    expect(b.width).toBe(a.width);
    expect(b.height).toBe(a.height);
    for (var i = 0; i < a.lines.length; i++) {
      expect(b.lines[i]!.text).toBe(a.lines[i]!.text);
      expect(b.lines[i]!.startIdx).toBe(a.lines[i]!.startIdx);
      expect(b.lines[i]!.yTop).toBe(a.lines[i]!.yTop);
      expect(b.lines[i]!.render.width).toBe(a.lines[i]!.render.width);
    }
  });

  it('a line with mixed fonts is as tall as its tallest, small font bottom-aligned', () => {
    var big = parseTdf(loadFont('block'))!;     // height 12
    var small = parseTdf(loadFont('4maxcol'))!; // height 4
    expect(big.height).toBeGreaterThan(small.height);
    var lay = layoutTdfWpStyled('AB', [big, small], 100000, 0, big);
    expect(lay.lines.length).toBe(1);
    var render = lay.lines[0]!.render;
    expect(render.height).toBe(big.height);
    // the small glyph's columns are blank above the bottom-aligned rows
    var b = render.charBounds[1]!;
    for (var y = 0; y < big.height - small.height; y++) {
      for (var x = b.start; x < b.start + b.width; x++) {
        expect(render.rows[y]![x]!.ch).toBe(0x20);
      }
    }
    // and something of the small glyph is inked in the bottom rows
    var inked = 0;
    for (var y2 = big.height - small.height; y2 < big.height; y2++) {
      for (var x2 = b.start; x2 < b.start + b.width; x2++) {
        if (render.rows[y2]![x2]!.ch !== 0x20) inked++;
      }
    }
    expect(inked).toBeGreaterThan(0);
  });

  it('lines stack by their own heights when fonts differ per paragraph', () => {
    var big = parseTdf(loadFont('block'))!;
    var small = parseTdf(loadFont('4maxcol'))!;
    // 'A\nB' with A big and B small ('\n' styled like A)
    var lay = layoutTdfWpStyled('A\nB', [big, big, small], 100000, 0, big);
    expect(lay.lines.length).toBe(2);
    expect(lay.lines[0]!.render.height).toBe(big.height);
    expect(lay.lines[1]!.render.height).toBe(small.height);
    expect(lay.lines[1]!.yTop).toBe(big.height);
    expect(lay.height).toBe(big.height + small.height);
    // hit-testing respects the variable line heights
    expect(tdfWpHitTest(lay, 0, 0)).toBe(0);
    expect(tdfWpHitTest(lay, 0, big.height)).toBe(lay.lines[1]!.startIdx);
  });

  it('wraps as one cohesive block across a font switch', () => {
    var big = parseTdf(loadFont('block'))!;
    var small = parseTdf(loadFont('4maxcol'))!;
    var text = 'AA AA AA';
    // first word big, the rest small
    var fonts = [big, big, big, small, small, small, small, small];
    var bigWord = layoutTdfWp(big, 'AA', 100000, 0).width;
    var smallTwo = layoutTdfWp(small, 'AA AA', 100000, 0).width;
    var maxW = Math.max(bigWord, smallTwo) + 1;
    var lay = layoutTdfWpStyled(text, fonts, maxW, 0, big);
    // the two small words fit together on a following line
    expect(lay.lines.length).toBe(2);
    expect(lay.lines[0]!.text).toBe('AA');
    expect(lay.lines[1]!.text).toBe('AA AA');
    expect(lay.lines[0]!.render.height).toBe(big.height);
    expect(lay.lines[1]!.render.height).toBe(small.height);
  });

  it('marks color-font cells with cf for per-cell attribute resolution', () => {
    var color = parseTdf(loadFont('block'))!; // bundled block.tdf is a Color-type font
    expect(color.fonttype).toBe(COLOR_FONT);
    var lay = layoutTdfWpStyled('A', [color], 100000, 0, color);
    var found = false;
    var rows = lay.lines[0]!.render.rows;
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y]!.length; x++) {
        if (rows[y]![x]!.ch !== 0x20) {
          expect(rows[y]![x]!.cf).toBe(true);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
});
