# 0011. Stand-in art: CC0 props, a MakeHuman player in a project-made outfit

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
* **Player: the Protagonist, a fictional warrior built in Blender with MPFB
  (MakeHuman)** after the project's concept renders (`renders/`). His base mesh,
  rig and the skin, eye, brow, lash, hair, beard and moustache assets used are
  CC0. `scripts/blender/build_protagonist.py` sets his body (heavily muscled,
  in his forties), tints the skin and hair, and `protagonist_outfit.py`
  generates the outfit from his own body: shells copied from the skin
  (leggings, boots, bracers, hip flaps), bands, tubes, cards and discs
  (headband, beadwork, necklaces, medallions, belt, aprons, braids, feathers)
  and a fur cape, all skinned to his rig, with procedurally painted textures.
  The outfit is this repository's own work. Body faces hidden under the
  shells are removed. (An earlier version wore period Seminole dress; the
  research behind it is kept in `docs/research/`.)
  `scripts/editor/import_protagonist.py` imports him into
  `Content/Characters/Protagonist`.
* **Animation: Quaternius' Universal Animation Library (CC0), retargeted.** The
  Blender script re-exports the clips the game uses in centimetres with an
  unscaled root (the original FBX has a root scaled by 100, which the retargeter
  carries into every clip). The Unreal script builds speed blend spaces on
  them (standing and crouched locomotion), retargets them and the one-shot clips
  (jump start, loop and land, roll, interact, pick up) onto the Protagonist with IK
  Rigs and an IK Retargeter, and then deletes the source and the retargeting tools:
  only the retargeted clips ship. Combat clips (sword, pistol, punch, hit,
  death) were added with the weapons and the infected (ADR 0012); the rest
  (swimming, sitting and so on) wait for the gameplay that uses them.
* **No Animation Blueprint yet.** The player's skeletal mesh runs in single-node
  mode and plays one asset at a time, chosen in C++ each tick: a one-shot action
  while one runs (the roll, jump take-off and landing, searching a container or
  depositing), the jump loop while falling, or the standing or crouched blend
  space over ground speed. Switching does not blend. The real character ticket
  brings an Animation Blueprint (blending, montages) and Enhanced Input.
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
  clearly a stand-in. The Protagonist is a fantasy design after concept art,
  not period dress, and has not been reviewed by Seminole cultural advisors. Swapping in final art means changing
  asset paths in C++ (or moving them to data assets when the art ticket asks).
* The repository carries 48.2 MB of binary content; contributors need Git LFS
  before cloning, as the README already requires. Rebuilding the Protagonist needs
  Blender 4.2+ with MPFB and its CC0 system assets; playing does not.
* Re-importing replaces the content folders wholesale; the scripts' headers say
  how. Hand edits to those assets would be lost and belong in new assets.
* Supersedes ADR 0009's "no `.uasset` is added" for the art only; its other
  decisions stand.
