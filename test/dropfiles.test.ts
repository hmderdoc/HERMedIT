import { describe, it, expect } from 'vitest';
import { parseEditorInf, parseMsgInf, buildResultEd } from '../src/core/dropfiles';

describe('EDITOR.INF (WWIV-style)', () => {
  it('maps the six-line format', () => {
    var m = parseEditorInf(['My subject', 'Bob', '42', 'Alice', 'alice', '30']);
    expect(m.subject).toBe('My subject');
    expect(m.to).toBe('Bob');
    expect(m.from).toBe('Alice');
    expect(m.charset).toBe(''); // EDITOR.INF never declares one
    expect(m.source).toBe('editor.inf');
  });

  it('tolerates truncated files', () => {
    var m = parseEditorInf(['Only subject']);
    expect(m.subject).toBe('Only subject');
    expect(m.to).toBe('');
  });
});

describe('MSGINF (QuickBBS-style)', () => {
  it('maps the eight-line format including charset', () => {
    var m = parseMsgInf(['Alice', 'Bob', 'Subj', '1', 'General Chat', 'YES', 'tagline.txt', 'UTF-8']);
    expect(m.from).toBe('Alice');
    expect(m.to).toBe('Bob');
    expect(m.subject).toBe('Subj');
    expect(m.area).toBe('General Chat');
    expect(m.privateMsg).toBe(true);
    expect(m.charset).toBe('UTF-8');
  });

  it('defaults charset to empty on a 7-line legacy file', () => {
    var m = parseMsgInf(['A', 'B', 'S', '1', 'Area', 'NO', '']);
    expect(m.charset).toBe('');
    expect(m.privateMsg).toBe(false);
  });

  it('rejects junk charset values', () => {
    var m = parseMsgInf(['A', 'B', 'S', '1', 'Area', 'NO', '', 'KLINGON']);
    expect(m.charset).toBe('');
  });
});

describe('RESULT.ED', () => {
  it('writes status, subject, ident with CRLF', () => {
    expect(buildResultEd('New subject', 'Future Edit v0.1')).toBe('0\r\nNew subject\r\nFuture Edit v0.1\r\n');
  });
});
