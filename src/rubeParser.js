/**
 * RUBE JSON Parser (Web Mode).
 *
 * Parses RUBE editor exported .json strings into internal data models.
 * Supports standard RUBE format and GSON format for CustomProperties.
 * Handles RUBE compact format conventions (0 → Vec2(0,0), missing booleans → false).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 12.5, 12.6, 12.7
 *
 * @module rubeParser
 */

import { BodyType, createVec2, createCollisionFilter } from './models.js';

export class RubeParser {
  /**
   * Parse a JSON string and return a complete RubeScene.
   * @param {string} jsonString - RUBE JSON string
   * @returns {import('./models.js').RubeScene}
   * @throws {SyntaxError} If the string contains invalid JSON
   * @throws {Error} If required fields (gravity, body) are missing
   */
  parse(jsonString) {
    const data = JSON.parse(jsonString);

    // Validate required fields
    const missing = [];
    if (!('gravity' in data)) missing.push('gravity');
    if (!('body' in data)) missing.push('body');
    if (missing.length > 0) {
      throw new Error(`Missing required RUBE fields: ${missing.join(', ')}`);
    }

    /** @type {import('./models.js').RubeScene} */
    const scene = {
      gravity: this._parseVector(data.gravity ?? 0),
      allowSleep: data.allowSleep ?? false,
      autoClearForces: data.autoClearForces ?? false,
      warmStarting: data.warmStarting ?? false,
      continuousPhysics: data.continuousPhysics ?? false,
      subStepping: data.subStepping ?? false,
      bodies: [],
      joints: [],
      images: [],
      customProperties: {},
    };

    // World settings stored in customProperties
    if ('stepsPerSecond' in data) scene.customProperties.stepsPerSecond = data.stepsPerSecond;
    if ('velocityIterations' in data) scene.customProperties.velocityIterations = data.velocityIterations;
    if ('positionIterations' in data) scene.customProperties.positionIterations = data.positionIterations;
    if ('collisionbitplanes' in data) scene.customProperties.collisionbitplanes = data.collisionbitplanes;

    // Scene-level custom properties
    const sceneCustom = this._parseCustomProperties(data.customProperties ?? []);
    Object.assign(scene.customProperties, sceneCustom);

    // Bodies
    const bodyList = data.body ?? [];
    const numBodies = bodyList.length;
    for (let i = 0; i < bodyList.length; i++) {
      scene.bodies.push(this._parseBody(bodyList[i], i));
    }

    // Joints
    for (const jointData of (data.joint ?? [])) {
      const joint = this._parseJoint(jointData);
      if (joint.bodyAIndex < 0 || joint.bodyAIndex >= numBodies) {
        console.warn(`Joint '${joint.name}' references invalid bodyA index ${joint.bodyAIndex} (max ${numBodies - 1}), skipping`);
        continue;
      }
      if (joint.bodyBIndex < 0 || joint.bodyBIndex >= numBodies) {
        console.warn(`Joint '${joint.name}' references invalid bodyB index ${joint.bodyBIndex} (max ${numBodies - 1}), skipping`);
        continue;
      }
      scene.joints.push(joint);
    }

    // Images
    for (const imageData of (data.image ?? [])) {
      scene.images.push(this._parseImage(imageData));
    }

    return scene;
  }

  /**
   * Parse a single body definition from RUBE JSON.
   * @param {Object} bodyData
   * @param {number} index
   * @returns {import('./models.js').RubeBody}
   */
  _parseBody(bodyData, index) {
    return {
      index,
      name: bodyData.name ?? '',
      bodyType: bodyData.type ?? BodyType.STATIC,
      position: this._parseVector(bodyData.position ?? 0),
      angle: Number(bodyData.angle ?? 0),
      linearVelocity: this._parseVector(bodyData.linearVelocity ?? 0),
      angularVelocity: Number(bodyData.angularVelocity ?? 0),
      linearDamping: Number(bodyData.linearDamping ?? 0),
      angularDamping: Number(bodyData.angularDamping ?? 0),
      gravityScale: Number(bodyData.gravityScale ?? 1.0),
      bullet: bodyData.bullet ?? false,
      allowSleep: bodyData.allowSleep ?? true,
      awake: bodyData.awake ?? false,
      active: bodyData.active ?? true,
      fixedRotation: bodyData.fixedRotation ?? false,
      massDataMass: Number(bodyData['massData-mass'] ?? 0),
      massDataCenter: this._parseVector(bodyData['massData-center'] ?? 0),
      massDataI: Number(bodyData['massData-I'] ?? 0),
      fixtures: (bodyData.fixture ?? []).map(f => this._parseFixture(f)),
      customProperties: this._parseCustomProperties(bodyData.customProperties ?? []),
    };
  }

  /**
   * Parse a single fixture definition from RUBE JSON.
   * @param {Object} fixtureData
   * @returns {import('./models.js').RubeFixture}
   */
  _parseFixture(fixtureData) {
    let shape;
    if ('circle' in fixtureData) {
      shape = this._parseCircleShape(fixtureData.circle);
    } else if ('polygon' in fixtureData) {
      shape = this._parsePolygonShape(fixtureData.polygon);
    } else if ('edge' in fixtureData) {
      shape = this._parseEdgeShape(fixtureData.edge);
    } else if ('chain' in fixtureData) {
      shape = this._parseChainShape(fixtureData.chain);
    } else {
      shape = { shapeType: 'polygon', vertices: [] };
    }

    const filter = createCollisionFilter();
    if (fixtureData['filter-categoryBits'] != null) filter.categoryBits = fixtureData['filter-categoryBits'];
    if (fixtureData['filter-maskBits'] != null) filter.maskBits = fixtureData['filter-maskBits'];
    if (fixtureData['filter-groupIndex'] != null) filter.groupIndex = fixtureData['filter-groupIndex'];

    return {
      name: fixtureData.name ?? '',
      shape,
      density: Number(fixtureData.density ?? 0),
      friction: Number(fixtureData.friction ?? 0),
      restitution: Number(fixtureData.restitution ?? 0),
      sensor: fixtureData.sensor ?? false,
      filter,
      customProperties: this._parseCustomProperties(fixtureData.customProperties ?? []),
    };
  }

  /** @returns {import('./models.js').RubeShape} */
  _parseCircleShape(shapeData) {
    return {
      shapeType: 'circle',
      radius: Number(shapeData.radius ?? 0),
      center: this._parseVector(shapeData.center ?? 0),
    };
  }

  /** @returns {import('./models.js').RubeShape} */
  _parsePolygonShape(shapeData) {
    const vertices = shapeData.vertices ?? {};
    const xs = vertices.x ?? [];
    const ys = vertices.y ?? [];
    return {
      shapeType: 'polygon',
      vertices: xs.map((x, i) => createVec2(Number(x), Number(ys[i]))),
    };
  }

  /** @returns {import('./models.js').RubeShape} */
  _parseEdgeShape(shapeData) {
    const shape = {
      shapeType: 'edge',
      vertex1: this._parseVector(shapeData.vertex1 ?? 0),
      vertex2: this._parseVector(shapeData.vertex2 ?? 0),
      hasVertex0: shapeData.hasVertex0 ?? false,
      hasVertex3: shapeData.hasVertex3 ?? false,
      vertex0: createVec2(),
      vertex3: createVec2(),
    };
    if (shape.hasVertex0) shape.vertex0 = this._parseVector(shapeData.vertex0 ?? 0);
    if (shape.hasVertex3) shape.vertex3 = this._parseVector(shapeData.vertex3 ?? 0);
    return shape;
  }

  /** @returns {import('./models.js').RubeShape} */
  _parseChainShape(shapeData) {
    const vertices = shapeData.vertices ?? {};
    const xs = vertices.x ?? [];
    const ys = vertices.y ?? [];
    const shape = {
      shapeType: 'chain',
      chainVertices: xs.map((x, i) => createVec2(Number(x), Number(ys[i]))),
      hasPrevVertex: shapeData.hasPrevVertex ?? false,
      hasNextVertex: shapeData.hasNextVertex ?? false,
      prevVertex: createVec2(),
      nextVertex: createVec2(),
    };
    if (shape.hasPrevVertex) shape.prevVertex = this._parseVector(shapeData.prevVertex ?? 0);
    if (shape.hasNextVertex) shape.nextVertex = this._parseVector(shapeData.nextVertex ?? 0);
    return shape;
  }

  /**
   * Parse a single joint definition from RUBE JSON.
   * @param {Object} jointData
   * @returns {import('./models.js').RubeJoint}
   */
  _parseJoint(jointData) {
    const skipKeys = new Set([
      'type', 'name', 'bodyA', 'bodyB', 'collideConnected',
      'anchorA', 'anchorB', 'customProperties',
    ]);
    const params = {};
    for (const [key, value] of Object.entries(jointData)) {
      if (!skipKeys.has(key)) params[key] = value;
    }

    return {
      name: jointData.name ?? '',
      jointType: jointData.type ?? 'revolute',
      bodyAIndex: Number(jointData.bodyA ?? 0),
      bodyBIndex: Number(jointData.bodyB ?? 0),
      collideConnected: jointData.collideConnected ?? false,
      anchorA: this._parseVector(jointData.anchorA ?? 0),
      anchorB: this._parseVector(jointData.anchorB ?? 0),
      params,
      customProperties: this._parseCustomProperties(jointData.customProperties ?? []),
    };
  }

  /**
   * Parse a single image definition from RUBE JSON.
   * @param {Object} imageData
   * @returns {import('./models.js').RubeImage}
   */
  _parseImage(imageData) {
    let colorTint = [255, 255, 255, 255];
    const ct = imageData.colorTint;
    if (Array.isArray(ct) && ct.length >= 4) {
      colorTint = [Number(ct[0]), Number(ct[1]), Number(ct[2]), Number(ct[3])];
    }

    let corners = [];
    const cornersData = imageData.corners;
    if (cornersData && typeof cornersData === 'object' && !Array.isArray(cornersData)) {
      const xs = cornersData.x ?? [];
      const ys = cornersData.y ?? [];
      corners = xs.map((x, i) => createVec2(Number(x), Number(ys[i])));
    } else if (Array.isArray(cornersData)) {
      corners = cornersData.map(c => this._parseVector(c));
    }

    return {
      bodyIndex: Number(imageData.body ?? -1),
      name: imageData.name ?? '',
      file: imageData.file ?? '',
      center: this._parseVector(imageData.center ?? 0),
      angle: Number(imageData.angle ?? 0),
      scale: Number(imageData.scale ?? 1.0),
      aspectScale: Number(imageData.aspectScale ?? 1.0),
      flip: imageData.flip ?? false,
      opacity: Number(imageData.opacity ?? 1.0),
      filter: Number(imageData.filter ?? 0),
      renderOrder: Number(imageData.renderOrder ?? 0),
      colorTint,
      corners,
      customProperties: this._parseCustomProperties(imageData.customProperties ?? []),
    };
  }

  /**
   * Parse CustomProperty array, supporting both standard RUBE and GSON formats.
   *
   * Standard RUBE format: [{"name": "VM", "string": "b2"}, {"name": "count", "int": 5}]
   * GSON format: [{"VM": "b2"}, {"count": 5}]
   *
   * @param {Array} propsData
   * @returns {Object<string, *>}
   */
  _parseCustomProperties(propsData) {
    if (!propsData || !Array.isArray(propsData)) return {};

    const result = {};
    for (const prop of propsData) {
      if (!prop || typeof prop !== 'object') continue;

      if ('name' in prop) {
        // Standard RUBE format
        const name = prop.name;
        for (const typeKey of ['string', 'int', 'float', 'bool', 'vec2', 'color']) {
          if (typeKey in prop) {
            result[name] = prop[typeKey];
            break;
          }
        }
      } else {
        // GSON format — each dict has a single key-value pair
        for (const [key, value] of Object.entries(prop)) {
          result[key] = value;
        }
      }
    }
    return result;
  }

  /**
   * Parse a vector value, handling RUBE compact format.
   * RUBE convention: numeric 0 implicitly represents Vec2(0, 0).
   *
   * @param {Object|number} data
   * @returns {import('./models.js').Vec2}
   */
  _parseVector(data) {
    if (data && typeof data === 'object') {
      return createVec2(Number(data.x ?? 0), Number(data.y ?? 0));
    }
    return createVec2(0, 0);
  }
}
