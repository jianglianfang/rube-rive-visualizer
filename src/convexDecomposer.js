/**
 * Decomposes concave polygons into convex sub-polygons suitable for Box2D.
 * Uses Bayazit's algorithm with an 8-vertex limit post-processing step.
 *
 * @module convexDecomposer
 */

const EPSILON = 1e-10;

/**
 * 2D cross product of vectors (b-a) and (c-b).
 * @param {import('./models.js').Vec2} a
 * @param {import('./models.js').Vec2} b
 * @param {import('./models.js').Vec2} c
 * @returns {number} Positive if CCW turn, negative if CW turn, ~0 if collinear
 */
function cross(a, b, c) {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

/**
 * Check if point p is strictly left of line from a to b (CCW).
 */
function isLeft(a, b, p) {
  return cross(a, b, p) > EPSILON;
}

/**
 * Check if point p is left of or on line from a to b.
 */
function isLeftOn(a, b, p) {
  return cross(a, b, p) >= -EPSILON;
}

/**
 * Check if point p is strictly right of line from a to b (CW).
 */
function isRight(a, b, p) {
  return cross(a, b, p) < -EPSILON;
}

/**
 * Check if point p is right of or on line from a to b.
 */
function isRightOn(a, b, p) {
  return cross(a, b, p) <= EPSILON;
}

/**
 * Squared distance between two points.
 */
function distSq(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Compute intersection point of line segments (p1,p2) and (p3,p4).
 * Returns null if segments are parallel.
 */
function lineIntersection(p1, p2, p3, p4) {
  const d = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(d) < EPSILON) return null;

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / d;
  return {
    x: p1.x + ua * (p2.x - p1.x),
    y: p1.y + ua * (p2.y - p1.y),
  };
}

/**
 * Check if vertex at index i is a reflex vertex in a CCW polygon.
 * A reflex vertex has a CW turn (cross product < 0 for CCW polygon).
 */
function isReflex(polygon, i) {
  const n = polygon.length;
  const prev = polygon[(i - 1 + n) % n];
  const curr = polygon[i];
  const next = polygon[(i + 1) % n];
  return isRight(prev, curr, next);
}

export class ConvexDecomposer {
  /**
   * Decompose a polygon into convex sub-polygons.
   * Each output polygon has ≤8 vertices and is counter-clockwise wound.
   *
   * @param {import('./models.js').Vec2[]} vertices - Input polygon vertices (≥3)
   * @returns {import('./models.js').Vec2[][]} Array of convex polygon vertex arrays
   * @throws {Error} If input has fewer than 3 vertices or is degenerate
   */
  decompose(vertices) {
    if (!vertices || vertices.length < 3) {
      throw new Error(`Polygon must have at least 3 vertices, got ${vertices ? vertices.length : 0}`);
    }

    // Check for zero-area (degenerate) polygon
    const area = this.signedArea(vertices);
    if (Math.abs(area) < EPSILON) {
      throw new Error('Polygon has zero area (degenerate)');
    }

    // Ensure CCW winding
    const ccwVertices = this.ensureCCW(vertices);

    // If already convex and ≤8 vertices, return as-is
    if (this.isConvex(ccwVertices) && ccwVertices.length <= 8) {
      return [ccwVertices.map(v => ({ x: v.x, y: v.y }))];
    }

    // Run Bayazit decomposition
    const convexParts = this._bayazitDecompose(ccwVertices.map(v => ({ x: v.x, y: v.y })));

    // Enforce 8-vertex limit on each part
    const result = [];
    for (const part of convexParts) {
      if (part.length > 8) {
        const subParts = this._enforceVertexLimit(part);
        result.push(...subParts);
      } else {
        result.push(part);
      }
    }

    return result;
  }

  /**
   * Check if a polygon is convex.
   * @param {import('./models.js').Vec2[]} vertices
   * @returns {boolean}
   */
  isConvex(vertices) {
    if (!vertices || vertices.length < 3) return false;

    let sign = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const c = vertices[(i + 2) % n];
      const cp = cross(a, b, c);
      if (Math.abs(cp) < EPSILON) continue; // skip collinear
      const s = cp > 0 ? 1 : -1;
      if (sign === 0) {
        sign = s;
      } else if (s !== sign) {
        return false;
      }
    }
    return true;
  }

  /**
   * Ensure polygon vertices are in counter-clockwise order.
   * @param {import('./models.js').Vec2[]} vertices
   * @returns {import('./models.js').Vec2[]} CCW-ordered vertices (may be reversed copy)
   */
  ensureCCW(vertices) {
    const area = this.signedArea(vertices);
    if (area < 0) {
      return [...vertices].reverse();
    }
    return vertices;
  }

  /**
   * Compute the signed area of a polygon using the shoelace formula.
   * Positive = CCW, Negative = CW.
   * @param {import('./models.js').Vec2[]} vertices
   * @returns {number}
   */
  signedArea(vertices) {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return area / 2;
  }

  /**
   * Bayazit decomposition: recursively split concave polygon at reflex vertices.
   * @param {import('./models.js').Vec2[]} polygon - CCW polygon
   * @returns {import('./models.js').Vec2[][]}
   */
  _bayazitDecompose(polygon) {
    const n = polygon.length;

    // Base case: already convex
    if (this.isConvex(polygon)) {
      return [polygon];
    }

    // Find a reflex vertex
    let reflexIdx = -1;
    for (let i = 0; i < n; i++) {
      if (isReflex(polygon, i)) {
        reflexIdx = i;
        break;
      }
    }

    if (reflexIdx === -1) {
      // No reflex vertex found — polygon is convex
      return [polygon];
    }

    // Try to find the best split from this reflex vertex
    const prev = polygon[(reflexIdx - 1 + n) % n];
    const curr = polygon[reflexIdx];
    const next = polygon[(reflexIdx + 1) % n];

    let bestDist = Infinity;
    let bestPoint = null;
    let bestIdx = -1;

    // Look for the best vertex or edge intersection to split toward
    for (let i = 0; i < n; i++) {
      if (i === reflexIdx || i === (reflexIdx - 1 + n) % n || i === (reflexIdx + 1) % n) {
        continue;
      }

      const p = polygon[i];

      // Check if this vertex is inside the reflex cone
      // The reflex cone is defined by the two edges meeting at the reflex vertex
      // For a valid split, the target must be visible from the reflex vertex
      if (isLeft(prev, curr, p) && isRightOn(next, curr, p)) {
        // This vertex is in the valid split region
        const d = distSq(curr, p);
        if (d < bestDist) {
          bestDist = d;
          bestPoint = p;
          bestIdx = i;
        }
      }
    }

    // If no direct vertex found, try edge intersections
    if (bestIdx === -1) {
      // Try intersecting the reflex vertex's bisector with polygon edges
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (i === reflexIdx || j === reflexIdx) continue;

        const edgeStart = polygon[i];
        const edgeEnd = polygon[j];

        // Try intersection with the line from prev through curr (extended)
        let ip = lineIntersection(prev, curr, edgeStart, edgeEnd);
        if (ip && isOnSegment(edgeStart, edgeEnd, ip) && isRight(prev, curr, ip)) {
          const d = distSq(curr, ip);
          if (d < bestDist) {
            bestDist = d;
            bestPoint = ip;
            bestIdx = -(i + 1); // negative to indicate edge intersection, store edge start index
          }
        }

        // Try intersection with the line from next through curr (extended)
        ip = lineIntersection(next, curr, edgeStart, edgeEnd);
        if (ip && isOnSegment(edgeStart, edgeEnd, ip) && isLeft(next, curr, ip)) {
          const d = distSq(curr, ip);
          if (d < bestDist) {
            bestDist = d;
            bestPoint = ip;
            bestIdx = -(i + 1);
          }
        }
      }
    }

    // If still no split point found, use a simpler approach:
    // Find any non-adjacent vertex that creates two valid sub-polygons
    if (!bestPoint) {
      for (let i = 0; i < n; i++) {
        if (i === reflexIdx || i === (reflexIdx - 1 + n) % n || i === (reflexIdx + 1) % n) {
          continue;
        }
        bestIdx = i;
        bestPoint = polygon[i];
        break;
      }
    }

    if (!bestPoint) {
      // Fallback: return as-is (shouldn't happen for valid polygons)
      return [polygon];
    }

    // Split the polygon into two parts
    let poly1, poly2;

    if (bestIdx >= 0) {
      // Split at a vertex
      poly1 = [];
      poly2 = [];

      // poly1: from reflexIdx to bestIdx (inclusive)
      let idx = reflexIdx;
      while (true) {
        poly1.push({ x: polygon[idx].x, y: polygon[idx].y });
        if (idx === bestIdx) break;
        idx = (idx + 1) % n;
      }

      // poly2: from bestIdx to reflexIdx (inclusive)
      idx = bestIdx;
      while (true) {
        poly2.push({ x: polygon[idx].x, y: polygon[idx].y });
        if (idx === reflexIdx) break;
        idx = (idx + 1) % n;
      }
    } else {
      // Split at an edge intersection point
      const edgeStartIdx = -(bestIdx + 1);
      const edgeEndIdx = (edgeStartIdx + 1) % n;

      poly1 = [];
      poly2 = [];

      // poly1: from reflexIdx, going forward, inserting bestPoint on the edge
      let idx = reflexIdx;
      while (true) {
        poly1.push({ x: polygon[idx].x, y: polygon[idx].y });
        if (idx === edgeStartIdx) {
          poly1.push({ x: bestPoint.x, y: bestPoint.y });
          break;
        }
        idx = (idx + 1) % n;
      }

      // poly2: from bestPoint, continuing from edgeEnd to reflexIdx
      poly2.push({ x: bestPoint.x, y: bestPoint.y });
      idx = edgeEndIdx;
      while (true) {
        poly2.push({ x: polygon[idx].x, y: polygon[idx].y });
        if (idx === reflexIdx) break;
        idx = (idx + 1) % n;
      }
    }

    // Recursively decompose both halves
    const result = [];
    if (poly1.length >= 3) {
      result.push(...this._bayazitDecompose(poly1));
    }
    if (poly2.length >= 3) {
      result.push(...this._bayazitDecompose(poly2));
    }

    return result;
  }

  /**
   * Post-process: split any convex polygon with >8 vertices into sub-polygons
   * using fan triangulation from centroid, then merge adjacent triangles.
   * Each output sub-polygon has the centroid + up to 6 consecutive edge vertices
   * + 1 closing edge vertex = 8 vertices max.
   * @param {import('./models.js').Vec2[]} convexPolygon
   * @returns {import('./models.js').Vec2[][]}
   */
  _enforceVertexLimit(convexPolygon) {
    const n = convexPolygon.length;
    if (n <= 8) return [convexPolygon];

    const result = [];

    // Compute centroid
    let cx = 0, cy = 0;
    for (const v of convexPolygon) {
      cx += v.x;
      cy += v.y;
    }
    cx /= n;
    cy /= n;
    const centroid = { x: cx, y: cy };

    // Create fan sub-polygons.
    // Each sub-polygon: centroid + consecutive edge vertices.
    // To form a closed fan slice we need: centroid, v[i], v[i+1], ..., v[i+k]
    // That's 1 + (k+1) vertices. For max 8: k+1 ≤ 7, so k ≤ 6.
    // Adjacent slices share one edge vertex to cover the full polygon.
    const maxEdgePerSlice = 7; // max edge vertices per slice (centroid + 7 = 8)
    const step = maxEdgePerSlice - 1; // overlap of 1 vertex between slices

    let i = 0;
    while (i < n) {
      const chunk = [];
      chunk.push({ x: centroid.x, y: centroid.y });

      // Take up to maxEdgePerSlice consecutive edge vertices
      const edgeCount = Math.min(maxEdgePerSlice, n - i + 1);
      for (let j = 0; j < edgeCount && (i + j) < n; j++) {
        chunk.push({ x: convexPolygon[i + j].x, y: convexPolygon[i + j].y });
      }

      // If this is the last slice and we started past 0, close back to vertex 0
      const lastEdgeIdx = i + edgeCount - 1;
      if (lastEdgeIdx >= n - 1 && i > 0) {
        // Add vertex 0 to close the fan
        if (chunk.length < 8) {
          chunk.push({ x: convexPolygon[0].x, y: convexPolygon[0].y });
        }
      }

      // Ensure CCW winding
      if (this.signedArea(chunk) < 0) {
        chunk.reverse();
      }

      if (chunk.length >= 3) {
        result.push(chunk);
      }

      i += step;
      // Prevent infinite loop: if step would not advance, break
      if (step <= 0) break;
    }

    return result;
  }
}

/**
 * Check if point p lies on segment (a, b).
 */
function isOnSegment(a, b, p) {
  const minX = Math.min(a.x, b.x) - EPSILON;
  const maxX = Math.max(a.x, b.x) + EPSILON;
  const minY = Math.min(a.y, b.y) - EPSILON;
  const maxY = Math.max(a.y, b.y) + EPSILON;
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}
