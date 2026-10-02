import {
  Color3,
  Constants,
  Material,
  Mesh,
  PBRMaterial,
  RawTexture,
  Texture,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { createTerrainMaterial } from './TerrainMaterial.js';

/**
 * Turns the engine-neutral content descriptions from src/procedural/
 * (mesh data, PBR material descriptions and raw texture data) into
 * Babylon.js meshes, PBRMaterials and RawTextures, caching everything so
 * shared materials and texture data are created once.
 *
 * The game has no external model files: every model is generated in code
 * (see ASSETS_LICENSES.md), so there is nothing to load through
 * `SceneLoader`. Generated assets go through this cache instead.
 */
export class AssetManager {
  constructor(scene) {
    this.scene = scene;
    this.textures = new Map(); // pixel data -> base RawTexture
    this.textureViews = new Map(); // neutral texture -> Babylon texture (tiling applied)
    this.materials = new Map(); // neutral material -> PBRMaterial
    this.sharedBases = new Set();
  }

  /** Babylon texture for a neutral DataTexture, sharing GPU data between repeated copies. */
  texture(source, { gammaSpace = true } = {}) {
    if (!source) return null;
    if (this.textureViews.has(source)) return this.textureViews.get(source);
    const { data, width, height } = source.image;
    let base = this.textures.get(data);
    if (!base) {
      base = new RawTexture(
        data,
        width,
        height,
        Constants.TEXTUREFORMAT_RGBA,
        this.scene,
        source.generateMipmaps !== false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
      );
      base.name = source.name;
      this.textures.set(data, base);
    }
    // The first user gets the base texture; later copies (other tiling) share its GPU data.
    const view = this.sharedBases.has(base) ? base.clone() : base;
    this.sharedBases.add(base);
    view.name = source.name;
    view.gammaSpace = gammaSpace;
    view.wrapU = Texture.WRAP_ADDRESSMODE;
    view.wrapV = Texture.WRAP_ADDRESSMODE;
    view.uScale = source.repeat.x;
    view.vScale = source.repeat.y;
    view.uOffset = source.offset.x;
    view.vOffset = source.offset.y;
    view.anisotropicFilteringLevel = Math.max(4, source.anisotropy ?? 1);
    this.textureViews.set(source, view);
    return view;
  }

  /** Re-applies a neutral texture's offset (for scrolling textures such as the pond ripples). */
  syncTextureOffset(source) {
    const view = this.textureViews.get(source);
    if (view) {
      view.uOffset = source.offset.x;
      view.vOffset = source.offset.y;
    }
  }

  /** PBRMaterial for a neutral material description (cached per description). */
  material(source) {
    if (this.materials.has(source)) return this.materials.get(source);
    const material = source.userData?.splat ? createTerrainMaterial(source, this) : this.createPbr(source);
    this.materials.set(source, material);
    return material;
  }

  createPbr(source) {
    const m = new PBRMaterial(source.name || 'material', this.scene);
    m.albedoColor = toColor3(source.color);
    m.metallic = source.metalness;
    m.roughness = source.roughness;
    m.environmentIntensity = source.envMapIntensity ?? 1;
    if (source.map) m.albedoTexture = this.texture(source.map);
    if (source.normalMap) {
      m.bumpTexture = this.texture(source.normalMap, { gammaSpace: false });
      m.bumpTexture.level = source.normalScale.x;
      // Normal maps are generated in the OpenGL (+Y up) convention, like glTF.
      m.invertNormalMapX = false;
      m.invertNormalMapY = true;
    }
    if (source.roughnessMap) {
      m.metallicTexture = this.texture(source.roughnessMap, { gammaSpace: false });
      m.useRoughnessFromMetallicTextureAlpha = false;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = false;
    }
    const emissive = toColor3(source.emissive).scale(source.emissiveIntensity ?? 1);
    if (emissive.r + emissive.g + emissive.b > 0) m.emissiveColor = emissive;
    if (source.alphaTest > 0) {
      m.albedoTexture.hasAlpha = true;
      m.useAlphaFromAlbedoTexture = true;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      m.alphaCutOff = source.alphaTest;
    } else if (source.transparent) {
      m.alpha = source.opacity;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    }
    if (source.depthWrite === false) m.disableDepthWrite = true;
    if (source.side === 2) {
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
    }
    if (source.isMeshPhysicalMaterial) {
      if (source.sheen > 0) {
        m.sheen.isEnabled = true;
        m.sheen.intensity = source.sheen;
        m.sheen.color = toColor3(source.sheenColor);
        m.sheen.roughness = source.sheenRoughness;
      }
      if (source.clearcoat > 0) {
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = source.clearcoat;
        m.clearCoat.roughness = source.clearcoatRoughness;
      }
      m.indexOfRefraction = source.ior;
      m.metallicF0Factor = source.specularIntensity;
    }
    m.metadata = { kind: source.userData?.kind, source };
    return m;
  }

  /** A Babylon mesh for neutral mesh data with the given neutral material. */
  mesh(name, geometry, material) {
    const mesh = new Mesh(name, this.scene);
    // Authored faces wind counter-clockwise (right-handed convention).
    mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
    const { position, normal, uv, color } = geometry.attributes;
    const data = new VertexData();
    data.positions = position.array;
    data.indices = geometry.index ? geometry.index.array : Uint32Array.from({ length: position.count }, (_, i) => i);
    if (normal) data.normals = normal.array;
    if (uv) data.uvs = uv.array;
    // Vertex colours only count when the material asks for them.
    if (color && material.vertexColors) {
      const rgba = new Float32Array(color.count * 4);
      for (let i = 0; i < color.count; i++) rgba.set([color.getX(i), color.getY(i), color.getZ(i), 1], i * 4);
      data.colors = rgba;
    }
    data.applyToMesh(mesh, false);
    for (const [kind, attribute] of Object.entries(geometry.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(kind)) mesh.setVerticesData(kind, attribute.array, false, attribute.itemSize);
    }
    mesh.material = this.material(material);
    if (mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) mesh.hasVertexAlpha = false;
    return mesh;
  }

  dispose() {
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textureViews.values()) t.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.materials.clear();
    this.textureViews.clear();
    this.textures.clear();
  }
}

/** Neutral colours are already linear, which is what Babylon's PBR material expects. */
export function toColor3(color) {
  return color ? new Color3(color.r, color.g, color.b) : new Color3(0, 0, 0);
}
