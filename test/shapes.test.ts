import { describe, it, expect } from 'vitest';
import {
  linePoints, lineGlyph, boxCells, rectFillPoints, ellipsePoints, floodFill,
  shapeToolAction, BOX_SINGLE
} from '../src/core/shapes';

function ev(button: number, press: boolean, release: boolean, motion: boolean) {
  return { button: button, press: press, release: release, motion: motion };
}

function key(p: { x: number; y: number }): string {
  return p.x + ',' + p.y;
}

describe('linePoints', () => {
  it('draws a horizontal run inclusive of both ends', () => {
    var pts = linePoints(2, 5, 5, 5);
    expect(pts.map(key)).toEqual(['2,5', '3,5', '4,5', '5,5']);
  });

  it('draws a vertical run', () => {
    expect(linePoints(3, 1, 3, 3).map(key)).toEqual(['3,1', '3,2', '3,3']);
  });

  it('draws a clean 45-degree diagonal', () => {
    expect(linePoints(0, 0, 3, 3).map(key)).toEqual(['0,0', '1,1', '2,2', '3,3']);
  });

  it('is contiguous for a shallow slope (no gaps)', () => {
    var pts = linePoints(0, 0, 6, 2);
    // one point per x column, endpoints correct
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 6, y: 2 });
    for (var i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i]!.x - pts[i - 1]!.x) <= 1).toBe(true);
      expect(Math.abs(pts[i]!.y - pts[i - 1]!.y) <= 1).toBe(true);
    }
  });
});

describe('lineGlyph', () => {
  it('uses box-drawing edges for axis-aligned lines', () => {
    expect(lineGlyph(2, 5, 5, 5, 0x41)).toBe(BOX_SINGLE.h);
    expect(lineGlyph(3, 1, 3, 3, 0x41)).toBe(BOX_SINGLE.v);
  });

  it('falls back to the brush glyph for diagonals', () => {
    expect(lineGlyph(0, 0, 3, 3, 0xdb)).toBe(0xdb);
  });
});

describe('boxCells', () => {
  it('draws corners and edges with CP437 box glyphs', () => {
    var cells = boxCells(0, 0, 3, 2);
    var at: { [k: string]: number } = {};
    for (var i = 0; i < cells.length; i++) at[key(cells[i]!)] = cells[i]!.ch;
    expect(at['0,0']).toBe(BOX_SINGLE.tl);
    expect(at['3,0']).toBe(BOX_SINGLE.tr);
    expect(at['0,2']).toBe(BOX_SINGLE.bl);
    expect(at['3,2']).toBe(BOX_SINGLE.br);
    expect(at['1,0']).toBe(BOX_SINGLE.h);
    expect(at['0,1']).toBe(BOX_SINGLE.v);
    // interior is not part of the border
    expect(at['1,1']).toBeUndefined();
  });

  it('accepts corners in any order', () => {
    expect(boxCells(3, 2, 0, 0).length).toBe(boxCells(0, 0, 3, 2).length);
  });

  it('collapses to a line when one dimension is zero', () => {
    var h = boxCells(0, 0, 4, 0);
    expect(h.length).toBe(5);
    expect(h.every((c) => c.ch === BOX_SINGLE.h)).toBe(true);
  });
});

describe('rectFillPoints', () => {
  it('returns every interior+border cell', () => {
    expect(rectFillPoints(0, 0, 2, 1).length).toBe(6);
  });
});

describe('ellipsePoints', () => {
  it('stays within the bounding box and is centered', () => {
    var pts = ellipsePoints(0, 0, 10, 6);
    for (var i = 0; i < pts.length; i++) {
      expect(pts[i]!.x).toBeGreaterThanOrEqual(0);
      expect(pts[i]!.x).toBeLessThanOrEqual(10);
      expect(pts[i]!.y).toBeGreaterThanOrEqual(0);
      expect(pts[i]!.y).toBeLessThanOrEqual(6);
    }
    // extremes are touched
    var xs = pts.map((p) => p.x);
    var ys = pts.map((p) => p.y);
    expect(Math.min.apply(null, xs)).toBe(0);
    expect(Math.max.apply(null, xs)).toBe(10);
    expect(Math.min.apply(null, ys)).toBe(0);
    expect(Math.max.apply(null, ys)).toBe(6);
  });

  it('has no duplicate points', () => {
    var pts = ellipsePoints(0, 0, 8, 8);
    var seen: { [k: string]: boolean } = {};
    for (var i = 0; i < pts.length; i++) {
      expect(seen[key(pts[i]!)]).toBeUndefined();
      seen[key(pts[i]!)] = true;
    }
  });
});

describe('floodFill', () => {
  // 5x3 grid; '#' is wall, '.' is open. Fill the open pocket left of the wall.
  var grid = [
    '..#..',
    '..#..',
    '..#..'
  ];
  var sample = (x: number, y: number): string => (grid[y] as string).charAt(x);

  it('fills the contiguous region up to the walls', () => {
    var filled = floodFill(0, 0, 5, 3, sample);
    // left pocket is columns 0-1 across all 3 rows = 6 cells
    expect(filled.length).toBe(6);
    for (var i = 0; i < filled.length; i++) expect(filled[i]!.x).toBeLessThan(2);
  });

  it('does not cross a wall into the other side', () => {
    var filled = floodFill(0, 0, 5, 3, sample);
    expect(filled.some((p) => p.x > 2)).toBe(false);
  });

  it('respects the cell cap', () => {
    var open = (): string => '.';
    expect(floodFill(0, 0, 100, 100, open, 50).length).toBe(50);
  });

  it('returns nothing for an out-of-bounds start', () => {
    expect(floodFill(-1, 0, 5, 3, sample)).toEqual([]);
  });
});

describe('shapeToolAction (two-point tool state machine)', () => {
  it('a real button-down with no anchor sets the start point', () => {
    // press=true, motion=false, left button
    expect(shapeToolAction(ev(0, true, false, false), false, false)).toBe('set-anchor');
  });

  it('a DRAG tick (press=true AND motion=true) previews, never re-anchors', () => {
    // This is the exact bug: SGR motion reports carry press=true. It must be
    // treated as motion, not a fresh press that resets the anchor.
    expect(shapeToolAction(ev(0, true, false, true), true, false)).toBe('preview');
  });

  it('a drag with no anchor yet does nothing', () => {
    expect(shapeToolAction(ev(0, true, false, true), false, false)).toBe('none');
  });

  it('release away from the start commits (drag-release)', () => {
    expect(shapeToolAction(ev(0, false, true, false), true, false)).toBe('commit');
  });

  it('release on the start cell keeps the anchor (it was just a click)', () => {
    expect(shapeToolAction(ev(0, false, true, false), true, true)).toBe('none');
  });

  it('a second button-down with an anchor commits (click-move-click)', () => {
    expect(shapeToolAction(ev(0, true, false, false), true, false)).toBe('commit');
  });

  it('right-button-down cancels, middle-button-down eyedrops', () => {
    expect(shapeToolAction(ev(2, true, false, false), true, false)).toBe('cancel');
    expect(shapeToolAction(ev(1, true, false, false), false, false)).toBe('eyedrop');
  });

  it('drives a full drag: down -> preview -> preview -> commit', () => {
    expect(shapeToolAction(ev(0, true, false, false), false, false)).toBe('set-anchor');
    expect(shapeToolAction(ev(0, true, false, true), true, false)).toBe('preview');
    expect(shapeToolAction(ev(0, true, false, true), true, false)).toBe('preview');
    expect(shapeToolAction(ev(0, false, true, false), true, false)).toBe('commit');
  });
});

import { halfBlockLineCells, halfBlockBoxCells, ellipseFillPoints, HALF } from '../src/core/shapes';

describe('halfBlockLineCells', () => {
  it('renders a horizontal line as upper half blocks', () => {
    const cells = halfBlockLineCells(0, 0, 4, 0);
    expect(cells.length).toBe(5);
    for (const c of cells) expect(c.ch).toBe(HALF.top);
  });

  it('renders a vertical line as full blocks with a half end', () => {
    const cells = halfBlockLineCells(0, 0, 0, 2);
    // subpixels y 0..4: cells 0 (both), 1 (both), 2 (top only)
    expect(cells.length).toBe(3);
    expect(cells[0]!.ch).toBe(HALF.full);
    expect(cells[1]!.ch).toBe(HALF.full);
    expect(cells[2]!.ch).toBe(HALF.top);
  });

  it('a shallow diagonal steps through half blocks', () => {
    const cells = halfBlockLineCells(0, 0, 3, 1);
    // must touch all four columns and use at least one non-full glyph
    const xs: { [x: number]: boolean } = {};
    let nonFull = false;
    for (const c of cells) {
      xs[c.x] = true;
      if (c.ch !== HALF.full) nonFull = true;
    }
    expect(Object.keys(xs).length).toBe(4);
    expect(nonFull).toBe(true);
  });
});

describe('halfBlockBoxCells', () => {
  it('draws thin edges: top/bottom halves and side halves', () => {
    const cells = halfBlockBoxCells(0, 0, 4, 3);
    const at = (x: number, y: number): number => {
      for (const c of cells) if (c.x === x && c.y === y) return c.ch;
      return -1;
    };
    expect(at(0, 0)).toBe(HALF.top);
    expect(at(2, 0)).toBe(HALF.top);
    expect(at(2, 3)).toBe(HALF.bottom);
    expect(at(0, 1)).toBe(HALF.left);
    expect(at(4, 2)).toBe(HALF.right);
  });

  it('degenerate boxes collapse to half rows/columns', () => {
    expect(halfBlockBoxCells(1, 1, 4, 1).every(c => c.ch === HALF.top)).toBe(true);
    expect(halfBlockBoxCells(1, 1, 1, 4).every(c => c.ch === HALF.left)).toBe(true);
  });
});

describe('ellipseFillPoints', () => {
  it('fills the interior of a circle-ish ellipse', () => {
    const pts = ellipseFillPoints(0, 0, 8, 8);
    // contains the center, excludes the bounding-box corner
    expect(pts.some(p => p.x === 4 && p.y === 4)).toBe(true);
    expect(pts.some(p => p.x === 0 && p.y === 0)).toBe(false);
    // interior is smaller than the full bounding box
    expect(pts.length).toBeLessThan(81);
    expect(pts.length).toBeGreaterThan(30);
  });

  it('degenerate boxes yield nothing to fill', () => {
    expect(ellipseFillPoints(2, 2, 2, 5).length).toBe(0);
    expect(ellipseFillPoints(2, 2, 2, 2).length).toBe(0);
  });
});
