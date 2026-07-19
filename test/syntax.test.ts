import { describe, it, expect } from 'vitest';
import {
  highlightLine, highlightLines, initialHlState, langById,
  HL_DEFAULT, HL_KEYWORD, HL_STRING, HL_COMMENT, HL_NUMBER, HL_PREPROC
} from '../src/core/syntax';
import { Document } from '../src/core/doc';

function hl(lang: string, text: string, st = initialHlState()) {
  return highlightLine(text, st, langById(lang)!);
}

describe('syntax highlighting engine', () => {
  it('colors JavaScript keywords, strings, numbers, comments', () => {
    const a = hl('javascript', 'var x = "hi"; // done');
    expect(a[0]).toBe(HL_KEYWORD);  // v of var
    expect(a[4]).toBe(HL_DEFAULT);  // x
    expect(a[8]).toBe(HL_STRING);   // "
    expect(a[14]).toBe(HL_COMMENT); // //
    const n = hl('javascript', 'a = 0x1f + 42.5');
    expect(n[4]).toBe(HL_NUMBER);
    expect(n[11]).toBe(HL_NUMBER);
  });

  it('carries JS block comments and template strings across lines', () => {
    const def = langById('javascript')!;
    const st = initialHlState();
    highlightLine('foo(); /* start', st, def);
    const mid = highlightLine('still a comment', st, def);
    expect(mid[0]).toBe(HL_COMMENT);
    highlightLine('end */ var y', st, def);
    expect(st.block).toBe(-1);
    const st2 = initialHlState();
    highlightLine('var t = `multi', st2, def);
    const tmid = highlightLine('line template', st2, def);
    expect(tmid[5]).toBe(HL_STRING);
  });

  it('handles escaped quotes inside JS strings', () => {
    const a = hl('javascript', '"a\\"b" + c');
    expect(a[4]).toBe(HL_STRING); // b still in string
    expect(a[9]).toBe(HL_DEFAULT); // c outside
  });

  it('colors TypeScript-only keywords', () => {
    const a = hl('typescript', 'interface Foo {}');
    expect(a[0]).toBe(HL_KEYWORD);
    expect(hl('javascript', 'interface Foo {}')[0]).toBe(HL_DEFAULT);
  });

  it('handles Python # comments and triple-quoted strings across lines', () => {
    const a = hl('python', 'def f():  # comment');
    expect(a[0]).toBe(HL_KEYWORD);
    expect(a[10]).toBe(HL_COMMENT);
    const def = langById('python')!;
    const st = initialHlState();
    highlightLine('s = """doc', st, def);
    const mid = highlightLine('body', st, def);
    expect(mid[2]).toBe(HL_STRING);
    highlightLine('end"""', st, def);
    expect(st.mstr).toBe(-1);
  });

  it('colors C++ preprocessor directives and keywords', () => {
    const a = hl('cpp', '#include <stdio.h>');
    expect(a[0]).toBe(HL_PREPROC);
    expect(a[7]).toBe(HL_PREPROC);
    const b = hl('cpp', 'int main() { return 0; }');
    expect(b[0]).toBe(HL_KEYWORD);
    expect(b[13]).toBe(HL_KEYWORD); // return
  });

  it('handles Pascal case-insensitivity, { } comments, and quote doubling', () => {
    const a = hl('pascal', 'BEGIN WriteLn(1); END.');
    expect(a[0]).toBe(HL_KEYWORD);  // BEGIN despite case
    expect(a[6]).toBe(HL_KEYWORD);  // WriteLn
    const def = langById('pascal')!;
    const st = initialHlState();
    highlightLine('x := 1; { note', st, def);
    const mid = highlightLine('still note }y', st, def);
    expect(mid[0]).toBe(HL_COMMENT);
    expect(mid[12]).toBe(HL_DEFAULT); // y after }
    const s = hl('pascal', "s := 'it''s ok'; t");
    expect(s[8]).toBe(HL_STRING);   // inside despite ''
    expect(s[17]).toBe(HL_DEFAULT); // t outside
  });

  it('plain language highlights nothing', () => {
    const a = hl('plain', 'var x = "hi" // nope');
    for (const v of a) expect(v).toBe(HL_DEFAULT);
  });
});

describe('code block regions (doc integration)', () => {
  function codeDoc(lang: string) {
    const doc = new Document(79);
    doc.setRegion({ left: 1, top: 1, width: 40, height: 8 });
    doc.markRegionCode(lang);
    return doc;
  }

  function typeStr(doc: Document, s: string) {
    for (const ch of s) {
      if (ch === '\n') doc.insertBreak();
      else doc.insertChar(ch.charCodeAt(0));
    }
  }

  it('preformatted regions never wrap long lines', () => {
    const doc = codeDoc('javascript');
    typeStr(doc, 'let aaaaaaaa = 1; let bbbbbbbb = 2; x9');   // 37 chars < 40
    expect(doc.lines.length).toBe(1);
    // a normal box of the same size would have wrapped
    const norm = new Document(79);
    norm.setRegion({ left: 1, top: 1, width: 20, height: 8 });
    typeStr(norm, 'aaaa bbbb cccc dddd eeee ffff');
    expect(norm.lines.length).toBeGreaterThan(1);
  });

  it('typing is capped at the box width instead of wrapping or clipping', () => {
    const doc = codeDoc('javascript');
    let s = '';
    for (let i = 0; i < 50; i++) s += 'x';
    typeStr(doc, s);
    expect(doc.lines.length).toBe(1);
    expect(doc.lines[0]!.text.length).toBe(40); // capped at region width
  });

  it('highlightLines writes token colors into line attrs', () => {
    const doc = codeDoc('javascript');
    typeStr(doc, 'var s = "hi" // c');
    highlightLines(doc.lines, langById('javascript')!);
    const attr = doc.lines[0]!.attr;
    expect(attr[0]).toBe(HL_KEYWORD);
    expect(attr[8]).toBe(HL_STRING);
    expect(attr[13]).toBe(HL_COMMENT);
  });

  it('joining lines with backspace keeps them unwrapped', () => {
    const doc = codeDoc('python');
    typeStr(doc, 'abcdefghij\nklmnop');
    doc.caret = { row: 1, col: 0 };
    doc.backspace();
    expect(doc.lines.length).toBe(1);
    expect(doc.lines[0]!.text).toBe('abcdefghijklmnop');
  });

  it('code flags survive undo snapshots', () => {
    const doc = codeDoc('cpp');
    typeStr(doc, 'int x;');
    doc.undo();
    expect(doc.region!.pre).toBe(true);
    expect(doc.region!.lang).toBe('cpp');
  });
});

import { fenceTag, detectLanguage, resolveFenceLang } from '../src/core/syntax';

describe('fences and language auto-detection', () => {
  it('recognizes fence lines with and without tags', () => {
    expect(fenceTag('```')).toBe('');
    expect(fenceTag('```js')).toBe('js');
    expect(fenceTag('``` Python ')).toBe('python');
    expect(fenceTag('`` nope')).toBeNull();
    expect(fenceTag('x ```')).toBeNull();
  });

  it('resolves tag aliases', () => {
    expect(resolveFenceLang('js', []).id).toBe('javascript');
    expect(resolveFenceLang('py', []).id).toBe('python');
    expect(resolveFenceLang('c++', []).id).toBe('cpp');
    expect(resolveFenceLang('pas', []).id).toBe('pascal');
    expect(resolveFenceLang('nosuchlang', []).id).toBe('plain');
  });

  it('auto-detects each supported language from a sample', () => {
    expect(detectLanguage(['def main():', '    print("hi")', 'import os'])).toBe('python');
    expect(detectLanguage(['#include <stdio.h>', 'int main() { return 0; }'])).toBe('cpp');
    expect(detectLanguage(['program Hello;', 'begin', '  writeln(1);', 'end.'])).toBe('pascal');
    expect(detectLanguage(['const f = (x) => x + 1;', 'console.log(f(2));'])).toBe('javascript');
    expect(detectLanguage(['interface P { n: string; }', 'const x: number = 1;'])).toBe('typescript');
    expect(detectLanguage(['just some prose', 'nothing codey here'])).toBe('plain');
  });
});
