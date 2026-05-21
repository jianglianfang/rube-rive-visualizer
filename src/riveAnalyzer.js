/**
 * Analyzes a Rive .riv file to extract ViewModel-bound components
 * and their geometric data for physics body generation.
 *
 * Two-phase approach:
 * 1. Binary parser: extract VM structure, DataBinds, shape geometry, and
 *    initial transform values directly from the .riv binary.
 * 2. Rive runtime: load for rendering (optional, used by GeneratorApp).
 *
 * Key data flow from watchface.riv analysis:
 * - ViewModel "world" contains t1-t6 (ViewModelPropertyViewModel refs)
 * - ViewModel "transform" defines x, y, r (ViewModelPropertyNumber)
 * - ViewModelInstances b1-b5 hold initial x/y/r values
 * - DataBindContext objects bind x(13)/y(14)/rotation(15) to target components
 * - sourcePathIds[1] maps to the property index in "world" VM
 *
 * @module riveAnalyzer
 */

import { createVec2, createBoundComponent, createAnalysisResult } from './models.js';
import { RivBinaryParser, CoreType, PropKey } from './rivBinaryParser.js';

/**
 * Validate that a filename has a .riv extension (case-insensitive).
 * @param {string} fileName
 * @returns {boolean}
 */
export function validateRivExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return false;
  const idx = fileName.lastIndexOf('.');
  if (idx < 0) return false;
  return fileName.slice(idx).toLowerCase() === '.riv';
}

export class RiveAnalyzer {
  constructor() {
    this._rive = null;
    this._binaryParser = new RivBinaryParser();
    this._parseResult = null;
    /** Ellipse approximation segments (default 12). Set higher for smoother circles. */
    this.ellipseSegments = 12;
    /** Bezier curve samples per span (default 4). Set higher for smoother curves. */
    this.curveSegments = 4;
  }

  /**
   * Load a .riv file and analyze its artboard structure.
   * @param {ArrayBuffer} rivBuffer - Raw .riv file data
   * @param {HTMLCanvasElement} canvas - Canvas for Rive rendering
   * @returns {Promise<import('./models.js').AnalysisResult>}
   */
  async analyze(rivBuffer, canvas) {
    const warnings = [];

    // Phase 1: Binary parse
    try {
      this._parseResult = this._binaryParser.parse(rivBuffer);
      console.log('[RiveAnalyzer] Binary parse OK:', {
        objects: this._parseResult.objects.length,
        artboard: this._parseResult.artboard,
        viewModels: this._parseResult.viewModels.length,
        dataBinds: this._parseResult.dataBinds.length,
      });
    } catch (e) {
      console.warn('[RiveAnalyzer] Binary parse failed:', e.message);
      warnings.push(`Binary parse warning: ${e.message}`);
      this._parseResult = null;
    }

    // Phase 2: Load via Rive runtime (for rendering)
    const RiveLib = globalThis.rive;
    if (RiveLib && RiveLib.Rive) {
      try {
        await this._loadRiveRuntime(rivBuffer, canvas);
      } catch (e) {
        warnings.push(`Rive runtime load warning: ${e.message}`);
      }
    }

    // Phase 3: Build analysis result
    return this._buildAnalysisResult(warnings);
  }

  _loadRiveRuntime(rivBuffer, canvas) {
    const RiveLib = globalThis.rive;
    return new Promise((resolve, reject) => {
      try {
        this._rive = new RiveLib.Rive({
          buffer: rivBuffer,
          canvas: canvas,
          autoplay: true,
          onLoad: () => resolve(),
          onLoadError: (err) => reject(new Error(`Rive load error: ${err}`)),
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Build analysis result from binary parse data.
   */
  _buildAnalysisResult(warnings) {
    let artboardWidth = 800, artboardHeight = 600;

    if (this._parseResult && this._parseResult.artboard.width > 0) {
      artboardWidth = this._parseResult.artboard.width;
      artboardHeight = this._parseResult.artboard.height;
    } else if (this._rive && this._rive.bounds) {
      artboardWidth = this._rive.bounds.maxX - this._rive.bounds.minX;
      artboardHeight = this._rive.bounds.maxY - this._rive.bounds.minY;
    }

    let components = [];
    if (this._parseResult) {
      components = this._extractBoundComponents(artboardWidth, artboardHeight, warnings);
    }

    if (components.length === 0 && this._rive) {
      components = this._extractComponentsViaRuntime(artboardWidth, artboardHeight, warnings);
    }

    if (components.length === 0) {
      warnings.push('No ViewModel-bound components found');
    }

    return createAnalysisResult({ components, artboardWidth, artboardHeight, warnings });
  }

  /**
   * Extract bound components using binary parse data.
   *
   * Strategy:
   * 1. Find "transform" ViewModel (has x, y, r properties)
   * 2. Find ViewModelInstances (b1, b2, ...) with initial x/y values
   * 3. Find DataBind → NestedArtboard mapping to get component sizes
   * 4. Use NestedArtboard's referenced artboard dimensions as body size
   */
  _extractBoundComponents(artboardWidth, artboardHeight, warnings) {
    const result = this._parseResult;
    if (!result) return [];

    // Step 1: Find ViewModels and their properties
    const vmInfo = this._extractVMStructure(result);
    if (!vmInfo.transformInstances.length) {
      warnings.push('No ViewModel transform instances found');
      return [];
    }

    console.log('[RiveAnalyzer] VM structure:', {
      worldVM: vmInfo.worldVMName,
      transformVM: vmInfo.transformVMName,
      instances: vmInfo.transformInstances.map(i => i.name),
    });

    // Step 2: Map DataBind sourcePathIds to NestedArtboard sizes
    const { sizeMap: bindingSizeMap, nameMap: vmNameMap } = this._buildBindingSizeMap(result, vmInfo);
    console.log('[RiveAnalyzer] Binding size map:', bindingSizeMap);
    console.log('[RiveAnalyzer] VM name map (bN→tN):', vmNameMap);

    // Step 3: For each VM instance, create component with correct size
    const components = [];
    for (const inst of vmInfo.transformInstances) {
      const size = bindingSizeMap.get(inst.name);
      const w = size ? size.width : 50;
      const h = size ? size.height : 50;
      const anchorX = inst.x || artboardWidth / 2;
      const anchorY = inst.y || artboardHeight / 2;
      // Geometric center of the shape (anchor + half size)
      const cx = anchorX + w / 2;
      const cy = anchorY + h / 2;
      const hw = w / 2, hh = h / 2;

      // Use the world VM property name (tN) for binding, not instance name (bN)
      const vmPropName = vmNameMap.get(inst.name) || inst.name;

      // Use actual vertices if available from shape analysis, otherwise rectangle
      // Vertices from _findMainShapeInArtboard are relative to shape center (0,0)
      // We offset them to artboard coordinates using the geometric center
      let vertices;
      if (size && size.vertices && size.vertices.length >= 3) {
        vertices = size.vertices.map(v => createVec2(v.x + cx, v.y + cy));
      } else {
        vertices = [
          createVec2(cx - hw, cy - hh),
          createVec2(cx + hw, cy - hh),
          createVec2(cx + hw, cy + hh),
          createVec2(cx - hw, cy + hh),
        ];
      }

      components.push(createBoundComponent({
        vmPropertyName: vmPropName,
        componentName: inst.name,
        center: createVec2(cx, cy),
        origin: createVec2(anchorX, anchorY), // Rive anchor point
        vertices,
        width: w,
        height: h,
        isBoundingBox: !size || !size.vertices,
        shapeType: (size && size.shapeType) || 'rectangle',
      }));
    }

    return components;
  }

  /**
   * Build a map from VM instance names to their NestedArtboard sizes,
   * and a name map from instance names (bN) to world VM property names (tN).
   */
  _buildBindingSizeMap(result, vmInfo) {
    const sizeMap = new Map(); // vmInstanceName → {width, height, vertices?}
    const nameMap = new Map(); // vmInstanceName (bN) → world VM property name (tN)

    // Find all artboards and their sizes (by file order index)
    const artboards = result.objects.filter(o => o.typeKey === CoreType.ARTBOARD);
    const artboardSizes = artboards.map(a => ({
      index: a.index,
      width: a.properties.get(PropKey.WIDTH) || 0,
      height: a.properties.get(PropKey.HEIGHT) || 0,
      name: a.properties.get(PropKey.NAME) || '',
    }));

    // Find NestedArtboard objects and their artboardId
    // NestedArtboard typeKey = 92 (from schema: type_names has "92": "NestedArtboard")
    const NESTED_ARTBOARD_TYPE = 92;
    const nestedArtboards = result.objects.filter(o => o.typeKey === NESTED_ARTBOARD_TYPE);

    // For each DataBind group (x/y/rotation), find the preceding NestedArtboard
    // and extract its referenced artboard's size
    const dataBinds = result.dataBinds.filter(db => db.typeKey === 447); // DataBindContext
    const xBinds = dataBinds.filter(db => db.properties.get(586) === 13); // propertyKey = x

    // Map sourcePathIds[1] (world VM property index) to VM instance names
    // From the VM structure: world VM has properties t6(idx0), t5(idx1), t4(idx2), t3(idx3), t2(idx4), t1(idx5)
    const worldVMProps = []; // ordered list of VM property names in "world"
    for (const obj of result.viewModels) {
      if (obj.typeKey === 436) { // VIEW_MODEL_PROPERTY_VIEWMODEL
        const name = obj.properties.get(557) || '';
        if (name) worldVMProps.push(name);
      }
    }
    console.log('[RiveAnalyzer] World VM property order:', worldVMProps);

    // Map: sourcePathIds[1] → world VM property name (t1-t6)
    // Then: world property name tN → matches VM instance name bN (based on the VM instance's mapping)
    // Actually the relationship is: world.t1 → instance b1, world.t2 → instance b2, etc.
    // The "world" VM's ViewModelPropertyViewModel entries (t1-t6) reference the "transform" VM
    // and the instances (b1-b5) are instances of "transform"

    // From our data: sourcePathIds = [0, propIdx, subPropIdx]
    // propIdx maps to worldVMProps[propIdx] which gives us "t1", "t2", etc.
    // The name pattern is: t1↔b1, t2↔b2, etc. (just different prefix)

    for (const xBind of xBinds) {
      const spIds = xBind.properties.get(588); // sourcePathIds bytes
      if (!spIds || spIds.length < 2) continue;
      const propIdx = spIds[1]; // index into world VM properties

      // Find the NestedArtboard that precedes this DataBind
      const bindObjIdx = xBind.index;
      let targetNA = null;
      for (let i = nestedArtboards.length - 1; i >= 0; i--) {
        if (nestedArtboards[i].index < bindObjIdx) {
          targetNA = nestedArtboards[i];
          break;
        }
      }

      if (!targetNA) continue;

      // Get the artboardId from the NestedArtboard
      const artboardId = targetNA.properties.get(197); // artboardId property
      let size = { width: 50, height: 50 };

      if (artboardId !== undefined && artboardId < artboardSizes.length) {
        // artboardId is the index among artboards (0-based, Artboard order in Backboard)
        // Instead of using artboard dimensions, find the actual visual shape inside
        const childArtboard = artboardSizes[artboardId];
        const shapeGeo = this._findMainShapeInArtboard(result, artboards, artboardId);
        if (shapeGeo) {
          size = { width: shapeGeo.width, height: shapeGeo.height, vertices: shapeGeo.vertices, shapeType: shapeGeo.shapeType };
        } else {
          // Fallback to artboard dimensions
          size = { width: childArtboard.width, height: childArtboard.height };
        }
      }

      // Map propIdx to VM property name
      if (propIdx < worldVMProps.length) {
        const tName = worldVMProps[propIdx]; // e.g., "t1", "c1", or any name

        // Find which instance corresponds to this world property via ViewModelInstanceViewModel
        // These objects map viewModelPropertyId → which instance
        const vmInstVMs = result.viewModels.filter(o => o.typeKey === 444); // ViewModelInstanceViewModel
        let matchedInstName = null;
        for (const ivmObj of vmInstVMs) {
          const vmPropId = ivmObj.properties.get(554); // viewModelPropertyId
          if (vmPropId === propIdx) {
            // propertyValue points to the instance index
            const instIdx = ivmObj.properties.get(577); // propertyValue
            // Find the corresponding instance by order
            if (instIdx !== undefined && instIdx < vmInfo.transformInstances.length) {
              matchedInstName = vmInfo.transformInstances[instIdx].name;
            }
            break;
          }
        }

        // Fallback: try matching by naming convention (tN↔bN)
        if (!matchedInstName) {
          const possibleBName = tName.replace(/^t/, 'b');
          const fallbackInst = vmInfo.transformInstances.find(i => i.name === possibleBName);
          if (fallbackInst) matchedInstName = fallbackInst.name;
        }

        // Last fallback: just use the order-based matching
        if (!matchedInstName && vmInfo.transformInstances.length > 0) {
          // Try finding by index in instances array
          for (const inst of vmInfo.transformInstances) {
            if (!sizeMap.has(inst.name)) {
              matchedInstName = inst.name;
              break;
            }
          }
        }

        if (matchedInstName) {
          sizeMap.set(matchedInstName, size);
          nameMap.set(matchedInstName, tName); // instanceName → worldVMPropName
        }
      }
    }

    return { sizeMap, nameMap };
  }

  /**
   * Find the main (largest) Shape inside a child Artboard and extract its geometry.
   * Performs bezier curve interpolation for cubic vertices.
   * Precision controlled by this.ellipseSegments and this.curveSegments.
   * Returns {width, height, vertices} or null.
   */
  _findMainShapeInArtboard(result, artboardObjects, artboardId) {
    if (artboardId >= artboardObjects.length) return null;

    const artObj = artboardObjects[artboardId];
    const artStart = artObj.index;
    const nextArt = artboardObjects.find(a => a.index > artStart);
    const artEnd = nextArt ? nextArt.index : result.objects.length;

    const comps = [result.objects[artStart]];
    for (const obj of result.objects) {
      if (obj.index <= artStart || obj.index >= artEnd) continue;
      if (obj.properties.get(PropKey.PARENT_ID) !== undefined) comps.push(obj);
      else break;
    }

    const ellipseSegs = this.ellipseSegments || 12;
    const curveSegs = this.curveSegments || 4;

    let bestShape = null;
    let bestArea = 0;

    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      if (comp.typeKey !== CoreType.SHAPE) continue;

      const childPaths = comps.filter(c =>
        c.properties.get(PropKey.PARENT_ID) === i &&
        [CoreType.RECTANGLE, CoreType.ELLIPSE, 16, 12].includes(c.typeKey)
      );

      for (const pathObj of childPaths) {
        let w = 0, h = 0, verts = [];
        let shapeType = 'rectangle';

        if (pathObj.typeKey === CoreType.RECTANGLE) {
          w = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
          h = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
          const hw = w / 2, hh = h / 2;

          // Check for corner radius (prop key 31 = cornerRadiusTL)
          const cornerRadius = pathObj.properties.get(31) || 0;
          if (cornerRadius > 0) {
            shapeType = 'roundedRect';
            // Generate rounded rectangle with arc segments at corners
            const r = Math.min(cornerRadius, hw, hh); // clamp to half-size
            const segsPerCorner = Math.max(2, Math.floor(ellipseSegs / 4));
            verts = [];
            // Top-right corner
            for (let j = 0; j <= segsPerCorner; j++) {
              const a = -Math.PI / 2 + (j / segsPerCorner) * (Math.PI / 2);
              verts.push({ x: hw - r + r * Math.cos(a), y: -hh + r + r * Math.sin(a) });
            }
            // Bottom-right corner
            for (let j = 0; j <= segsPerCorner; j++) {
              const a = 0 + (j / segsPerCorner) * (Math.PI / 2);
              verts.push({ x: hw - r + r * Math.cos(a), y: hh - r + r * Math.sin(a) });
            }
            // Bottom-left corner
            for (let j = 0; j <= segsPerCorner; j++) {
              const a = Math.PI / 2 + (j / segsPerCorner) * (Math.PI / 2);
              verts.push({ x: -hw + r + r * Math.cos(a), y: hh - r + r * Math.sin(a) });
            }
            // Top-left corner
            for (let j = 0; j <= segsPerCorner; j++) {
              const a = Math.PI + (j / segsPerCorner) * (Math.PI / 2);
              verts.push({ x: -hw + r + r * Math.cos(a), y: -hh + r + r * Math.sin(a) });
            }
          } else {
            shapeType = 'rectangle';
            verts = [{x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}];
          }

        } else if (pathObj.typeKey === CoreType.ELLIPSE) {
          shapeType = 'ellipse';
          w = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
          h = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
          const rx = w / 2, ry = h / 2;
          for (let j = 0; j < ellipseSegs; j++) {
            const a = (j / ellipseSegs) * Math.PI * 2;
            verts.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) });
          }

        } else if (pathObj.typeKey === 16 || pathObj.typeKey === 12) {
          shapeType = 'curve';
          const pathCompIdx = comps.indexOf(pathObj);
          const vertexObjs = comps.filter(c =>
            comps.indexOf(c) > pathCompIdx &&
            c.properties.get(PropKey.PARENT_ID) === pathCompIdx &&
            [5, 6, 34, 35].includes(c.typeKey)
          );
          if (vertexObjs.length === 0) continue;

          const isClosed = pathObj.properties.get(32) === 1;
          const cps = vertexObjs.map(vObj => {
            const x = vObj.properties.get(24) || 0;
            const y = vObj.properties.get(25) || 0;
            let inX = x, inY = y, outX = x, outY = y;

            if (vObj.typeKey === 6) { // CubicDetachedVertex
              const inR = vObj.properties.get(84) || 0;
              const inD = vObj.properties.get(85) || 0;
              const outR = vObj.properties.get(86) || 0;
              const outD = vObj.properties.get(87) || 0;
              inX = x + Math.cos(inR) * inD;
              inY = y + Math.sin(inR) * inD;
              outX = x + Math.cos(outR) * outD;
              outY = y + Math.sin(outR) * outD;
            } else if (vObj.typeKey === 34) { // CubicAsymmetricVertex
              const rot = vObj.properties.get(79) || 0;
              const inD = vObj.properties.get(80) || 0;
              const outD = vObj.properties.get(81) || 0;
              inX = x + Math.cos(rot + Math.PI) * inD;
              inY = y + Math.sin(rot + Math.PI) * inD;
              outX = x + Math.cos(rot) * outD;
              outY = y + Math.sin(rot) * outD;
            } else if (vObj.typeKey === 35) { // CubicMirroredVertex
              const rot = vObj.properties.get(82) || 0;
              const dist = vObj.properties.get(83) || 0;
              inX = x + Math.cos(rot + Math.PI) * dist;
              inY = y + Math.sin(rot + Math.PI) * dist;
              outX = x + Math.cos(rot) * dist;
              outY = y + Math.sin(rot) * dist;
            }
            return { x, y, inX, inY, outX, outY, type: vObj.typeKey };
          });

          verts = this._interpolatePath(cps, isClosed, curveSegs);
        }

        if (verts.length >= 3) {
          const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
          w = Math.max(...xs) - Math.min(...xs);
          h = Math.max(...ys) - Math.min(...ys);
        }
        const area = w * h;
        if (area > bestArea && verts.length >= 3) {
          bestArea = area;
          bestShape = { width: w, height: h, vertices: verts, shapeType };
        }
      }
    }
    return bestShape;
  }

  /**
   * Interpolate path control points into dense vertex array via cubic bezier.
   * @param {Array} cps - [{x, y, inX, inY, outX, outY, type}]
   * @param {boolean} isClosed
   * @param {number} segs - bezier samples per span
   * @returns {Array<{x: number, y: number}>}
   */
  _interpolatePath(cps, isClosed, segs) {
    const N = cps.length;
    if (N < 2) return cps.map(p => ({ x: p.x, y: p.y }));
    const out = [];
    const spans = isClosed ? N : N - 1;
    for (let i = 0; i < spans; i++) {
      const curr = cps[i], next = cps[(i + 1) % N];
      if (curr.type === 5 && next.type === 5) {
        out.push({ x: curr.x, y: curr.y });
      } else {
        const p0x = curr.x, p0y = curr.y;
        const p1x = curr.outX, p1y = curr.outY;
        const p2x = next.inX, p2y = next.inY;
        const p3x = next.x, p3y = next.y;
        for (let s = 0; s < segs; s++) {
          const t = s / segs, mt = 1 - t;
          out.push({
            x: mt*mt*mt*p0x + 3*mt*mt*t*p1x + 3*mt*t*t*p2x + t*t*t*p3x,
            y: mt*mt*mt*p0y + 3*mt*mt*t*p1y + 3*mt*t*t*p2y + t*t*t*p3y,
          });
        }
      }
    }
    if (!isClosed) out.push({ x: cps[N-1].x, y: cps[N-1].y });
    return out;
  }

  /**
   * Extract ViewModel structure: find "world" and "transform" VMs,
   * and all transform instances with their initial x/y/r values.
   */
  _extractVMStructure(result) {
    const info = {
      worldVMName: '',
      transformVMName: '',
      transformInstances: [], // {name, x, y, r, objectIndex}
    };

    // Find all ViewModels by name (property key 557 = name for VM components)
    const viewModelDefs = []; // {name, index, objectIndex}
    const vmPropertyDefs = []; // {name, parentVmIndex, type, objectIndex}
    const vmInstances = []; // {name, vmId, objectIndex, values: {propId: value}}

    for (const obj of result.viewModels) {
      const name = obj.properties.get(557) || obj.properties.get(4) || '';

      if (obj.typeKey === CoreType.VIEW_MODEL) {
        viewModelDefs.push({ name, objectIndex: obj.index });
      } else if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_NUMBER) {
        vmPropertyDefs.push({ name, objectIndex: obj.index, type: 'number' });
      } else if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_VIEWMODEL) {
        vmPropertyDefs.push({
          name, objectIndex: obj.index, type: 'viewModelRef',
          refId: obj.properties.get(565), // viewModelReferenceId
        });
      } else if (obj.typeKey === CoreType.VIEW_MODEL_INSTANCE) {
        const vmId = obj.properties.get(566); // viewModelId
        vmInstances.push({ name: obj.properties.get(4) || '', vmId, objectIndex: obj.index, values: new Map() });
      } else if (obj.typeKey === CoreType.VIEW_MODEL_INSTANCE_NUMBER) {
        // Belongs to the most recent ViewModelInstance
        const parentInst = vmInstances[vmInstances.length - 1];
        if (parentInst) {
          const propId = obj.properties.get(554); // viewModelPropertyId
          const value = obj.properties.get(575) || 0; // propertyValue (float)
          parentInst.values.set(propId, value);
        }
      }
    }

    // Identify "world" VM (has ViewModelPropertyViewModel children → t1, t2, etc.)
    // and "transform" VM (has x, y, r number properties)
    // Heuristic: "transform" VM has exactly properties named x, y, r
    let transformVMIndex = -1;
    let worldVMIndex = -1;

    for (let i = 0; i < viewModelDefs.length; i++) {
      const vm = viewModelDefs[i];
      if (vm.name === 'transform' || vm.name === 'Transform') {
        transformVMIndex = i;
        info.transformVMName = vm.name;
      } else if (vm.name === 'world' || vm.name === 'World') {
        worldVMIndex = i;
        info.worldVMName = vm.name;
      }
    }

    // If no explicit "transform" found, look for VM with x/y/r properties
    if (transformVMIndex < 0) {
      // Check property sequence after each VM def
      for (let i = 0; i < viewModelDefs.length; i++) {
        const vmObjIdx = viewModelDefs[i].objectIndex;
        const childProps = vmPropertyDefs.filter(p =>
          p.objectIndex > vmObjIdx && p.type === 'number' &&
          (p.name === 'x' || p.name === 'y' || p.name === 'r')
        );
        if (childProps.length >= 3) {
          transformVMIndex = i;
          info.transformVMName = viewModelDefs[i].name;
          break;
        }
      }
    }

    if (transformVMIndex < 0) {
      // No transform VM found
      return info;
    }

    // Find property order for the transform VM (r=0, y=1, x=2 based on the data)
    // Properties appear after the VM def in sequence
    const transformVMObjIdx = viewModelDefs[transformVMIndex].objectIndex;
    const transformProps = vmPropertyDefs.filter(p =>
      p.objectIndex > transformVMObjIdx && p.type === 'number'
    ).slice(0, 3); // Take first 3 number properties

    const propNameToId = new Map();
    transformProps.forEach((p, idx) => {
      propNameToId.set(p.name, idx);
    });

    // Find instances of the transform VM
    const transformVMId = transformVMIndex; // vmId matches the def order
    for (const inst of vmInstances) {
      if (inst.vmId === transformVMId && inst.name) {
        // Extract x, y, r from instance values
        const xId = propNameToId.get('x');
        const yId = propNameToId.get('y');
        const rId = propNameToId.get('r');

        const x = xId !== undefined ? (inst.values.get(xId) || 0) : 0;
        const y = yId !== undefined ? (inst.values.get(yId) || 0) : 0;
        const r = rId !== undefined ? (inst.values.get(rId) || 0) : 0;

        info.transformInstances.push({
          name: inst.name,
          x, y, r,
          objectIndex: inst.objectIndex,
        });
      }
    }

    return info;
  }

  /**
   * Build a map of shapes with their positions and geometries.
   * Uses parentId to determine component index within artboard,
   * then finds shape's position from x/y properties.
   */
  _buildShapeGeometryMap(result, artboardWidth, artboardHeight) {
    const shapes = [];

    // Find first artboard's objects (between first Artboard and next Artboard/end)
    let artboardStart = -1, artboardEnd = result.objects.length;
    for (const obj of result.objects) {
      if (obj.typeKey === CoreType.ARTBOARD) {
        if (artboardStart < 0) {
          artboardStart = obj.index;
        } else {
          artboardEnd = obj.index;
          break;
        }
      }
    }

    if (artboardStart < 0) return shapes;

    // Get all Shape objects in first artboard
    for (const obj of result.objects) {
      if (obj.index <= artboardStart || obj.index >= artboardEnd) continue;
      if (obj.typeKey !== CoreType.SHAPE) continue;

      const x = obj.properties.get(PropKey.X) || 0;
      const y = obj.properties.get(PropKey.Y) || 0;
      const name = obj.properties.get(PropKey.NAME) || '';
      const parentId = obj.properties.get(PropKey.PARENT_ID);

      // Find child paths of this shape (they follow immediately in file order)
      const childPaths = [];
      for (const pathObj of result.paths) {
        if (pathObj.index <= obj.index) continue;
        if (pathObj.index >= artboardEnd) break;
        // Check if this path's parentId points to our shape's component index
        const pathParentId = pathObj.properties.get(PropKey.PARENT_ID);
        // The shape's component index = its position among parentId-bearing objects
        // For simplicity, use proximity: paths immediately after shape belong to it
        const nextShape = result.shapes.find(s => s.index > obj.index && s.index < artboardEnd);
        if (nextShape && pathObj.index >= nextShape.index) break;
        childPaths.push(pathObj);
      }

      // Extract geometry from child paths
      let vertices = [];
      let width = 0, height = 0;

      for (const pathObj of childPaths) {
        if (pathObj.typeKey === CoreType.RECTANGLE) {
          width = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
          height = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
          const hw = width / 2, hh = height / 2;
          vertices = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
          break;
        } else if (pathObj.typeKey === CoreType.ELLIPSE) {
          width = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
          height = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
          const rx = width / 2, ry = height / 2, N = 8;
          vertices = [];
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            vertices.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) });
          }
          break;
        } else if (pathObj.typeKey === CoreType.POINTS_PATH) {
          // Collect vertices following this path
          for (const v of result.vertices) {
            if (v.index <= pathObj.index) continue;
            const nextP = result.paths.find(p => p.index > pathObj.index && p.index < artboardEnd);
            if (nextP && v.index >= nextP.index) break;
            const vx = v.properties.get(PropKey.VERTEX_X) || 0;
            const vy = v.properties.get(PropKey.VERTEX_Y) || 0;
            vertices.push({ x: vx, y: vy });
          }
          if (vertices.length > 0) {
            const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
            width = Math.max(...xs) - Math.min(...xs);
            height = Math.max(...ys) - Math.min(...ys);
          }
          break;
        }
      }

      if (vertices.length >= 3 || (width > 0 && height > 0)) {
        shapes.push({ name, x, y, width, height, vertices, objectIndex: obj.index, parentId });
      }
    }

    return shapes;
  }

  /**
   * Match a VM instance to the closest shape by comparing initial position
   * to shape positions in the artboard.
   */
  _matchInstanceToShape(inst, shapeGeoMap, artboardWidth, artboardHeight, warnings) {
    // inst.x/inst.y are in artboard pixel coordinates
    // Shape x/y are relative to their parent node

    // If we have shapes, try to match by distance
    if (shapeGeoMap.length === 0) {
      // No shapes found — use AABB at the instance position
      warnings.push(`No shapes found, using instance position for "${inst.name}"`);
      return this._createComponentFromPosition(inst.name, inst.x, inst.y, 50, 50, artboardWidth, artboardHeight);
    }

    // Find closest shape to the instance's initial position
    let bestDist = Infinity;
    let bestShape = null;

    for (const shape of shapeGeoMap) {
      // Shape position may be relative — try direct comparison
      const dx = shape.x - inst.x;
      const dy = shape.y - inst.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestShape = shape;
      }
    }

    // Also try matching by artboard-center-relative coords
    // (inst coordinates might be relative to artboard center)
    const centerX = artboardWidth / 2;
    const centerY = artboardHeight / 2;
    for (const shape of shapeGeoMap) {
      const dx = shape.x - (inst.x - centerX);
      const dy = shape.y - (inst.y - centerY);
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestShape = shape;
      }
    }

    if (bestShape && bestShape.vertices.length >= 3) {
      // Use shape geometry
      const cx = inst.x || bestShape.x;
      const cy = inst.y || bestShape.y;
      const artboardVerts = bestShape.vertices.map(v =>
        createVec2(v.x + cx, v.y + cy)
      );

      return createBoundComponent({
        vmPropertyName: inst.name,
        componentName: bestShape.name || inst.name,
        center: createVec2(cx, cy),
        vertices: artboardVerts,
        width: bestShape.width,
        height: bestShape.height,
        isBoundingBox: false,
      });
    }

    // Fallback: use instance position with default size
    warnings.push(`Shape match uncertain for "${inst.name}", using AABB`);
    return this._createComponentFromPosition(inst.name, inst.x, inst.y, 50, 50, artboardWidth, artboardHeight);
  }

  _createComponentFromPosition(name, x, y, width, height, artboardWidth, artboardHeight) {
    const cx = x || artboardWidth / 2;
    const cy = y || artboardHeight / 2;
    const hw = width / 2, hh = height / 2;
    return createBoundComponent({
      vmPropertyName: name,
      componentName: name,
      center: createVec2(cx, cy),
      vertices: [
        createVec2(cx - hw, cy - hh),
        createVec2(cx + hw, cy - hh),
        createVec2(cx + hw, cy + hh),
        createVec2(cx - hw, cy + hh),
      ],
      width, height,
      isBoundingBox: true,
    });
  }

  /**
   * Fallback: extract components via Rive runtime API.
   */
  _extractComponentsViaRuntime(artboardWidth, artboardHeight, warnings) {
    const rive = this._rive;
    if (!rive) return [];

    let worldVM = null;
    if (typeof rive.viewModelByName === 'function') {
      worldVM = rive.viewModelByName('world');
    }
    if (!worldVM && typeof rive.defaultViewModel === 'function') {
      worldVM = rive.defaultViewModel();
    }
    if (!worldVM) {
      warnings.push('No ViewModel found via Rive runtime');
      return [];
    }

    const transformProps = this._enumerateTransformProperties(worldVM);
    if (transformProps.length === 0) {
      warnings.push('No transform properties found in ViewModel via runtime');
      return [];
    }

    return transformProps.map(propName => {
      return this._createComponentFromPosition(propName, artboardWidth / 2, artboardHeight / 2, 50, 50, artboardWidth, artboardHeight);
    });
  }

  _enumerateTransformProperties(worldVM) {
    if (!worldVM || !worldVM.properties) return [];
    const transformProps = [];
    for (const prop of worldVM.properties) {
      if (prop.type === 'viewModel' || prop.type === 'list') {
        transformProps.push(prop.name);
      }
    }
    return transformProps;
  }

  _defaultVertices(cx, cy) {
    const hw = 25, hh = 25;
    return [
      createVec2(cx - hw, cy - hh),
      createVec2(cx + hw, cy - hh),
      createVec2(cx + hw, cy + hh),
      createVec2(cx - hw, cy + hh),
    ];
  }

  getParseResult() { return this._parseResult; }
  getRiveInstance() { return this._rive; }

  /**
   * Re-extract a single component's shape with custom precision settings.
   * Temporarily overrides ellipseSegments/curveSegments, re-runs shape extraction
   * for the specified component, then restores original settings.
   *
   * @param {string} vmPropertyName - The VM property name (e.g. "t1")
   * @param {number} ellipseSegments - Custom ellipse segments
   * @param {number} curveSegments - Custom curve segments
   * @param {number} artboardWidth
   * @param {number} artboardHeight
   * @returns {{vertices: Array, width: number, height: number, center: {x,y}}|null}
   */
  reExtractComponentShape(vmPropertyName, ellipseSegments, curveSegments, artboardWidth, artboardHeight) {
    if (!this._parseResult) return null;

    // Save original settings
    const origEllipse = this.ellipseSegments;
    const origCurve = this.curveSegments;

    // Apply custom precision
    this.ellipseSegments = ellipseSegments;
    this.curveSegments = curveSegments;

    try {
      // Re-run the full component extraction to get updated vertices
      const warnings = [];
      const components = this._extractBoundComponents(artboardWidth, artboardHeight, warnings);
      const component = components.find(c => c.vmPropertyName === vmPropertyName);
      if (!component) return null;

      return {
        vertices: component.vertices,
        width: component.width,
        height: component.height,
        center: component.center,
      };
    } finally {
      // Restore original settings
      this.ellipseSegments = origEllipse;
      this.curveSegments = origCurve;
    }
  }
}
