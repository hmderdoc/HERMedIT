import { describe, it, expect } from 'vitest';
import { Document } from '../src/core/doc';
import { makeAttr } from '../src/core/attr';

describe('Message body export', () => {
  it('ends hard paragraphs with CRLF and omits CRLF on soft wraps', () => {
    var d = new Document(10);
    d.loadText('aaaa bbbb cccc\r\nsecond');
    var body = d.toMessageBody(false);
    // soft-wrapped prose is re-joined by readers; only hard breaks are CRLF
    expect(body).toBe('aaaa bbbb cccc\r\nsecond\r\n');
  });

  it('always terminates the final line', () => {
    var d = new Document(79);
    d.loadText('no trailing newline');
    expect(d.toMessageBody(false)).toBe('no trailing newline\r\n');
  });

  it('emits minimal Ctrl-A color runs', () => {
    var d = new Document(79);
    d.loadText('ab');
    d.lines[0]!.attr[0] = makeAttr(4, 0, true); // bright red 'a'
    d.lines[0]!.attr[1] = makeAttr(4, 0, true); // bright red 'b' (same run)
    expect(d.toMessageBody(true)).toBe('\x01H\x01Ra' + 'b\r\n');
  });

  it('freezes every row when art is present', () => {
    var d = new Document(20);
    d.loadText('word word word word word'); // wraps soft
    d.setArt(0, 4, { ch: 0xdb, attr: 7 });
    var body = d.toMessageBody(false);
    var rows = body.split('\r\n');
    // every emitted row is hard (trailing '' after final CRLF)
    expect(rows[rows.length - 1]).toBe('');
    expect(rows.length - 1).toBe(d.rowCount());
  });

  it('pads art rows below the prose', () => {
    var d = new Document(20);
    d.loadText('hi');
    d.setArt(4, 2, { ch: 0xdb, attr: 7 });
    var body = d.toMessageBody(false);
    expect(body).toBe('hi\r\n\r\n    \xdb\r\n');
  });

  it('trims trailing blanks but never past an art cell', () => {
    var d = new Document(20);
    d.loadText('hi        '); // trailing spaces
    d.setArt(6, 0, { ch: 0xb3, attr: 7 });
    var body = d.toMessageBody(false);
    expect(body).toBe('hi    \xb3\r\n');
  });

  it('emits art colors as Ctrl-A, never raw ANSI', () => {
    var d = new Document(20);
    d.setArt(0, 0, { ch: 0xdb, attr: makeAttr(2, 0, false) });
    var body = d.toMessageBody(true);
    expect(body).toBe('\x01G\xdb\r\n');
    expect(body.indexOf('\x1b')).toBe(-1);
  });
});

describe('ANSI + format detection', () => {
  it('toAnsiBody emits SGR colors with leading/trailing reset, no Ctrl-A', () => {
    var d = new Document(20);
    d.setArt(0, 0, { ch: 0xdb, attr: makeAttr(2, 0, false) }); // green block
    var body = d.toAnsiBody();
    expect(body.substring(0, 4)).toBe('\x1b[0m');           // leading reset
    expect(body.indexOf('\x1b[0;32;40m')).not.toBe(-1);      // green fg SGR
    expect(body.indexOf('\x01')).toBe(-1);                   // no Ctrl-A
    expect(body.charAt(body.length - 1)).toBe('m');          // ends with a reset
  });

  it('ANSI output uses no cursor positioning (line-by-line SGR)', () => {
    var d = new Document(20);
    d.loadText('hi');
    d.setArt(0, 2, { ch: 0xdb, attr: 7 });
    var body = d.toAnsiBody();
    expect(/\x1b\[[0-9;]*[HABCDf]/.test(body)).toBe(false); // no H/A/B/C/D/f moves
    expect(body.indexOf('\r\n')).not.toBe(-1);
  });

  it('counts art cells and prose for format detection', () => {
    var d = new Document(20);
    d.loadText('hello world'); // 10 non-space prose chars
    expect(d.proseCharCount()).toBe(10);
    expect(d.artCellCount()).toBe(0);
    d.setArt(1, 1, { ch: 0xdb, attr: 7 });
    d.setArt(2, 1, { ch: 0xdb, attr: 7 });
    expect(d.artCellCount()).toBe(2);
  });
});
