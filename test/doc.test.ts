import { describe, it, expect } from 'vitest';
import { Document } from '../src/core/doc';

function textOf(doc: Document): string[] {
  var out: string[] = [];
  for (var i = 0; i < doc.lines.length; i++) out.push(doc.lines[i]!.text);
  return out;
}

describe('Document wrapping', () => {
  it('wraps long paragraphs after the space and is lossless on rejoin', () => {
    var d = new Document(10);
    d.loadText('aaaa bbbb cccc dddd');
    expect(d.lines.length).toBeGreaterThan(1);
    for (var i = 0; i < d.lines.length - 1; i++) {
      expect(d.lines[i]!.hardcr).toBe(false);
      expect(d.lines[i]!.text.length).toBeLessThanOrEqual(10);
    }
    expect(textOf(d).join('')).toBe('aaaa bbbb cccc dddd');
  });

  it('kludge-breaks words longer than the width', () => {
    var d = new Document(5);
    d.loadText('abcdefghij');
    expect(textOf(d)).toEqual(['abcde', 'fghij']);
  });

  it('keeps hard paragraph breaks distinct from soft wraps', () => {
    var d = new Document(40);
    d.loadText('para one\r\npara two');
    expect(d.lines.length).toBe(2);
    expect(d.lines[0]!.hardcr).toBe(true);
  });

  it('attributes follow their characters through reflow', () => {
    var d = new Document(10);
    d.loadText('aaaa bbbb cccc');
    // color the first 'c' (flat offset 10 -> line 1)
    var line1 = d.lines[1]!;
    var cIdx = line1.text.indexOf('c');
    line1.attr[cIdx] = 0x1f;
    // insert at very start to push everything right
    d.caret = { row: 0, col: 0 };
    d.insertChar('X'.charCodeAt(0));
    var flatText = textOf(d).join('');
    var flatAttr: number[] = [];
    for (var i = 0; i < d.lines.length; i++)
      for (var j = 0; j < d.lines[i]!.attr.length; j++) flatAttr.push(d.lines[i]!.attr[j]!);
    expect(flatText.charAt(flatAttr.indexOf(0x1f))).toBe('c');
  });
});

describe('Document editing', () => {
  it('insert advances the caret and rewraps', () => {
    var d = new Document(10);
    d.loadText('aaaa bbbb');
    d.caret = { row: 0, col: 4 };
    d.insertChar('!'.charCodeAt(0));
    expect(d.caret).toEqual({ row: 0, col: 5 });
    expect(textOf(d).join('')).toBe('aaaa! bbbb');
  });

  it('overwrite mode replaces instead of inserting', () => {
    var d = new Document(20);
    d.loadText('abc');
    d.insertMode = false;
    d.caret = { row: 0, col: 1 };
    d.insertChar('X'.charCodeAt(0));
    expect(d.lines[0]!.text).toBe('aXc');
  });

  it('enter splits into a new hard paragraph', () => {
    var d = new Document(20);
    d.loadText('hello world');
    d.caret = { row: 0, col: 5 };
    d.insertBreak();
    expect(textOf(d)).toEqual(['hello', ' world']);
    expect(d.lines[0]!.hardcr).toBe(true);
    expect(d.caret).toEqual({ row: 1, col: 0 });
  });

  it('backspace at column zero joins paragraphs', () => {
    var d = new Document(20);
    d.loadText('one\r\ntwo');
    d.caret = { row: 1, col: 0 };
    d.backspace();
    expect(textOf(d)).toEqual(['onetwo']);
    expect(d.caret).toEqual({ row: 0, col: 3 });
  });

  it('delete at end of hard line joins the next paragraph', () => {
    var d = new Document(20);
    d.loadText('one\r\ntwo');
    d.caret = { row: 0, col: 3 };
    d.deleteForward();
    expect(textOf(d)).toEqual(['onetwo']);
  });

  it('undo/redo reverses typing and drawing', () => {
    var d = new Document(20);
    d.loadText('abc');
    d.caret = { row: 0, col: 3 };
    d.insertChar('d'.charCodeAt(0));
    d.insertChar('e'.charCodeAt(0));
    d.setArt(1, 1, { ch: 0xdb, attr: 7 });
    expect(d.undo()).toBe(true); // draw undone
    expect(d.artAt(1, 1)).toBeNull();
    expect(d.undo()).toBe(true); // coalesced typing undone
    expect(d.lines[0]!.text).toBe('abc');
    expect(d.redo()).toBe(true);
    expect(d.lines[0]!.text).toBe('abcde');
  });
});

describe('Art overlay', () => {
  it('art cells stay fixed while text reflows', () => {
    var d = new Document(15);
    d.loadText('word word word word');
    d.setArt(3, 2, { ch: 0xb3, attr: 0x07 });
    d.caret = { row: 0, col: 0 };
    d.insertChar('X'.charCodeAt(0)); // shifts prose, must not shift art
    expect(d.artAt(3, 2)).toEqual({ ch: 0xb3, attr: 0x07 });
  });

  it('composes art over text and reports provenance', () => {
    var d = new Document(20);
    d.loadText('hello');
    d.setArt(1, 0, { ch: 0xdb, attr: 0x4e });
    expect(d.cellAt(1, 0)).toEqual({ ch: 0xdb, attr: 0x4e, isArt: true });
    expect(d.cellAt(0, 0).isArt).toBe(false);
    expect(d.cellAt(0, 0).ch).toBe('h'.charCodeAt(0));
  });

  it('erase removes only the addressed cell', () => {
    var d = new Document(20);
    d.setArt(1, 0, { ch: 0xdb, attr: 7 });
    d.setArt(2, 0, { ch: 0xdb, attr: 7 });
    d.eraseArt(1, 0);
    expect(d.artAt(1, 0)).toBeNull();
    expect(d.artAt(2, 0)).not.toBeNull();
  });

  it('rejects cells outside the document width', () => {
    var d = new Document(10);
    d.setArt(10, 0, { ch: 0xdb, attr: 7 });
    expect(d.artAt(10, 0)).toBeNull();
  });
});

describe('text range operations (copy/cut/paste support)', () => {
  it('extracts a single-line range', () => {
    var d = new Document(40);
    d.loadText('hello world');
    expect(d.getRangeText(0, 0, 0, 5)).toBe('hello');
    expect(d.getRangeText(0, 6, 0, 11)).toBe('world');
  });

  it('extracts across hard paragraph breaks with a newline', () => {
    var d = new Document(40);
    d.loadText('one\r\ntwo');
    expect(d.getRangeText(0, 0, 1, 3)).toBe('one\ntwo');
  });

  it('deletes a range and leaves the caret at the start', () => {
    var d = new Document(40);
    d.loadText('hello world');
    d.deleteRange(0, 5, 0, 11); // remove ' world'
    expect(d.lines[0]!.text).toBe('hello');
    expect(d.caret).toEqual({ row: 0, col: 5 });
  });

  it('inserts a string with embedded newlines', () => {
    var d = new Document(40);
    d.loadText('ac');
    d.caret = { row: 0, col: 1 };
    d.insertString('X\nY');
    expect(d.lines[0]!.text).toBe('aX');
    expect(d.lines[1]!.text).toBe('Yc');
  });

  it('round-trips a copy then paste', () => {
    var d = new Document(40);
    d.loadText('abcdef');
    var copied = d.getRangeText(0, 1, 0, 4); // 'bcd'
    d.caret = { row: 0, col: 6 };
    d.insertString(copied);
    expect(d.lines[0]!.text).toBe('abcdefbcd');
  });
});

import { applyColorChannel } from '../src/core/attr';

describe('recolorCell (art AND prose)', () => {
  it('recolors art cells per channel', () => {
    const doc = new Document(79);
    doc.setArt(2, 0, { ch: 0xdb, attr: 0x07 });
    expect(doc.recolorCell(2, 0, 0x4e, 'fg')).toBe(true);
    expect(doc.artAt(2, 0)!.attr).toBe(0x0e); // fg taken, bg kept
    expect(doc.recolorCell(2, 0, 0x40, 'bg')).toBe(true);
    expect(doc.artAt(2, 0)!.attr).toBe(0x4e);
  });

  it('recolors prose characters in the body', () => {
    const doc = new Document(79);
    doc.loadText('hello');
    expect(doc.recolorCell(1, 0, 0x4e, 'both')).toBe(true);
    expect(doc.lines[0]!.attr[1]).toBe(0x4e);
    expect(doc.lines[0]!.text).toBe('hello'); // glyphs untouched
  });

  it('recolors text inside a box flow and respects box masking', () => {
    const doc = new Document(79);
    doc.setRegion({ left: 5, top: 2, width: 20, height: 4 });
    doc.insertChar(0x41); // 'A' at box (0,0) -> doc (5,2)
    expect(doc.recolorCell(5, 2, 0x2f, 'both')).toBe(true);
    expect(doc.lines[0]!.attr[0]).toBe(0x2f);
    // empty cell inside the box masks the body: no-op, not a body recolor
    expect(doc.recolorCell(10, 3, 0x2f, 'both')).toBe(false);
  });

  it('returns false on empty cells and no-op recolors', () => {
    const doc = new Document(79);
    expect(doc.recolorCell(0, 0, 0x4e, 'both')).toBe(false);
    doc.loadText('x');
    expect(doc.recolorCell(0, 0, 0x07, 'both')).toBe(false); // same attr
  });

  it('applyColorChannel channel math', () => {
    expect(applyColorChannel(0x17, 0x4e, 'fg')).toBe(0x1e);
    expect(applyColorChannel(0x17, 0x4e, 'bg')).toBe(0x47);
    expect(applyColorChannel(0x17, 0x4e, 'both')).toBe(0x4e);
  });
});
