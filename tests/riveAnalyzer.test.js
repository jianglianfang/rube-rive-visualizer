/**
 * Unit tests for RiveAnalyzer.
 *
 * Uses mock Rive runtime objects to test ViewModel enumeration logic.
 *
 * Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 12.1, 12.2
 *
 * @module riveAnalyzer.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiveAnalyzer, validateRivExtension } from '../src/riveAnalyzer.js';

// =====================================================================
// File Extension Validation
// =====================================================================

describe('validateRivExtension', () => {
  it('should accept .riv extension', () => {
    expect(validateRivExtension('test.riv')).toBe(true);
  });

  it('should accept .RIV extension (case-insensitive)', () => {
    expect(validateRivExtension('test.RIV')).toBe(true);
  });

  it('should accept .Riv extension (mixed case)', () => {
    expect(validateRivExtension('test.Riv')).toBe(true);
  });

  it('should reject .json extension', () => {
    expect(validateRivExtension('test.json')).toBe(false);
  });

  it('should reject .txt extension', () => {
    expect(validateRivExtension('test.txt')).toBe(false);
  });

  it('should reject file with no extension', () => {
    expect(validateRivExtension('testfile')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(validateRivExtension('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(validateRivExtension(null)).toBe(false);
    expect(validateRivExtension(undefined)).toBe(false);
  });

  it('should accept file with path and .riv extension', () => {
    expect(validateRivExtension('path/to/file.riv')).toBe(true);
  });

  it('should reject .riv in middle of filename', () => {
    expect(validateRivExtension('file.riv.json')).toBe(false);
  });

  it('should accept just .riv', () => {
    expect(validateRivExtension('.riv')).toBe(true);
  });
});

// =====================================================================
// RiveAnalyzer class
// =====================================================================

describe('RiveAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new RiveAnalyzer();
    // Clean up any global mock
    delete globalThis.rive;
  });

  describe('_enumerateTransformProperties', () => {
    it('should return empty array for null ViewModel', () => {
      expect(analyzer._enumerateTransformProperties(null)).toEqual([]);
    });

    it('should return empty array for ViewModel with no properties', () => {
      const vm = { properties: [] };
      expect(analyzer._enumerateTransformProperties(vm)).toEqual([]);
    });

    it('should find viewModel-type properties as transform properties', () => {
      const vm = {
        properties: [
          { name: 't1', type: 'viewModel' },
          { name: 't2', type: 'viewModel' },
          { name: 'color', type: 'number' },
        ],
      };
      expect(analyzer._enumerateTransformProperties(vm)).toEqual(['t1', 't2']);
    });

    it('should skip non-transform properties', () => {
      const vm = {
        properties: [
          { name: 'score', type: 'number' },
          { name: 'label', type: 'string' },
          { name: 'visible', type: 'boolean' },
        ],
      };
      expect(analyzer._enumerateTransformProperties(vm)).toEqual([]);
    });

    it('should handle ViewModel without properties field', () => {
      const vm = {};
      expect(analyzer._enumerateTransformProperties(vm)).toEqual([]);
    });
  });

  describe('_extractComponentBounds', () => {
    it('should return a BoundComponent with AABB fallback', () => {
      const mockRive = {};
      const comp = analyzer._extractComponentBounds(mockRive, 't1', 800, 600);

      expect(comp).not.toBeNull();
      expect(comp.vmPropertyName).toBe('t1');
      expect(comp.componentName).toBe('t1');
      expect(comp.isBoundingBox).toBe(true);
      expect(comp.width).toBeGreaterThan(0);
      expect(comp.height).toBeGreaterThan(0);
      expect(comp.center.x).toBe(400);
      expect(comp.center.y).toBe(300);
      expect(comp.vertices).toHaveLength(4);
    });

    it('should use artboard dimensions for center calculation', () => {
      const mockRive = {};
      const comp = analyzer._extractComponentBounds(mockRive, 't1', 1000, 500);

      expect(comp.center.x).toBe(500);
      expect(comp.center.y).toBe(250);
    });
  });

  describe('analyze (with mock Rive runtime)', () => {
    it('should throw if Rive runtime not available', async () => {
      delete globalThis.rive;
      const buffer = new ArrayBuffer(10);
      const canvas = {};

      await expect(analyzer.analyze(buffer, canvas)).rejects.toThrow('Rive runtime not available');
    });

    it('should handle .riv with no ViewModel (INFO notice)', async () => {
      // Mock Rive runtime that loads but has no ViewModel
      globalThis.rive = {
        Rive: class MockRive {
          constructor(opts) {
            setTimeout(() => {
              this.bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
              this.viewModelByName = () => null;
              this.defaultViewModel = () => null;
              opts.onLoad();
            }, 0);
          }
        },
      };

      const buffer = new ArrayBuffer(10);
      const canvas = {};
      const result = await analyzer.analyze(buffer, canvas);

      expect(result.components).toHaveLength(0);
      expect(result.artboardWidth).toBe(800);
      expect(result.artboardHeight).toBe(600);
      expect(result.warnings).toContain('No ViewModel data binding found');
    });

    it('should handle ViewModel with no transform properties (INFO notice)', async () => {
      globalThis.rive = {
        Rive: class MockRive {
          constructor(opts) {
            setTimeout(() => {
              this.bounds = { minX: 0, minY: 0, maxX: 400, maxY: 400 };
              this.viewModelByName = (name) => {
                if (name === 'world') {
                  return {
                    properties: [
                      { name: 'score', type: 'number' },
                    ],
                  };
                }
                return null;
              };
              opts.onLoad();
            }, 0);
          }
        },
      };

      const buffer = new ArrayBuffer(10);
      const canvas = {};
      const result = await analyzer.analyze(buffer, canvas);

      expect(result.components).toHaveLength(0);
      expect(result.warnings).toContain('No transform-type properties found in ViewModel');
    });

    it('should extract components from ViewModel with transform properties', async () => {
      globalThis.rive = {
        Rive: class MockRive {
          constructor(opts) {
            setTimeout(() => {
              this.bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
              this.viewModelByName = (name) => {
                if (name === 'world') {
                  return {
                    properties: [
                      { name: 't1', type: 'viewModel' },
                      { name: 't2', type: 'viewModel' },
                    ],
                  };
                }
                return null;
              };
              opts.onLoad();
            }, 0);
          }
        },
      };

      const buffer = new ArrayBuffer(10);
      const canvas = {};
      const result = await analyzer.analyze(buffer, canvas);

      expect(result.components).toHaveLength(2);
      expect(result.components[0].vmPropertyName).toBe('t1');
      expect(result.components[1].vmPropertyName).toBe('t2');
      expect(result.artboardWidth).toBe(800);
      expect(result.artboardHeight).toBe(600);
    });

    it('should handle Rive load error', async () => {
      globalThis.rive = {
        Rive: class MockRive {
          constructor(opts) {
            setTimeout(() => {
              opts.onLoadError('corrupt file');
            }, 0);
          }
        },
      };

      const buffer = new ArrayBuffer(10);
      const canvas = {};
      await expect(analyzer.analyze(buffer, canvas)).rejects.toThrow('Rive load error');
    });

    it('should correctly extract artboard dimensions', async () => {
      globalThis.rive = {
        Rive: class MockRive {
          constructor(opts) {
            setTimeout(() => {
              this.bounds = { minX: 0, minY: 0, maxX: 1024, maxY: 768 };
              this.viewModelByName = () => null;
              this.defaultViewModel = () => null;
              opts.onLoad();
            }, 0);
          }
        },
      };

      const buffer = new ArrayBuffer(10);
      const canvas = {};
      const result = await analyzer.analyze(buffer, canvas);

      expect(result.artboardWidth).toBe(1024);
      expect(result.artboardHeight).toBe(768);
    });
  });

  describe('getRiveInstance', () => {
    it('should return null before analyze is called', () => {
      expect(analyzer.getRiveInstance()).toBeNull();
    });
  });
});
