import {
  Color4,
  Constants,
  CubeMapToSphericalPolynomialTools,
  DirectionalLight,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  PointLight,
  Quaternion,
  RawCubeTexture,
  Scene,
  ShadowGenerator,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { AssetManager, toColor3 } from './AssetManager.js';
import { updateWorld } from '../world.js';

/** Faces of the generated sky cube map (pixels per side). */
export const SKY_CUBE_SIZE = 128;
/** Edge length of the skybox; it must fit inside the camera's far plane. */
const SKYBOX_SIZE = 280;

// Direction through texel (s, t) in [-1, 1] of each cube face, in WebGL face order (+X, -X, +Y, -Y, +Z, -Z).
const FACE_DIRECTIONS = [
  (s, t) => [1, -t, -s],
  (s, t) => [-1, -t, s],
  (s, t) => [s, 1, t],
  (s, t) => [s, -1, -t],
  (s, t) => [s, -t, 1],
  (s, t) => [-s, -t, -1],
];

/** Samples `radiance(dir)` into six float RGBA cube faces. */
export function skyCubeFaces(radiance, size = SKY_CUBE_SIZE) {
  return FACE_DIRECTIONS.map((direction) => {
    const data = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [dx, dy, dz] = direction(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
        const l = Math.hypot(dx, dy, dz);
        const c = radiance({ x: dx / l, y: dy / l, z: dz / l });
        data.set([c[0], c[1], c[2], 1], (y * size + x) * 4);
      }
    }
    return data;
  });
}

/**
 * Owns the Babylon.js scene: rendering settings (right-handed, ACES tone
 * mapping, linear fog, sky IBL), the sun with a single bounded shadow
 * generator, and the conversion of the authored world description into
 * Babylon nodes. Repeated vegetation becomes thin instances.
 */
export class SceneManager {
  constructor(engine) {
    this.engine = engine;
    this.scene = new Scene(engine);
    // Content is authored right-handed (Y up, counter-clockwise faces).
    this.scene.useRightHandedSystem = true;
    this.assets = new AssetManager(this.scene);
    this.nodes = new Map(); // authored node -> Babylon node
    this.lights = new Map(); // authored light -> Babylon light
    this.shadowGenerator = null;

    const ip = this.scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1;
  }

  /** Applies an authored scene (environment, fog, lights and every object). */
  build(authored) {
    if (authored.environment?.isSky) this.applySky(authored.environment);
    this.scene.environmentIntensity = authored.environmentIntensity ?? 1;
    if (authored.fog) {
      this.scene.fogMode = Scene.FOGMODE_LINEAR;
      this.scene.fogColor = toColor3(authored.fog.color);
      this.scene.fogStart = authored.fog.near;
      this.scene.fogEnd = authored.fog.far;
      this.scene.clearColor = Color4.FromColor3(this.scene.fogColor);
    }
    for (const child of authored.children) this.instantiate(child, null);
  }

  /** Sky cube map used as both skybox and image-based lighting. */
  applySky(sky) {
    // A headless engine (NullEngine in unit tests) has no WebGL context for float cube maps.
    if (!this.engine._gl) return;
    const size = SKY_CUBE_SIZE;
    const faces = skyCubeFaces(sky.radiance, size);
    const texture = new RawCubeTexture(this.scene, faces, size, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_FLOAT, true, false);
    texture.name = sky.name;
    texture.gammaSpace = false;
    // The faces are laid out for world (right-handed) directions; no extra Z flip.
    texture.invertZ = true;
    const [right, left, up, down, front, back] = faces;
    texture.sphericalPolynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
      size, right, left, up, down, front, back,
      format: Constants.TEXTUREFORMAT_RGBA,
      type: Constants.TEXTURETYPE_FLOAT,
      gammaSpace: false,
    });
    this.scene.environmentTexture = texture;
    this.skybox = this.scene.createDefaultSkybox(texture, true, SKYBOX_SIZE, 0, false);
    this.skybox.applyFog = false;
    this.skybox.isPickable = false;
    this.skyTexture = texture;
  }

  /**
   * Creates the Babylon counterpart of an authored node and its subtree
   * under `parent`. Returns the Babylon node.
   */
  instantiate(node, parent) {
    let target;
    if (node.isInstancedMesh) target = this.instancedMesh(node);
    else if (node.isMesh) target = this.assets.mesh(node.name, node.geometry, node.material);
    else target = new TransformNode(node.name, this.scene);
    target.parent = parent;
    this.applyTransform(node, target);
    target.metadata = { source: node };
    if (target instanceof Mesh) {
      target.receiveShadows = node.receiveShadow;
      target.isVisible = node.visible;
      if (node.renderOrder) target.alphaIndex = node.renderOrder;
      if (node.castShadow) this.shadowCasters.push(target);
    }
    if (node.isLight) this.light(node, target);
    this.nodes.set(node, target);
    for (const child of node.children) this.instantiate(child, target);
    return target;
  }

  get shadowCasters() {
    this._casters ??= [];
    return this._casters;
  }

  instancedMesh(node) {
    const mesh = this.assets.mesh(node.name, node.geometry, node.material);
    mesh.thinInstanceSetBuffer('matrix', node.instanceMatrix.array, 16, true);
    if (node.instanceColor) {
      const rgb = node.instanceColor.array;
      const rgba = new Float32Array(node.count * 4);
      for (let i = 0; i < node.count; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 1], i * 4);
      mesh.thinInstanceSetBuffer('color', rgba, 4, true);
    }
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.isPickable = false;
    return mesh;
  }

  applyTransform(node, target) {
    target.position.set(node.position.x, node.position.y, node.position.z);
    const q = node.quaternion;
    if (target.rotationQuaternion) target.rotationQuaternion.set(q.x, q.y, q.z, q.w);
    else target.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    target.scaling.set(node.scale.x, node.scale.y, node.scale.z);
  }

  light(node, holder) {
    const color = toColor3(node.color);
    let light;
    if (node.isDirectionalLight) {
      const from = node.position;
      const to = node.target.position;
      light = new DirectionalLight(node.name, new Vector3(to.x - from.x, to.y - from.y, to.z - from.z).normalize(), this.scene);
      light.position = new Vector3(from.x, from.y, from.z);
      if (node.castShadow) this.createShadows(light, node.shadow);
    } else if (node.isHemisphereLight) {
      light = new HemisphericLight(node.name, new Vector3(0, 1, 0), this.scene);
      light.groundColor = toColor3(node.groundColor);
    } else {
      light = new PointLight(node.name, Vector3.Zero(), this.scene);
      light.parent = holder;
      if (node.distance) light.range = node.distance;
    }
    light.diffuse = color;
    light.specular = color;
    light.intensity = node.intensity;
    this.lights.set(node, light);
  }

  /** One standard (non-cascaded) PCF shadow map with fixed, bounded extents. */
  createShadows(light, shadow) {
    const { left, right, top, bottom, near, far } = shadow.camera;
    light.autoUpdateExtends = false;
    light.orthoLeft = left;
    light.orthoRight = right;
    light.orthoTop = top;
    light.orthoBottom = bottom;
    light.shadowMinZ = near;
    light.shadowMaxZ = far;
    const generator = new ShadowGenerator(shadow.mapSize.x, light);
    generator.usePercentageCloserFiltering = true;
    generator.filteringQuality = shadow.radius > 2 ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
    generator.bias = Math.abs(shadow.bias) * 2;
    generator.normalBias = shadow.normalBias;
    this.shadowGenerator = generator;
  }

  /** Registers every shadow-casting mesh created so far with the shadow generator. */
  flushShadowCasters() {
    if (!this.shadowGenerator) return;
    for (const mesh of this.shadowCasters) this.shadowGenerator.addShadowCaster(mesh, false);
    this.shadowCasters.length = 0;
  }

  /** Babylon meshes created for `node` and its descendants. */
  meshesFor(node) {
    const meshes = [];
    node.traverse((o) => {
      const target = this.nodes.get(o);
      if (target instanceof Mesh) meshes.push(target);
    });
    return meshes;
  }

  /**
   * Per-frame ambient animation: updates the authored world (fire flicker,
   * water ripples) and mirrors the changes onto the Babylon scene.
   */
  updateWorld(world, elapsed) {
    updateWorld(world, elapsed);
    const flames = world.getObjectByName('flames');
    for (const flame of flames?.children ?? []) this.applyTransform(flame, this.nodes.get(flame));
    for (const [node, light] of this.lights) if (node.isPointLight) light.intensity = node.intensity;
    const pond = world.getObjectByName('pond');
    for (const key of ['map', 'normalMap', 'roughnessMap']) if (pond?.material[key]) this.assets.syncTextureOffset(pond.material[key]);
  }

  dispose() {
    this.assets.dispose();
    this.scene.dispose();
  }
}

