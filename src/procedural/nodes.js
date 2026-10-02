import { Vector2, Vector3, Euler, Quaternion, Matrix4, Color, NoColorSpace } from './math.js';

/**
 * Engine-neutral scene description: a tree of named nodes with transforms,
 * meshes (geometry + material description), instanced meshes, lights and
 * PBR material / texture descriptions. The world, props and characters are
 * authored with these; src/engine/SceneManager.js turns the tree into
 * Babylon.js TransformNodes, Meshes (thin instances for InstancedMesh),
 * lights and PBRMaterials.
 */

export class Object3D {
  constructor() {
    this.name = '';
    this.parent = null;
    this.children = [];
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new Vector3(1, 1, 1);
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 0;
    this.userData = {};
    this.matrixWorld = new Matrix4();
  }
  add(...objects) {
    for (const o of objects) {
      if (o.parent) o.parent.remove(o);
      o.parent = this;
      this.children.push(o);
    }
    return this;
  }
  remove(object) {
    const i = this.children.indexOf(object);
    if (i >= 0) {
      this.children.splice(i, 1);
      object.parent = null;
    }
    return this;
  }
  traverse(fn) {
    fn(this);
    for (const c of this.children) c.traverse(fn);
  }
  traverseVisible(fn) {
    if (!this.visible) return;
    fn(this);
    for (const c of this.children) c.traverseVisible(fn);
  }
  getObjectByName(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const found = c.getObjectByName(name);
      if (found) return found;
    }
    return undefined;
  }
  get quaternion() {
    return new Quaternion().setFromEuler(this.rotation);
  }
  /** Local transform matrix (position, XYZ rotation, scale). */
  get matrix() {
    return new Matrix4().compose(this.position, this.quaternion, this.scale);
  }
  updateMatrixWorld() {
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
    for (const c of this.children) c.updateMatrixWorld();
  }
  /** Recomputes this node's world matrix from its ancestors. */
  updateWorldFromRoot() {
    const chain = [];
    for (let o = this; o; o = o.parent) chain.unshift(o);
    let m = new Matrix4();
    for (const o of chain) {
      m = new Matrix4().multiplyMatrices(m, o.matrix);
      o.matrixWorld.copy(m);
    }
    return this.matrixWorld;
  }
  getWorldPosition(target = new Vector3()) {
    return target.setFromMatrixPosition(this.updateWorldFromRoot());
  }
}

export class Group extends Object3D {
  constructor() {
    super();
    this.isGroup = true;
  }
}

/** Root of an authored scene; holds the environment settings as data. */
export class Scene extends Object3D {
  constructor() {
    super();
    this.isScene = true;
    this.background = null;
    this.environment = null;
    this.environmentIntensity = 1;
    this.fog = null;
  }
}

export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
  }
}

/** One geometry/material drawn many times; becomes a Babylon mesh with thin instances. */
export class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.isInstancedMesh = true;
    this.count = count;
    this.instanceMatrix = { array: new Float32Array(count * 16), needsUpdate: false };
    this.instanceColor = null;
  }
  setMatrixAt(i, matrix) {
    this.instanceMatrix.array.set(matrix.elements, i * 16);
  }
  getMatrixAt(i, matrix) {
    matrix.elements = Array.from(this.instanceMatrix.array.slice(i * 16, i * 16 + 16));
    return matrix;
  }
  setColorAt(i, color) {
    if (!this.instanceColor) this.instanceColor = { array: new Float32Array(this.count * 3).fill(1) };
    this.instanceColor.array.set([color.r, color.g, color.b], i * 3);
  }
  computeBoundingSphere() {}
}

export class Light extends Object3D {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.isLight = true;
    this.color = new Color(color);
    this.intensity = intensity;
  }
}

export class DirectionalLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.isDirectionalLight = true;
    this.target = new Object3D();
    this.shadow = {
      mapSize: new Vector2(512, 512),
      camera: { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 500 },
      bias: 0,
      normalBias: 0,
      radius: 1,
      blurSamples: 8,
    };
  }
}

export class HemisphereLight extends Light {
  constructor(skyColor, groundColor, intensity) {
    super(skyColor, intensity);
    this.isHemisphereLight = true;
    this.groundColor = new Color(groundColor);
  }
}

export class PointLight extends Light {
  constructor(color, intensity, distance = 0, decay = 2) {
    super(color, intensity);
    this.isPointLight = true;
    this.distance = distance;
    this.decay = decay;
  }
}

export class Fog {
  constructor(color, near, far) {
    this.isFog = true;
    this.color = new Color(color);
    this.near = near;
    this.far = far;
  }
}

// ---- Bounds -------------------------------------------------------------------------

export class Box3 {
  constructor() {
    this.makeEmpty();
  }
  makeEmpty() {
    this.min = new Vector3(Infinity, Infinity, Infinity);
    this.max = new Vector3(-Infinity, -Infinity, -Infinity);
    return this;
  }
  isEmpty() {
    return this.max.x < this.min.x;
  }
  expandByPoint(p) {
    this.min.min(p);
    this.max.max(p);
    return this;
  }
  /**
   * Grows the box to contain `object` and its descendants in world space.
   * `precise` transforms every vertex; otherwise the corners of each
   * geometry's local bounding box are transformed (a looser fit).
   */
  expandByObject(object, precise = false) {
    object.updateWorldFromRoot();
    object.updateMatrixWorld();
    const visit = (o) => {
      if (o.geometry) {
        const v = new Vector3();
        const pos = o.geometry.attributes.position;
        const matrices = o.isInstancedMesh
          ? Array.from({ length: o.count }, (_, i) => new Matrix4().multiplyMatrices(o.matrixWorld, o.getMatrixAt(i, new Matrix4())))
          : [o.matrixWorld];
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const { min, max } = o.geometry.boundingBox;
        for (const m of matrices) {
          if (precise) {
            for (let i = 0; i < pos.count; i++) this.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
          } else {
            for (let k = 0; k < 8; k++) {
              this.expandByPoint(v.set(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z).applyMatrix4(m));
            }
          }
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(object);
    return this;
  }
  setFromObject(object, precise = false) {
    return this.makeEmpty().expandByObject(object, precise);
  }
  getSize(target = new Vector3()) {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }
  getCenter(target = new Vector3()) {
    return target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }
}

// ---- Materials and textures -----------------------------------------------------

export const FrontSide = 0;
export const DoubleSide = 2;
export const RepeatWrapping = 'repeat';
export const LinearFilter = 'linear';
export const LinearMipmapLinearFilter = 'linear-mipmap-linear';
export const RGBAFormat = 'rgba';
export const UnsignedByteType = 'uint8';
export const HalfFloatType = 'float16';
export const EquirectangularReflectionMapping = 'equirectangular';

/**
 * Raw texel data (RGBA rows, first row at v = 0) plus sampling settings.
 * `clone()` shares the pixel data, so repeated copies of a texture cost no
 * extra memory and map to a single GPU texture.
 */
export class DataTexture {
  constructor(data, width, height, format = RGBAFormat, type = UnsignedByteType) {
    this.isTexture = true;
    this.isDataTexture = true;
    this.name = '';
    this.image = { data, width, height };
    this.format = format;
    this.type = type;
    this.colorSpace = NoColorSpace;
    this.wrapS = RepeatWrapping;
    this.wrapT = RepeatWrapping;
    this.magFilter = LinearFilter;
    this.minFilter = LinearMipmapLinearFilter;
    this.generateMipmaps = true;
    this.anisotropy = 1;
    this.mapping = null;
    this.repeat = new Vector2(1, 1);
    this.offset = new Vector2(0, 0);
    this.needsUpdate = false;
  }
  clone() {
    const t = new DataTexture(this.image.data, this.image.width, this.image.height, this.format, this.type);
    for (const key of ['name', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'generateMipmaps', 'anisotropy', 'mapping']) t[key] = this[key];
    t.image = this.image;
    t.repeat = this.repeat.clone();
    t.offset = this.offset.clone();
    return t;
  }
}

const MATERIAL_DEFAULTS = {
  map: null,
  normalMap: null,
  roughnessMap: null,
  roughness: 1,
  metalness: 0,
  emissiveIntensity: 1,
  transparent: false,
  opacity: 1,
  depthWrite: true,
  side: FrontSide,
  alphaTest: 0,
  alphaToCoverage: false,
  vertexColors: false,
  envMapIntensity: 1,
};

/** Metal/roughness PBR material description. */
export class MeshStandardMaterial {
  constructor(params = {}) {
    this.isMaterial = true;
    this.isMeshStandardMaterial = true;
    this.type = 'MeshStandardMaterial';
    this.name = '';
    this.userData = {};
    Object.assign(this, MATERIAL_DEFAULTS);
    this.color = new Color(0xffffff);
    this.emissive = new Color(0x000000);
    this.normalScale = new Vector2(1, 1);
    this.setValues(params);
  }
  setValues(params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (this[key] && this[key].isColor && !value?.isColor) this[key] = new Color(value);
      else this[key] = value;
    }
  }
  clone() {
    const copy = new this.constructor();
    for (const [key, value] of Object.entries(this)) {
      copy[key] = value && (value.isColor || value instanceof Vector2) ? value.clone() : key === 'userData' ? { ...value } : value;
    }
    return copy;
  }
  dispose() {}
}

/** Adds sheen, clearcoat, IOR and specular intensity (cloth, skin, eyes, water). */
export class MeshPhysicalMaterial extends MeshStandardMaterial {
  constructor(params = {}) {
    super();
    this.isMeshPhysicalMaterial = true;
    this.type = 'MeshPhysicalMaterial';
    this.sheen = 0;
    this.sheenRoughness = 1;
    this.sheenColor = new Color(0x000000);
    this.clearcoat = 0;
    this.clearcoatRoughness = 0;
    this.ior = 1.5;
    this.specularIntensity = 1;
    this.setValues(params);
  }
}
