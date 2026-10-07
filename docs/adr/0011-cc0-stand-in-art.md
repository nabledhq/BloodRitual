# 0011. Stand-in art: CC0 props, a MakeHuman player in project-made period dress

Status: Accepted

## Context

Part 1 of the vertical slice (ADR 0009) shipped with engine primitives only: a
grey slab, a cylinder for the player, cubes for crates and the stockpile. That
proves the systems but not how the slice reads with real models. The repository
is public and `ASSETS_LICENSES.md` only allows CC0 (or similarly unrestricted)
third-party assets, so Epic's mannequin and MetaHumans, Mixamo, ActorCore,
Fab/Marketplace, Sketchfab-store and similar content cannot be committed. No
rigged model of a Seminole person exists under any licence, and no CC0 model of
period Seminole material culture; final art and its cultural review remain
separate work.

## Decision

* **Props and environment: CC0 models and a ground texture from Poly Haven**,
  imported by `scripts/editor/import_cc0_assets.py` into `Content/Items/Containers`
  and `Content/Environments/{Camp,Ground,Materials}`.
  * Models are imported as geometry only. Their textures are imported directly
    from the downloaded JPEGs, which keeps the JPEG source compression; the glTF
    translator would store them losslessly at two to four times the size.
  * Two master materials, `M_PropMaster` (opaque) and `M_FoliageMaster` (masked,
    two-sided), take base colour, normal and AO/roughness/metallic maps and a
    `Tint` parameter that gameplay code uses to darken searched containers.
* **Player: a Seminole man of around 1900 built in Blender with MPFB
  (MakeHuman)**, whose base mesh, rig and the skin, eye, brow, lash and hair
  assets used are CC0. `scripts/blender/build_protagonist.py` sets his body,
  tints the skin, and generates the clothing from his own body: a knee-length
  big shirt with appliqué-style bands (bands rather than machine patchwork,
  which spread in the 1910s), a finger-woven sash, a kerchief and a wrapped
  plaid turban, with procedurally painted textures. The clothing is this
  repository's own work. Body faces hidden under the shirt are removed.
  `scripts/editor/import_protagonist.py` imports him into
  `Content/Characters/Protagonist`.
* **Animation: Quaternius' Universal Animation Library (CC0), retargeted.** The
  Blender script re-exports the clips the game uses in centimetres with an
  unscaled root (the original FBX has a root scaled by 100, which the retargeter
  carries into every clip). The Unreal script builds a speed blend space on
  them, retargets it and the jump loop onto the man with IK Rigs and an IK
  Retargeter, and then deletes the source and the retargeting tools: only the
  retargeted clips ship.
* **No Animation Blueprint yet.** The player's skeletal mesh runs in single-node
  mode and plays either the blend space over ground speed (idle, walk, jog,
  sprint) or the jump loop while falling, chosen in C++ each tick. The real
  character ticket brings an Animation Blueprint and Enhanced Input.
* **Scripted, repeatable imports.** The project enables the **Python Editor
  Script Plugin** (editor only). Engine operations Python cannot reach (building
  a blend space's runtime data) go through `UBloodRitualEditorScripting`, an
  editor-only (`WITH_EDITOR`) function library in the game module, so no
  separate editor module is needed yet. Imported `.uasset` files are committed
  through Git LFS (ADR 0008); downloads and build outputs are not.
* **C++ keeps referencing assets from class defaults** (`ConstructorHelpers`),
  as the primitives did, and falls back to the `/Engine/BasicShapes` shapes if an
  asset is missing (for example when Git LFS content was not pulled).
  `Config/DefaultGame.ini` always cooks the three content folders.
* **A sky.** `ABloodRitualTestEnvironment` also spawns a sky atmosphere driven by
  the sun, before the sky light, which captures it once. (Real-time capture of a
  runtime-spawned atmosphere left the shadowed side of skinned meshes black.)
  The day clock keeps dimming both lights. Runtime spawning otherwise stays as in
  ADR 0009, plus the camp scenery (a fixed-seed scatter that keeps the
  hub-to-scavenging corridor clear). The noise listener stays a debug sphere
  until the AI ticket.

## Consequences

* The slice is readable and closer to the setting, while every piece is still
  clearly a stand-in: the man is a game-art interpretation that has not been
  reviewed by Seminole cultural advisors. Swapping in final art means changing
  asset paths in C++ (or moving them to data assets when the art ticket asks).
* The repository carries 40.9 MB of binary content; contributors need Git LFS
  before cloning, as the README already requires. Rebuilding the man needs
  Blender 4.2+ with MPFB and its CC0 system assets; playing does not.
* Re-importing replaces the content folders wholesale; the scripts' headers say
  how. Hand edits to those assets would be lost and belong in new assets.
* Supersedes ADR 0009's "no `.uasset` is added" for the art only; its other
  decisions stand.
