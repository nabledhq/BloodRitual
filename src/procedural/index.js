/**
 * Engine-neutral authoring kernel for procedural content: maths, mesh data
 * and a lightweight scene description. Nothing here renders; the Babylon.js
 * engine layer in src/engine/ instantiates what these describe.
 */
export * from './math.js';
export * from './mesh-data.js';
export * from './nodes.js';
