import { describe, it, expect } from 'vitest';
import { classifyCsi } from '../src/host/input';

// Synchronet KEY_* control chars (key_defs.js) the controller compares against.
var KEY_UP = '\x1e';
var KEY_DOWN = '\x0a';
var KEY_RIGHT = '\x06';
var KEY_LEFT = '\x1d';
var KEY_HOME = '\x02';
var KEY_END = '\x05';
var KEY_INSERT = '\x16';
var KEY_DEL = '\x7f';
var KEY_PAGEUP = '\x10';
var KEY_PAGEDN = '\x0e';

describe('CSI edit/navigation key decoding', () => {
  it('decodes the Delete key (CSI 3~) — the reported leak-through', () => {
    expect(classifyCsi('3~')).toEqual({ type: 'key', key: KEY_DEL });
  });

  it('decodes the other tilde edit/nav keys', () => {
    expect(classifyCsi('1~')).toEqual({ type: 'key', key: KEY_HOME });
    expect(classifyCsi('2~')).toEqual({ type: 'key', key: KEY_INSERT });
    expect(classifyCsi('4~')).toEqual({ type: 'key', key: KEY_END });
    expect(classifyCsi('5~')).toEqual({ type: 'key', key: KEY_PAGEUP });
    expect(classifyCsi('6~')).toEqual({ type: 'key', key: KEY_PAGEDN });
  });

  it('decodes back-tab (CSI Z) as Shift+Tab', () => {
    expect(classifyCsi('Z')).toEqual({ type: 'key', key: 'STAB' });
  });

  it('decodes the letter-form cursor keys', () => {
    expect(classifyCsi('A')).toEqual({ type: 'key', key: KEY_UP });
    expect(classifyCsi('B')).toEqual({ type: 'key', key: KEY_DOWN });
    expect(classifyCsi('C')).toEqual({ type: 'key', key: KEY_RIGHT });
    expect(classifyCsi('D')).toEqual({ type: 'key', key: KEY_LEFT });
    expect(classifyCsi('H')).toEqual({ type: 'key', key: KEY_HOME });
    expect(classifyCsi('F')).toEqual({ type: 'key', key: KEY_END });
  });

  it('still decodes function keys (CSI nn ~)', () => {
    expect(classifyCsi('11~')).toEqual({ type: 'key', key: 'F1' });
    expect(classifyCsi('24~')).toEqual({ type: 'key', key: 'F12' });
  });

  it('decodes an SGR mouse press', () => {
    var ev = classifyCsi('<0;10;5M');
    expect(ev.type).toBe('mouse');
    if (ev.type === 'mouse') {
      expect(ev.x).toBe(10);
      expect(ev.y).toBe(5);
      expect(ev.press).toBe(true);
      expect(ev.button).toBe(0);
    }
  });

  it('swallows unrecognized chatter instead of emitting garbage', () => {
    expect(classifyCsi('?1;2c')).toEqual({ type: 'none' }); // device attributes
    expect(classifyCsi('99~')).toEqual({ type: 'none' });
  });
});

describe('modified-key decoding (character-set cycling)', () => {
  it('decodes CSI-u (fixterms) Ctrl+comma/period/slash', () => {
    expect(classifyCsi('44;5u')).toEqual({ type: 'key', key: 'C-,' });
    expect(classifyCsi('46;5u')).toEqual({ type: 'key', key: 'C-.' });
    expect(classifyCsi('47;5u')).toEqual({ type: 'key', key: 'C-/' });
  });

  it('decodes xterm modifyOtherKeys (CSI 27;mods;code~)', () => {
    expect(classifyCsi('27;5;44~')).toEqual({ type: 'key', key: 'C-,' });
    expect(classifyCsi('27;5;46~')).toEqual({ type: 'key', key: 'C-.' });
  });

  it('accepts Ctrl combined with other modifiers (e.g. Ctrl+Shift)', () => {
    expect(classifyCsi('44;6u')).toEqual({ type: 'key', key: 'C-,' });
  });

  it('drops the same keys without Ctrl, and unrelated modified keys', () => {
    expect(classifyCsi('44;2u')).toEqual({ type: 'none' }); // Shift+, only
    expect(classifyCsi('65;5u')).toEqual({ type: 'none' }); // Ctrl+A (has a real byte)
    expect(classifyCsi('27;2;44~')).toEqual({ type: 'none' });
  });
});
