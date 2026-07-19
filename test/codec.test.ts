import { describe, it, expect } from 'vitest';
import { ctrlATransition, ansiFromAttr, makeAttr, applyColorChannel, HIGH, BLINK } from '../src/core/attr';
import { CP437_UNICODE, cp437ToUtf8, utf8ToCp437, encodeUtf8, displayChar } from '../src/core/cp437';

describe('Ctrl-A transitions (message body colors)', () => {
  it('emits nothing when the attribute is unchanged', () => {
    expect(ctrlATransition(7, 7)).toBe('');
  });

  it('sets foreground with a single code', () => {
    expect(ctrlATransition(7, 4)).toBe('\x01R');
  });

  it('sets high intensity before color', () => {
    expect(ctrlATransition(7, 4 | HIGH)).toBe('\x01H\x01R');
  });

  it('clears high intensity with a normal reset first', () => {
    // 7|HIGH -> 7 requires \x01N (no direct un-bright code exists)
    expect(ctrlATransition(7 | HIGH, 7)).toBe('\x01N');
  });

  it('reapplies attributes lost by the reset', () => {
    // bright red on blue -> plain red on blue: reset kills the background too
    var from = makeAttr(4, 1, true);
    var to = makeAttr(4, 1, false);
    expect(ctrlATransition(from, to)).toBe('\x01N\x01R\x014');
  });

  it('handles blink', () => {
    expect(ctrlATransition(7, 7 | BLINK)).toBe('\x01I');
    expect(ctrlATransition(7 | BLINK, 7)).toBe('\x01N');
  });

  it('never emits raw ANSI into a message body', () => {
    for (var a = 0; a < 256; a++) {
      expect(ctrlATransition(7, a).indexOf('\x1b')).toBe(-1);
    }
  });
});

describe('ANSI SGR for the live terminal', () => {
  it('always starts from a reset so diffs cannot inherit state', () => {
    expect(ansiFromAttr(7)).toBe('\x1b[0;37;40m');
    expect(ansiFromAttr(makeAttr(4, 1, true))).toBe('\x1b[0;1;31;44m');
    expect(ansiFromAttr(7 | BLINK)).toBe('\x1b[0;5;37;40m');
  });
});

describe('CP437 codec', () => {
  it('has one mapping per byte value', () => {
    expect(CP437_UNICODE.length).toBe(256);
  });

  it('maps the classic box/block glyphs', () => {
    expect(CP437_UNICODE[0xb3]).toBe(0x2502); // │
    expect(CP437_UNICODE[0xc4]).toBe(0x2500); // ─
    expect(CP437_UNICODE[0xdb]).toBe(0x2588); // █
    expect(CP437_UNICODE[0xb0]).toBe(0x2591); // ░
  });

  it('round-trips box glyphs through UTF-8', () => {
    var art = '\xb3\xc4\xdb\xb0 plain text';
    var utf8 = cp437ToUtf8(art);
    expect(utf8ToCp437(utf8)).toEqual({ text: art, lost: 0 });
  });

  it('passes Ctrl-A codes through UTF-8 transcoding untouched', () => {
    expect(cp437ToUtf8('\x01R red \x01N')).toBe('\x01R red \x01N');
  });

  it('encodes multibyte boundaries correctly', () => {
    expect(encodeUtf8(0x7f)).toBe('\x7f');
    expect(encodeUtf8(0x80)).toBe('\xc2\x80');
    expect(encodeUtf8(0x800)).toBe('\xe0\xa0\x80');
  });

  it('reports unrepresentable codepoints instead of dropping them silently', () => {
    // U+1F600 emoji has no CP437 glyph
    var res = utf8ToCp437('\xf0\x9f\x98\x80ok');
    expect(res.text).toBe('?ok');
    expect(res.lost).toBe(1);
  });

  it('never sends raw control bytes to a CP437 terminal', () => {
    expect(displayChar(0x01, false)).toBe(' ');
    expect(displayChar(0x01, true)).toBe(encodeUtf8(0x263a));
    expect(displayChar(0xb3, false)).toBe('\xb3');
  });
});

describe('applyColorChannel (recolor brush)', () => {
  it('fg keeps the background, takes the foreground+bright', () => {
    // existing: bright-red on blue (0x1c); brush: green on black (0x02)
    expect(applyColorChannel(0x1c, 0x02, 'fg')).toBe(0x12); // bg blue kept, fg green
  });
  it('bg keeps the foreground, takes the background+blink', () => {
    expect(applyColorChannel(0x1c, 0x40, 'bg')).toBe(0x4c); // fg bright-red kept, bg red
  });
  it('both replaces the whole attribute', () => {
    expect(applyColorChannel(0x1c, 0x2a, 'both')).toBe(0x2a);
  });
  it('never changes the glyph (attribute-only by construction)', () => {
    // sanity: fg then bg composed equals a full replace of both nibbles
    var afterFg = applyColorChannel(0x07, 0x4b, 'fg');
    var afterBoth = applyColorChannel(afterFg, 0x4b, 'bg');
    expect(afterBoth).toBe(0x4b);
  });
});
