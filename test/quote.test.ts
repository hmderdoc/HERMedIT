import { describe, it, expect } from 'vitest';
import { authorInitials, quotePrefix, formatQuote } from '../src/core/quote';

describe('authorInitials', () => {
  it('takes up to three uppercase initials', () => {
    expect(authorInitials('Alice Bob')).toBe('AB');
    expect(authorInitials('alice b carol dave')).toBe('ABC');
    expect(authorInitials('Zaphod')).toBe('Z');
  });
  it('falls back to ? for empty', () => {
    expect(authorInitials('')).toBe('?');
    expect(authorInitials('   ')).toBe('?');
  });
});

describe('quotePrefix', () => {
  it('gives the classic > prefix', () => {
    expect(quotePrefix('gt', 'Alice')).toBe('> ');
  });
  it('gives an initials prefix', () => {
    expect(quotePrefix('initials', 'Alice Bob')).toBe(' AB> ');
  });
  it('gives no prefix for none', () => {
    expect(quotePrefix('none', 'Alice')).toBe('');
  });
});

describe('formatQuote', () => {
  it('prefixes each line with the gt style', () => {
    expect(formatQuote(['hi', 'there'], 'Alice', 'gt', false)).toEqual(['> hi', '> there']);
  });

  it('adds an attribution header when requested', () => {
    expect(formatQuote(['hi'], 'Alice', 'gt', true)).toEqual(['Alice wrote:', '> hi']);
  });

  it('nests an already-quoted line tightly', () => {
    expect(formatQuote(['> hi'], 'Alice', 'gt', false)).toEqual(['>> hi']);
  });

  it('uses initials for the initials style', () => {
    expect(formatQuote(['hi'], 'Alice Bob', 'initials', false)).toEqual([' AB> hi']);
  });

  it('leaves text raw for none', () => {
    expect(formatQuote(['hi'], 'Alice', 'none', false)).toEqual(['hi']);
  });
});
