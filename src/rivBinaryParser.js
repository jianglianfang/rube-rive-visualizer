/**
 * Binary parser for .riv (Rive) files — Format Major Version 7.
 *
 * Reference: RIV-FORMAT.md + riv_schema.json (468 baseline properties)
 *
 * Format:
 * - Header: "RIVE" + version + ToC (FieldTypes packed 4-per-Uint32)
 * - Objects: VarUint typeKey + (VarUint propKey + value)* + 0 terminator
 * - Property type: 1) built-in registry → 2) ToC → 3) error
 * - 6 value types: uint(varuint), string(len+utf8), float(4B LE),
 *                  color(4B LE), bytes(len+raw), bool(1 byte)
 *
 * @module rivBinaryParser
 */

// Field type constants (matching riv_schema.json encoding)
const FT = Object.freeze({
  UINT: 0,    // LEB128 varuint
  STRING: 1,  // varuint length + UTF-8
  FLOAT: 2,   // 4-byte LE IEEE 754 float32
  COLOR: 3,   // 4-byte LE uint32 (ARGB)
  BYTES: 4,   // varuint length + raw bytes
  BOOL: 5,    // 1 byte (0x00 or 0x01)
});

// ═══════════════════════════════════════════════════════════════════
// Built-in Property Registry — from riv_schema.json "property_fields"
// 468 properties total. Maps propertyKey → field type.
// ═══════════════════════════════════════════════════════════════════
const REGISTRY = new Map();
// uint (188 properties)
[5,23,40,48,49,51,53,56,57,59,60,61,67,68,69,92,93,95,102,103,110,111,112,113,117,119,120,121,122,125,128,129,149,151,152,155,156,158,160,165,167,168,171,173,175,178,179,180,195,197,198,204,206,224,225,227,228,236,237,240,249,272,279,281,284,287,289,296,298,301,302,312,313,316,320,325,326,335,349,350,356,357,377,378,389,392,393,399,400,405,408,494,536,537,538,549,550,554,560,566,574,577,583,586,587,589,590,591,596,597,598,599,600,601,602,603,604,605,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,626,627,628,629,630,631,632,637,650,653,655,656,660,665,666,667,668,669,672,673,679,682,683,685,686,687,689,705,708,709,713,714,715,722,725,726,727,731,743,745,746,747,748,757,758,764,765,775,776,778,800].forEach(k => REGISTRY.set(k, FT.UINT));
// string (19 properties)
[4,55,138,203,246,248,268,280,362,557,561,572,578,579,635,654,662,744,766].forEach(k => REGISTRY.set(k, FT.STRING));
// float (209 properties)
[7,8,9,10,11,12,13,14,15,16,17,18,20,21,24,25,26,31,33,34,35,39,42,46,47,58,63,64,65,66,70,79,80,81,82,83,84,85,86,87,89,90,91,96,97,98,99,100,101,104,105,106,107,108,109,114,115,116,123,124,126,127,140,157,161,162,163,166,172,177,182,183,184,185,186,187,199,200,202,207,208,215,216,229,239,243,274,285,286,288,292,297,299,300,303,304,305,306,307,308,317,318,319,321,322,323,324,327,328,329,330,331,332,334,336,337,338,339,340,363,366,367,370,371,372,373,380,381,390,406,407,498,499,500,501,502,503,504,505,506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,521,522,523,524,530,575,592,636,640,641,642,643,644,645,652,663,664,675,681,690,692,697,698,699,700,706,707,716,717,718,719,728,729,730,749,750,751,756,759,760,761,762,763,777,781,783,784,785,786,806,807,808,809,810,811].forEach(k => REGISTRY.set(k, FT.FLOAT));
// color (6 properties)
[37,38,88,555,638,651].forEach(k => REGISTRY.set(k, FT.COLOR));
// bytes (6 properties) — varuint length + raw bytes
[212,223,359,582,588,711].forEach(k => REGISTRY.set(k, FT.BYTES));
// bool (40 properties) — 1 byte
[32,41,50,62,94,141,164,174,181,188,189,190,191,192,193,194,196,201,238,245,333,364,365,376,541,593,606,634,639,647,676,691,693,703,724,734,752,770,779,782].forEach(k => REGISTRY.set(k, FT.BOOL));

// ═══════════════════════════════════════════════════════════════════
// Known Core Object Type Keys (from riv_schema.json "type_names")
// ═══════════════════════════════════════════════════════════════════
const CoreType = Object.freeze({
  ARTBOARD: 1,
  NODE: 2,
  SHAPE: 3,
  ELLIPSE: 4,
  STRAIGHT_VERTEX: 5,
  CUBIC_DETACHED_VERTEX: 6,
  RECTANGLE: 7,
  TRIANGLE: 8,
  PATH: 12,
  POINTS_PATH: 16,
  BACKBOARD: 23,
  FILL: 20,
  STROKE: 24,
  SOLID_COLOR: 18,
  LINEAR_GRADIENT: 22,
  GRADIENT_STOP: 19,
  LINEAR_ANIMATION: 31,
  CUBIC_ASYMMETRIC_VERTEX: 34,
  CUBIC_MIRRORED_VERTEX: 35,
  TRANSFORM_COMPONENT: 38,
  POLYGON: 51,
  STAR: 52,
  STATE_MACHINE: 53,
  IMAGE: 100,
  MESH: 109,
  // ViewModel / DataBind
  VIEW_MODEL: 435,
  VIEW_MODEL_INSTANCE: 437,
  VIEW_MODEL_COMPONENT: 429,
  VIEW_MODEL_PROPERTY_NUMBER: 431,
  VIEW_MODEL_PROPERTY_STRING: 443,
  VIEW_MODEL_PROPERTY_BOOLEAN: 448,
  VIEW_MODEL_PROPERTY_LIST: 434,
  VIEW_MODEL_PROPERTY_VIEWMODEL: 436,
  VIEW_MODEL_INSTANCE_NUMBER: 442,
  VIEW_MODEL_INSTANCE_STRING: 433,
  VIEW_MODEL_INSTANCE_BOOLEAN: 449,
  DATA_BIND: 446,
  DATA_BIND_CONTEXT: 447,
  DATA_BIND_PATH: 470,
  BINDABLE_PROPERTY_NUMBER: 473,
  BINDABLE_PROPERTY_STRING: 471,
});

// Property keys we care about
const PropKey = Object.freeze({
  NAME: 4,
  PARENT_ID: 5,
  WIDTH: 7,       // Artboard width
  HEIGHT: 8,      // Artboard height
  X: 13,
  Y: 14,
  ROTATION: 15,
  PARAM_WIDTH: 20,  // ParametricPath width
  PARAM_HEIGHT: 21, // ParametricPath height
  VERTEX_X: 24,
  VERTEX_Y: 25,
  RADIUS: 26,       // StraightVertex radius
  PROPERTY_KEY: 586, // DataBind propertyKey
  FLAGS: 587,        // DataBind flags
  SOURCE_PATH_IDS: 588, // DataBindContext sourcePathIds
});

// ═══════════════════════════════════════════════════════════════════
// Binary Reader
// ═══════════════════════════════════════════════════════════════════
class BinaryReader {
  constructor(buffer) {
    this._data = new DataView(buffer);
    this._bytes = new Uint8Array(buffer);
    this._offset = 0;
    this._length = buffer.byteLength;
  }
  get offset() { return this._offset; }
  get remaining() { return this._length - this._offset; }
  get isEOF() { return this._offset >= this._length; }

  readVarUint() {
    let result = 0, shift = 0;
    while (true) {
      if (this._offset >= this._length) throw new Error(`EOF at varuint, offset ${this._offset}`);
      const byte = this._bytes[this._offset++];
      result |= (byte & 0x7F) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error(`Varuint overflow at offset ${this._offset}`);
    }
    return result >>> 0;
  }

  readFloat32() {
    if (this._offset + 4 > this._length) throw new Error(`EOF at float32, offset ${this._offset}`);
    const val = this._data.getFloat32(this._offset, true);
    this._offset += 4;
    return val;
  }

  readUint32() {
    if (this._offset + 4 > this._length) throw new Error(`EOF at uint32, offset ${this._offset}`);
    const val = this._data.getUint32(this._offset, true);
    this._offset += 4;
    return val;
  }

  readByte() {
    if (this._offset >= this._length) throw new Error(`EOF at byte, offset ${this._offset}`);
    return this._bytes[this._offset++];
  }

  readString() {
    const len = this.readVarUint();
    if (this._offset + len > this._length) throw new Error(`EOF at string(${len}), offset ${this._offset}`);
    const s = new TextDecoder().decode(this._bytes.slice(this._offset, this._offset + len));
    this._offset += len;
    return s;
  }

  readBytes() {
    const len = this.readVarUint();
    if (this._offset + len > this._length) throw new Error(`EOF at bytes(${len}), offset ${this._offset}`);
    const result = this._bytes.slice(this._offset, this._offset + len);
    this._offset += len;
    return result;
  }

  readFingerprint() {
    const b = this._bytes;
    const s = String.fromCharCode(b[this._offset], b[this._offset+1], b[this._offset+2], b[this._offset+3]);
    this._offset += 4;
    return s;
  }
}

// ═══════════════════════════════════════════════════════════════════
// RivBinaryParser
// ═══════════════════════════════════════════════════════════════════
class RivBinaryParser {
  constructor() {
    this._tocMap = new Map(); // propertyKey → fieldType (from file header TOC)
  }

  /**
   * Parse a .riv file.
   * @param {ArrayBuffer} buffer
   * @returns {object} Parse result with all objects, categorized
   */
  parse(buffer) {
    const reader = new BinaryReader(buffer);
    const header = this._readHeader(reader);
    const objects = this._readObjects(reader);
    return this._categorize(header, objects);
  }

  _readHeader(reader) {
    const fingerprint = reader.readFingerprint();
    if (fingerprint !== 'RIVE') throw new Error(`Invalid .riv: expected "RIVE", got "${fingerprint}"`);
    const majorVersion = reader.readVarUint();
    const minorVersion = reader.readVarUint();
    const fileId = reader.readVarUint();
    this._readToC(reader);
    return { majorVersion, minorVersion, fileId };
  }

  /**
   * Read ToC: PropertyKeys list + FieldTypes packed in Uint32s.
   * Per RIV-FORMAT.md: 4 properties per Uint32, 2 bits each in low 8 bits.
   */
  _readToC(reader) {
    this._tocMap = new Map();
    const keys = [];
    while (true) {
      const k = reader.readVarUint();
      if (k === 0) break;
      keys.push(k);
    }
    // Read FieldTypes: 4 properties per Uint32
    let currentInt = 0;
    let currentBit = 8; // force read on first iteration
    for (let i = 0; i < keys.length; i++) {
      if (currentBit === 8) {
        currentInt = reader.readUint32();
        currentBit = 0;
      }
      const fieldIndex = (currentInt >> currentBit) & 0x3;
      this._tocMap.set(keys[i], fieldIndex); // TOC uses 2-bit: 0=uint,1=string,2=float,3=color
      currentBit += 2;
    }
  }

  _readObjects(reader) {
    const objects = [];
    while (!reader.isEOF && reader.remaining > 0) {
      try {
        const obj = this._readObject(reader, objects.length);
        if (obj) objects.push(obj);
      } catch (e) {
        console.warn(`[RivBinaryParser] Error at object ${objects.length}, offset ${reader.offset}: ${e.message}`);
        break;
      }
    }
    return objects;
  }

  _readObject(reader, index) {
    const startOffset = reader.offset;
    const typeKey = reader.readVarUint();
    if (typeKey === 0) return null; // null object, skip

    const properties = new Map();
    while (true) {
      if (reader.isEOF) break;
      const propKey = reader.readVarUint();
      if (propKey === 0) break; // end of properties
      const value = this._readPropertyValue(reader, propKey);
      properties.set(propKey, value);
    }
    return { typeKey, index, properties, offset: startOffset };
  }

  _readPropertyValue(reader, propKey) {
    // 1) Check built-in registry first
    if (REGISTRY.has(propKey)) {
      const ft = REGISTRY.get(propKey);
      return this._readByFieldType(reader, ft);
    }
    // 2) Check file TOC
    if (this._tocMap.has(propKey)) {
      const tocFt = this._tocMap.get(propKey);
      // TOC 2-bit encoding: 0=uint, 1=string, 2=float, 3=color
      return this._readByFieldType(reader, tocFt);
    }
    // 3) Unknown — fatal for parsing accuracy
    throw new Error(`Unknown property key ${propKey} (not in registry or TOC)`);
  }

  _readByFieldType(reader, ft) {
    switch (ft) {
    case FT.UINT:   return reader.readVarUint();
    case FT.STRING: return reader.readString();
    case FT.FLOAT:  return reader.readFloat32();
    case FT.COLOR:  return reader.readUint32();
    case FT.BYTES:  return reader.readBytes();
    case FT.BOOL:   return reader.readByte();
    default:        return reader.readVarUint(); // fallback
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Categorize parsed objects
  // ═══════════════════════════════════════════════════════════════
  _categorize(header, objects) {
    const artboards = [], nodes = [], shapes = [], paths = [], vertices = [];
    const viewModels = [], dataBinds = [];

    const pathTypes = new Set([CoreType.RECTANGLE, CoreType.ELLIPSE, CoreType.TRIANGLE,
      CoreType.POLYGON, CoreType.STAR, CoreType.POINTS_PATH, CoreType.PATH]);
    const vertexTypes = new Set([CoreType.STRAIGHT_VERTEX, CoreType.CUBIC_DETACHED_VERTEX,
      CoreType.CUBIC_ASYMMETRIC_VERTEX, CoreType.CUBIC_MIRRORED_VERTEX]);
    const vmTypes = new Set([CoreType.VIEW_MODEL, CoreType.VIEW_MODEL_INSTANCE,
      CoreType.VIEW_MODEL_COMPONENT, CoreType.VIEW_MODEL_PROPERTY_NUMBER,
      CoreType.VIEW_MODEL_PROPERTY_STRING, CoreType.VIEW_MODEL_PROPERTY_BOOLEAN,
      CoreType.VIEW_MODEL_PROPERTY_LIST, CoreType.VIEW_MODEL_PROPERTY_VIEWMODEL,
      CoreType.VIEW_MODEL_INSTANCE_NUMBER, CoreType.VIEW_MODEL_INSTANCE_STRING,
      CoreType.VIEW_MODEL_INSTANCE_BOOLEAN]);
    const dbTypes = new Set([CoreType.DATA_BIND, CoreType.DATA_BIND_CONTEXT]);

    for (const obj of objects) {
      if (obj.typeKey === CoreType.ARTBOARD) artboards.push(obj);
      else if (obj.typeKey === CoreType.SHAPE) shapes.push(obj);
      else if (pathTypes.has(obj.typeKey)) paths.push(obj);
      else if (vertexTypes.has(obj.typeKey)) vertices.push(obj);
      else if (vmTypes.has(obj.typeKey)) viewModels.push(obj);
      else if (dbTypes.has(obj.typeKey)) dataBinds.push(obj);
      // Also track nodes (anything with x/y or name that isn't artboard)
      if (obj.typeKey === CoreType.NODE || obj.typeKey === CoreType.TRANSFORM_COMPONENT ||
          obj.typeKey === CoreType.SHAPE || pathTypes.has(obj.typeKey)) {
        nodes.push(obj);
      }
    }

    const primaryArtboard = artboards.length > 0 ? {
      width: artboards[0].properties.get(PropKey.WIDTH) || 0,
      height: artboards[0].properties.get(PropKey.HEIGHT) || 0,
      name: artboards[0].properties.get(PropKey.NAME) || 'Artboard',
    } : { width: 0, height: 0, name: '' };

    return {
      majorVersion: header.majorVersion,
      minorVersion: header.minorVersion,
      fileId: header.fileId,
      objects, artboard: primaryArtboard,
      nodes, shapes, paths, vertices, viewModels, dataBinds,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // High-level extraction helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Build parent-child hierarchy from parentId.
   */
  buildHierarchy(result) {
    const hierarchy = new Map();
    for (const obj of result.objects) {
      const pid = obj.properties.get(PropKey.PARENT_ID);
      if (pid !== undefined) {
        if (!hierarchy.has(pid)) hierarchy.set(pid, []);
        hierarchy.get(pid).push(obj.index);
      }
    }
    return hierarchy;
  }

  /**
   * Extract shape geometries (parametric paths → vertices).
   */
  extractShapeGeometry(result) {
    const geometries = [];
    for (const pathObj of result.paths) {
      const name = pathObj.properties.get(PropKey.NAME) || '';
      const x = pathObj.properties.get(PropKey.X) || 0;
      const y = pathObj.properties.get(PropKey.Y) || 0;
      let w = 0, h = 0, verts = [];

      if (pathObj.typeKey === CoreType.RECTANGLE) {
        w = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
        h = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
        const hw = w/2, hh = h/2;
        verts = [{x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}];
      } else if (pathObj.typeKey === CoreType.ELLIPSE) {
        w = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
        h = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
        const rx = w/2, ry = h/2, N = 8;
        for (let i = 0; i < N; i++) {
          const a = (i/N) * Math.PI * 2;
          verts.push({x: rx*Math.cos(a), y: ry*Math.sin(a)});
        }
      } else if (pathObj.typeKey === CoreType.TRIANGLE) {
        w = pathObj.properties.get(PropKey.PARAM_WIDTH) || 0;
        h = pathObj.properties.get(PropKey.PARAM_HEIGHT) || 0;
        verts = [{x:0,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}];
      } else {
        // Custom path: collect vertices that follow this path in file order
        const pathIdx = pathObj.index;
        for (const v of result.vertices) {
          if (v.index <= pathIdx) continue;
          // Stop if we hit another path
          const nextPath = result.paths.find(p => p.index > pathIdx && p.index < v.index);
          if (nextPath) break;
          const vx = v.properties.get(PropKey.VERTEX_X) || 0;
          const vy = v.properties.get(PropKey.VERTEX_Y) || 0;
          verts.push({x: vx, y: vy});
        }
        if (verts.length > 0) {
          const xs = verts.map(v=>v.x), ys = verts.map(v=>v.y);
          w = Math.max(...xs) - Math.min(...xs);
          h = Math.max(...ys) - Math.min(...ys);
        }
      }
      geometries.push({name, typeKey: pathObj.typeKey, x, y, width: w, height: h, vertices: verts, objectIndex: pathObj.index});
    }
    return geometries;
  }

  /**
   * Extract DataBind contexts.
   */
  extractDataBindings(result) {
    const bindings = [];
    for (const obj of result.dataBinds) {
      const propKey = obj.properties.get(PropKey.PROPERTY_KEY);
      const flags = obj.properties.get(PropKey.FLAGS);
      const sourcePathIds = obj.properties.get(PropKey.SOURCE_PATH_IDS);
      bindings.push({
        objectIndex: obj.index,
        typeKey: obj.typeKey,
        propertyKey: propKey,
        flags,
        sourcePathIds,
        rawProperties: Object.fromEntries(obj.properties),
      });
    }
    return bindings;
  }

  /**
   * Extract ViewModel properties.
   */
  extractViewModelProperties(result) {
    const props = [];
    for (const obj of result.viewModels) {
      const name = obj.properties.get(PropKey.NAME) || obj.properties.get(572) || '';
      let type = 'unknown';
      if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_NUMBER) type = 'number';
      else if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_STRING) type = 'string';
      else if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_BOOLEAN) type = 'boolean';
      else if (obj.typeKey === CoreType.VIEW_MODEL) type = 'viewModel';
      else if (obj.typeKey === CoreType.VIEW_MODEL_INSTANCE) type = 'instance';
      else if (obj.typeKey === CoreType.VIEW_MODEL_COMPONENT) type = 'component';
      else if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_LIST) type = 'list';
      else if (obj.typeKey === CoreType.VIEW_MODEL_PROPERTY_VIEWMODEL) type = 'viewModelRef';
      props.push({name, type, objectIndex: obj.index, typeKey: obj.typeKey});
    }
    return props;
  }
}

export { RivBinaryParser, CoreType, PropKey, FT, BinaryReader, REGISTRY };
