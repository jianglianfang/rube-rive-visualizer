import { describe, it, expect } from 'vitest';
import { ConvexDecomposer } from '../src/convexDecomposer.js';

/**
 * Helper: compute signed area of a polygon (positive = CCW, negative = CW).
 */
function signedArea(vertices) {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

/**
 * Helper: check if a polygon is convex by verifying all cross products have the same sign.
 */
function isConvex(vertices) {
  if (vertices.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const c = vertices[(i + 2) % vertices.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-10) continue;
    if (sign === 0) {
      sign = cross > 0 ? 1 : -1;
    } else if ((cross > 0 ? 1 : -1) !== sign) {
      return false;
    }
  }
  return true;
}

// === Test Shapes ===

/** CCW triangle */
const triangle = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 2, y: 3 },
];

/** CCW square */
const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

/** CCW regular hexagon */
const hexagon = (() => {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    verts.push({ x: 2 * Math.cos(angle), y: 2 * Math.sin(angle) });
  }
  return verts;
})();

/** CCW L-shape (concave) */
const lShape = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 4 },
  { x: 0, y: 4 },
];

/** CCW 5-pointed star (concave) */
const star = (() => {
  const verts = [];
  for (let i = 0; i < 5; i++) {
    // Outer point
    const outerAngle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    verts.push({ x: 3 * Math.cos(outerAngle), y: 3 * Math.sin(outerAngle) });
    // Inner point
    const innerAngle = outerAngle + Math.PI / 5;
    verts.push({ x: 1.2 * Math.cos(innerAngle), y: 1.2 * Math.sin(innerAngle) });
  }
  return verts;
})();

/** CCW convex polygon with >8 vertices (regular 12-gon) */
const dodecagon = (() => {
  const verts = [];
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    verts.push({ x: 5 * Math.cos(angle), y: 5 * Math.sin(angle) });
  }
  return verts;
})();

/** CW square (clockwise winding) */
const cwSquare = [
  { x: 0, y: 0 },
  { x: 0, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 0 },
];

describe('ConvexDecomposer', () => {
  const decomposer = new ConvexDecomposer();

  describe('signedArea()', () => {
    it('should return positive area for CCW polygon', () => {
      const area = decomposer.signedArea(square);
      expect(area).toBeGreaterThan(0);
      expect(area).toBeCloseTo(16, 5);
    });

    it('should return negative area for CW polygon', () => {
      const area = decomposer.signedArea(cwSquare);
      expect(area).toBeLessThan(0);
      expect(area).toBeCloseTo(-16, 5);
    });

    it('should return correct area for triangle', () => {
      const area = decomposer.signedArea(triangle);
      expect(area).toBeGreaterThan(0);
      expect(area).toBeCloseTo(6, 5);
    });

    it('should return correct area for hexagon', () => {
      const area = decomposer.signedArea(hexagon);
      expect(area).toBeGreaterThan(0);
      // Regular hexagon with radius 2: area = (3*sqrt(3)/2) * r^2 = 6*sqrt(3) ≈ 10.392
      expect(area).toBeCloseTo(6 * Math.sqrt(3), 3);
    });
  });

  describe('isConvex()', () => {
    it('should return true for a convex triangle', () => {
      expect(decomposer.isConvex(triangle)).toBe(true);
    });

    it('should return true for a convex square', () => {
      expect(decomposer.isConvex(square)).toBe(true);
    });

    it('should return true for a convex hexagon', () => {
      expect(decomposer.isConvex(hexagon)).toBe(true);
    });

    it('should return false for a concave L-shape', () => {
      expect(decomposer.isConvex(lShape)).toBe(false);
    });

    it('should return false for a concave star', () => {
      expect(decomposer.isConvex(star)).toBe(false);
    });

    it('should return true for CW convex polygon', () => {
      // CW square is still convex (just different winding)
      expect(decomposer.isConvex(cwSquare)).toBe(true);
    });
  });

  describe('ensureCCW()', () => {
    it('should return CCW polygon unchanged', () => {
      const result = decomposer.ensureCCW(square);
      expect(result).toEqual(square);
    });

    it('should reverse CW polygon to CCW', () => {
      const result = decomposer.ensureCCW(cwSquare);
      const area = decomposer.signedArea(result);
      expect(area).toBeGreaterThan(0);
    });
  });

  describe('decompose() — convex polygon passthrough', () => {
    it('should return triangle unchanged (3 vertices, convex)', () => {
      const result = decomposer.decompose(triangle);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(3);
      // Vertices should match
      for (let i = 0; i < 3; i++) {
        expect(result[0][i].x).toBeCloseTo(triangle[i].x, 5);
        expect(result[0][i].y).toBeCloseTo(triangle[i].y, 5);
      }
    });

    it('should return square unchanged (4 vertices, convex)', () => {
      const result = decomposer.decompose(square);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(4);
    });

    it('should return hexagon unchanged (6 vertices, convex, ≤8)', () => {
      const result = decomposer.decompose(hexagon);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(6);
    });
  });

  describe('decompose() — concave polygon decomposition', () => {
    it('should decompose L-shape into multiple convex polygons', () => {
      const result = decomposer.decompose(lShape);
      expect(result.length).toBeGreaterThan(1);
      // All outputs must be convex
      for (const poly of result) {
        expect(isConvex(poly)).toBe(true);
      }
    });

    it('should decompose star into all-convex outputs', () => {
      const result = decomposer.decompose(star);
      expect(result.length).toBeGreaterThan(1);
      for (const poly of result) {
        expect(isConvex(poly)).toBe(true);
      }
    });

    it('should produce CCW output for concave L-shape', () => {
      const result = decomposer.decompose(lShape);
      for (const poly of result) {
        expect(signedArea(poly)).toBeGreaterThan(0);
      }
    });

    it('should produce CCW output for concave star', () => {
      const result = decomposer.decompose(star);
      for (const poly of result) {
        expect(signedArea(poly)).toBeGreaterThan(0);
      }
    });

    it('should preserve total area for L-shape decomposition', () => {
      const inputArea = Math.abs(signedArea(lShape));
      const result = decomposer.decompose(lShape);
      const outputArea = result.reduce((sum, poly) => sum + Math.abs(signedArea(poly)), 0);
      expect(outputArea).toBeCloseTo(inputArea, 2);
    });

    it('should preserve total area for star decomposition', () => {
      const inputArea = Math.abs(signedArea(star));
      const result = decomposer.decompose(star);
      const outputArea = result.reduce((sum, poly) => sum + Math.abs(signedArea(poly)), 0);
      expect(outputArea).toBeCloseTo(inputArea, 2);
    });
  });

  describe('decompose() — vertex limit enforcement (>8 vertices)', () => {
    it('should split dodecagon (12 vertices) so all outputs have ≤8 vertices', () => {
      const result = decomposer.decompose(dodecagon);
      expect(result.length).toBeGreaterThanOrEqual(1);
      for (const poly of result) {
        expect(poly.length).toBeLessThanOrEqual(8);
        expect(poly.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should produce all-convex outputs for dodecagon', () => {
      const result = decomposer.decompose(dodecagon);
      for (const poly of result) {
        expect(isConvex(poly)).toBe(true);
      }
    });

    it('should produce all-CCW outputs for dodecagon', () => {
      const result = decomposer.decompose(dodecagon);
      for (const poly of result) {
        expect(signedArea(poly)).toBeGreaterThan(0);
      }
    });

    it('should preserve area for dodecagon', () => {
      const inputArea = Math.abs(signedArea(dodecagon));
      const result = decomposer.decompose(dodecagon);
      const outputArea = result.reduce((sum, poly) => sum + Math.abs(signedArea(poly)), 0);
      expect(outputArea).toBeCloseTo(inputArea, 1);
    });
  });

  describe('decompose() — degenerate inputs', () => {
    it('should throw for fewer than 3 vertices (empty)', () => {
      expect(() => decomposer.decompose([])).toThrow();
    });

    it('should throw for fewer than 3 vertices (1 vertex)', () => {
      expect(() => decomposer.decompose([{ x: 0, y: 0 }])).toThrow();
    });

    it('should throw for fewer than 3 vertices (2 vertices)', () => {
      expect(() => decomposer.decompose([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toThrow();
    });

    it('should throw for zero-area polygon (collinear points)', () => {
      const collinear = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ];
      expect(() => decomposer.decompose(collinear)).toThrow();
    });
  });

  describe('decompose() — CCW enforcement', () => {
    it('should produce CCW output from CW input', () => {
      const result = decomposer.decompose(cwSquare);
      expect(result).toHaveLength(1);
      const area = signedArea(result[0]);
      expect(area).toBeGreaterThan(0);
    });
  });

  describe('decompose() — output invariants for all shapes', () => {
    const testCases = [
      { name: 'triangle', shape: triangle },
      { name: 'square', shape: square },
      { name: 'hexagon', shape: hexagon },
      { name: 'L-shape', shape: lShape },
      { name: 'star', shape: star },
      { name: 'dodecagon', shape: dodecagon },
      { name: 'CW square', shape: cwSquare },
    ];

    for (const { name, shape } of testCases) {
      it(`${name}: all outputs should have 3-8 vertices`, () => {
        const result = decomposer.decompose(shape);
        for (const poly of result) {
          expect(poly.length).toBeGreaterThanOrEqual(3);
          expect(poly.length).toBeLessThanOrEqual(8);
        }
      });

      it(`${name}: all outputs should be convex`, () => {
        const result = decomposer.decompose(shape);
        for (const poly of result) {
          expect(isConvex(poly)).toBe(true);
        }
      });

      it(`${name}: all outputs should be CCW`, () => {
        const result = decomposer.decompose(shape);
        for (const poly of result) {
          expect(signedArea(poly)).toBeGreaterThan(0);
        }
      });
    }
  });
});
