/**
 * RUBE JSON Serializer (Web Mode).
 *
 * Serializes internal RubeScene data back to RUBE JSON format.
 * Follows RUBE compact format conventions:
 * - Boolean false values are omitted
 * - Zero number values are omitted
 * - Zero vectors are serialized as numeric 0
 *
 * Requirements: 13.1, 13.2, 13.3
 *
 * @module rubeSerializer
 */

export class RubeSerializer {
  /**
   * Serialize a complete RubeScene to a JSON string.
   * @param {import('./models.js').RubeScene} scene
   * @returns {string}
   */
  serialize(scene) {
    const data = {};

    if (scene.allowSleep) data.allowSleep = true;
    if (scene.autoClearForces) data.autoClearForces = true;

    data.body = scene.bodies.map(b => this._serializeBody(b));

    if (scene.customProperties && scene.customProperties.collisionbitplanes) {
      data.collisionbitplanes = scene.customProperties.collisionbitplanes;
    }

    if (scene.continuousPhysics) data.continuousPhysics = true;

    data.gravity = this._serializeVector(scene.gravity);

    if (scene.joints && scene.joints.length > 0) {
      data.joint = scene.joints.map(j => this._serializeJoint(j));
    }

    if (scene.images && scene.images.length > 0) {
      data.image = scene.images.map(img => this._serializeImage(img));
    }

    if (scene.customProperties && scene.customProperties.positionIterations != null) {
      data.positionIterations = scene.customProperties.positionIterations;
    }
    if (scene.customProperties && scene.customProperties.stepsPerSecond != null) {
      data.stepsPerSecond = scene.customProperties.stepsPerSecond;
    }

    data.subStepping = scene.subStepping ? true : false;

    if (scene.customProperties && scene.customProperties.velocityIterations != null) {
      data.velocityIterations = scene.customProperties.velocityIterations;
    }

    if (scene.warmStarting) data.warmStarting = true;

    // Scene-level custom properties (excluding keys already written as top-level)
    const topLevelKeys = new Set(['stepsPerSecond', 'velocityIterations', 'positionIterations', 'collisionbitplanes']);
    if (scene.customProperties) {
      const sceneProps = {};
      for (const [k, v] of Object.entries(scene.customProperties)) {
        if (!topLevelKeys.has(k)) sceneProps[k] = v;
      }
      if (Object.keys(sceneProps).length > 0) {
        const props = this._serializeCustomProperties(sceneProps);
        if (props.length > 0) data.customProperties = props;
      }
    }

    return JSON.stringify(data);
  }

  /**
   * @param {import('./models.js').RubeBody} body
   * @returns {Object}
   */
  _serializeBody(body) {
    const d = {};

    if (body.angle !== 0) d.angle = body.angle;
    if (body.angularDamping !== 0) d.angularDamping = body.angularDamping;
    if (body.angularVelocity !== 0) d.angularVelocity = body.angularVelocity;
    if (body.awake) d.awake = true;
    if (body.bullet) d.bullet = true;
    if (!body.active) d.active = false;
    if (!body.allowSleep) d.allowSleep = false;

    if (body.customProperties && Object.keys(body.customProperties).length > 0) {
      const props = this._serializeCustomProperties(body.customProperties);
      if (props.length > 0) d.customProperties = props;
    }

    if (body.fixedRotation) d.fixedRotation = true;

    d.fixture = (body.fixtures || []).map(f => this._serializeFixture(f));

    if (body.gravityScale !== 1.0) d.gravityScale = body.gravityScale;
    if (body.linearDamping !== 0) d.linearDamping = body.linearDamping;

    d.linearVelocity = this._serializeVector(body.linearVelocity);

    if (body.massDataI !== 0) d['massData-I'] = body.massDataI;
    if (body.massDataCenter && (body.massDataCenter.x !== 0 || body.massDataCenter.y !== 0)) {
      d['massData-center'] = this._serializeVector(body.massDataCenter);
    }
    if (body.massDataMass !== 0) d['massData-mass'] = body.massDataMass;

    if (body.name) d.name = body.name;

    d.position = this._serializeVector(body.position);

    if (body.bodyType !== 0) d.type = body.bodyType;

    return d;
  }

  /**
   * @param {import('./models.js').RubeFixture} fixture
   * @returns {Object}
   */
  _serializeFixture(fixture) {
    const d = {};
    const shape = fixture.shape;

    if (shape) {
      if (shape.shapeType === 'circle') {
        const circleD = {};
        if (shape.center && (shape.center.x !== 0 || shape.center.y !== 0)) {
          circleD.center = this._serializeVector(shape.center);
        }
        if (shape.radius !== 0) circleD.radius = shape.radius;
        d.circle = circleD;
      } else if (shape.shapeType === 'polygon') {
        const xs = (shape.vertices || []).map(v => v.x);
        const ys = (shape.vertices || []).map(v => v.y);
        d.polygon = { vertices: { x: xs, y: ys } };
      } else if (shape.shapeType === 'edge') {
        const edgeD = {};
        if (shape.hasVertex0) {
          edgeD.hasVertex0 = true;
          edgeD.vertex0 = this._serializeVector(shape.vertex0);
        }
        if (shape.hasVertex3) {
          edgeD.hasVertex3 = true;
          edgeD.vertex3 = this._serializeVector(shape.vertex3);
        }
        edgeD.vertex1 = this._serializeVector(shape.vertex1);
        edgeD.vertex2 = this._serializeVector(shape.vertex2);
        d.edge = edgeD;
      } else if (shape.shapeType === 'chain') {
        const chainD = {};
        if (shape.hasNextVertex) {
          chainD.hasNextVertex = true;
          chainD.nextVertex = this._serializeVector(shape.nextVertex);
        }
        if (shape.hasPrevVertex) {
          chainD.hasPrevVertex = true;
          chainD.prevVertex = this._serializeVector(shape.prevVertex);
        }
        const xs = (shape.chainVertices || []).map(v => v.x);
        const ys = (shape.chainVertices || []).map(v => v.y);
        chainD.vertices = { x: xs, y: ys };
        d.chain = chainD;
      }
    }

    d.density = fixture.density;

    if (fixture.filter) {
      if (fixture.filter.categoryBits !== 0x0001) d['filter-categoryBits'] = fixture.filter.categoryBits;
      if (fixture.filter.groupIndex !== 0) d['filter-groupIndex'] = fixture.filter.groupIndex;
      if (fixture.filter.maskBits !== 0xFFFF) d['filter-maskBits'] = fixture.filter.maskBits;
    }

    d.friction = fixture.friction;

    if (fixture.name) d.name = fixture.name;
    if (fixture.restitution !== 0) d.restitution = fixture.restitution;
    if (fixture.sensor) d.sensor = true;

    if (fixture.customProperties && Object.keys(fixture.customProperties).length > 0) {
      const props = this._serializeCustomProperties(fixture.customProperties);
      if (props.length > 0) d.customProperties = props;
    }

    return d;
  }

  /**
   * @param {import('./models.js').RubeJoint} joint
   * @returns {Object}
   */
  _serializeJoint(joint) {
    const d = {};
    d.anchorA = this._serializeVector(joint.anchorA);
    d.anchorB = this._serializeVector(joint.anchorB);
    d.bodyA = joint.bodyAIndex;
    d.bodyB = joint.bodyBIndex;
    if (joint.collideConnected) d.collideConnected = true;
    if (joint.name) d.name = joint.name;
    d.type = joint.jointType;

    if (joint.params) {
      for (const key of Object.keys(joint.params).sort()) {
        d[key] = joint.params[key];
      }
    }

    if (joint.customProperties && Object.keys(joint.customProperties).length > 0) {
      const props = this._serializeCustomProperties(joint.customProperties);
      if (props.length > 0) d.customProperties = props;
    }

    return d;
  }

  /**
   * @param {import('./models.js').RubeImage} image
   * @returns {Object}
   */
  _serializeImage(image) {
    const d = {};
    if (image.angle !== 0) d.angle = image.angle;
    if (image.aspectScale !== 1.0) d.aspectScale = image.aspectScale;
    d.body = image.bodyIndex;
    d.center = this._serializeVector(image.center);

    if (image.colorTint &&
        !(image.colorTint[0] === 255 && image.colorTint[1] === 255 &&
          image.colorTint[2] === 255 && image.colorTint[3] === 255)) {
      d.colorTint = [...image.colorTint];
    }

    if (image.corners && image.corners.length > 0) {
      const xs = image.corners.map(c => c.x);
      const ys = image.corners.map(c => c.y);
      d.corners = { x: xs, y: ys };
    }

    if (image.file) d.file = image.file;
    if (image.filter !== 0) d.filter = image.filter;
    if (image.flip) d.flip = true;
    if (image.name) d.name = image.name;
    if (image.opacity !== 1.0) d.opacity = image.opacity;
    if (image.renderOrder !== 0) d.renderOrder = image.renderOrder;
    if (image.scale !== 1.0) d.scale = image.scale;

    if (image.customProperties && Object.keys(image.customProperties).length > 0) {
      const props = this._serializeCustomProperties(image.customProperties);
      if (props.length > 0) d.customProperties = props;
    }

    return d;
  }

  /**
   * Serialize custom properties to standard RUBE format.
   * @param {Object<string, *>} props
   * @returns {Array<Object>}
   */
  _serializeCustomProperties(props) {
    const result = [];
    for (const [name, value] of Object.entries(props)) {
      const entry = { name };
      if (typeof value === 'boolean') {
        entry.bool = value;
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          entry.int = value;
        } else {
          entry.float = value;
        }
      } else if (typeof value === 'string') {
        entry.string = value;
      } else {
        console.warn(`Unrepresentable custom property type for '${name}': ${typeof value}`);
        continue;
      }
      result.push(entry);
    }
    return result;
  }

  /**
   * Serialize a Vec2 to RUBE format.
   * Returns 0 for Vec2(0,0), otherwise {x, y}.
   * @param {import('./models.js').Vec2} v
   * @returns {number|Object}
   */
  _serializeVector(v) {
    if (!v || (v.x === 0 && v.y === 0)) return 0;
    return { x: v.x, y: v.y };
  }
}
