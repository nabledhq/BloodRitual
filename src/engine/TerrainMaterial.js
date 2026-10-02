import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial.js';

/**
 * Babylon.js port of the terrain splat shader: a PBR material whose albedo
 * and roughness blend the grass, dirt and mud layers by the per-vertex
 * `splat` weights. Each layer's height (normal map alpha) pushes it through
 * the others, giving crisp, natural transitions instead of a blurry
 * cross-fade, and a low-frequency macro term hides tiling at a distance.
 */

const LAYER_SAMPLERS = (layer) => [`${layer}Map`, `${layer}Normal`, `${layer}Rough`];

const FRAGMENT_DEFINITIONS = /* glsl */ `
varying vec3 vSplat;
vec2 gUvG() { return vAlbedoUV; }
vec2 gUvD() { return vAlbedoUV * 0.83 + 0.37; }
vec2 gUvM() { return vAlbedoUV * 0.71 + 0.61; }
vec3 terrainWeights() {
  vec3 h = vec3(texture2D(grassNormal, gUvG()).a, texture2D(dirtNormal, gUvD()).a, texture2D(mudNormal, gUvM()).a);
  vec3 w = vSplat * (vec3(0.25) + h);
  float m = max(max(w.x, w.y), w.z);
  w = max(w - vec3(m - 0.22), vec3(0.0));
  return w / (w.x + w.y + w.z + 1e-5);
}
`;

const ALBEDO = /* glsl */ `
vec3 gW = terrainWeights();
vec3 gAlbedo = toLinearSpace(texture2D(grassMap, gUvG()).rgb) * gW.x
  + toLinearSpace(texture2D(dirtMap, gUvD()).rgb) * gW.y
  + toLinearSpace(texture2D(mudMap, gUvM()).rgb) * gW.z;
float gMacro = texture2D(grassNormal, vAlbedoUV * 0.043).a * 0.6 + texture2D(dirtNormal, vAlbedoUV * 0.11).a * 0.4;
surfaceAlbedo = vAlbedoColor.rgb * gAlbedo * (0.78 + 0.44 * gMacro);
`;

const ROUGHNESS = /* glsl */ `
vec3 rW = terrainWeights();
metallicRoughness.g = vReflectivityColor.g * dot(rW, vec3(
  texture2D(grassRough, gUvG()).g,
  texture2D(dirtRough, gUvD()).g,
  texture2D(mudRough, gUvM()).g));
`;

export function createTerrainMaterial(source, assets) {
  const { textures } = source.userData.splat;
  const material = new PBRCustomMaterial(source.name, assets.scene);
  material.metallic = source.metalness;
  material.roughness = source.roughness;
  material.albedoTexture = assets.texture(source.map);
  material.bumpTexture = assets.texture(source.normalMap, { gammaSpace: false });
  material.bumpTexture.level = source.normalScale.x;
  material.invertNormalMapX = false;
  material.invertNormalMapY = true;
  for (const [layer, set] of Object.entries(textures)) {
    const [map, normal, rough] = LAYER_SAMPLERS(layer);
    material.AddUniform(map, 'sampler2D', assets.texture(set.map));
    material.AddUniform(normal, 'sampler2D', assets.texture(set.normalMap, { gammaSpace: false }));
    material.AddUniform(rough, 'sampler2D', assets.texture(set.roughnessMap, { gammaSpace: false }));
  }
  material.AddAttribute('splat');
  material.Vertex_Definitions('attribute vec3 splat;\nvarying vec3 vSplat;');
  material.Vertex_MainEnd('vSplat = splat;');
  material.Fragment_Definitions(FRAGMENT_DEFINITIONS);
  material.Fragment_Custom_Albedo(ALBEDO);
  material.Fragment_Custom_MetallicRoughness(ROUGHNESS);
  material.metadata = { layers: source.userData.layers, source };
  return material;
}
