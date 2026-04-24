/**
 * Property test: Missing Required Field Detection (JS)
 *
 * Feature: rube-rive-visualizer, Property 8: Missing Required Field Detection
 *
 * For any JSON object that is valid JSON but missing one or more required RUBE fields
 * (gravity, body array), the parser's validation SHALL report exactly the set of
 * missing required fields.
 *
 * Validates: Requirements 12.6
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RubeParser } from '../rubeParser.js';

describe('Feature: rube-rive-visualizer, Property 8: Missing Required Field Detection', () => {
  const parser = new RubeParser();

  const requiredFields = ['gravity', 'body'];

  it('reports exactly the set of missing required fields', () => {
    // Generate a subset of required fields to remove (at least one)
    const arbFieldsToRemove = fc.subarray(requiredFields, { minLength: 1 })
      .filter(arr => arr.length > 0);

    fc.assert(
      fc.property(arbFieldsToRemove, (fieldsToRemove) => {
        // Build a valid base object
        const data = {
          gravity: { x: 0, y: -10 },
          body: [{ fixture: [], position: 0 }],
        };

        // Remove selected fields
        for (const field of fieldsToRemove) {
          delete data[field];
        }

        const jsonStr = JSON.stringify(data);

        try {
          parser.parse(jsonStr);
          // Should have thrown
          expect.unreachable('Expected parser to throw for missing fields');
        } catch (e) {
          // Verify the error message mentions each missing field
          for (const field of fieldsToRemove) {
            expect(e.message).toContain(field);
          }
          // Verify it does NOT mention fields that are present
          for (const field of requiredFields) {
            if (!fieldsToRemove.includes(field)) {
              expect(e.message).not.toContain(field);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
