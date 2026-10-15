"""Builds the Protagonist, the player character, with MPFB (MakeHuman for Blender).

He is a fictional warrior modelled after the concept renders in renders/: a heavily muscled,
bearded man in his forties with long braided hair, bare-chested, in a beaded and feathered
outfit with a long fur cape.

The body, skin, eyes, brows, lashes, hair, beard, moustache and the game-engine rig come from
MPFB and its CC0 asset packs (see ASSETS_LICENSES.md). The outfit is generated from the body by
protagonist_outfit.py and is this repository's own work (MIT), as are its procedurally painted
textures. Body faces hidden under the leggings, boots and bracers are removed so they cannot
poke through. The result is exported, with its textures and a manifest, for
scripts/editor/import_protagonist.py to import into Unreal.

Requirements: Blender 4.2+ with the MPFB extension and the CC0 "MakeHuman system assets",
"skins02" and "bodyparts05" packs installed (MPFB > Apply assets > Library settings, or unzip
them into MPFB's user data folder).

Run headless:

    blender -b --factory-startup --python scripts/blender/build_protagonist.py -- [OUTPUT_DIR] [--preview]

OUTPUT_DIR defaults to <repo>/Saved/CharacterBuild (ignored by Git). --preview also renders front,
back, side and head images of the character there. --no-animations skips re-exporting the animation
source (for quick previews; the manifest then lists no clips, so don't import that build).
"""

import bpy
import bmesh
import importlib
import json
import math
import os
import shutil
import sys
import urllib.request
import zipfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import protagonist_outfit as outfit  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = next((a for a in ARGS if not a.startswith("--")), os.path.join(REPO, "Saved", "CharacterBuild"))
PREVIEW = "--preview" in ARGS

MPFB = "bl_ext.user_default.mpfb"
HumanService = importlib.import_module(MPFB + ".services.humanservice").HumanService

# --- The Protagonist ---------------------------------------------------------------------------

# MakeHuman macros, 0..1. Age 0.65 is about 45 years. The ancestry mix is tuned by eye
# against the renders, not after any person.
PHENOTYPE = {"gender": 1.0, "age": 0.65, "muscle": 1.0, "weight": 0.62, "proportions": 0.85, "height": 0.7,
             "race": {"asian": 0.6, "african": 0.2, "caucasian": 0.2}}
BODY_PARTS = {
    "eyes": "high-poly/high-poly.mhclo",
    "eyebrows": "eyebrow001/eyebrow001.mhclo",
    "eyelashes": "eyelashes01/eyelashes01.mhclo",
    "hair": "long01/long01.mhclo",
}
# Facial hair from the "bodyparts05" pack (CC0 in both the pack index and the files).
CLOTHES = ["rehmanpolanski_beard_viking/rehmanpolanski_beard_viking.mhclo",
           "rehmanpolanski_moustache_viking/rehmanpolanski_moustache_viking.mhclo"]
SKIN = "middleage_asian_male/middleage_asian_male.mhmat"
# Multiplies the skin texture towards a warm tan.
SKIN_TONE = (0.82, 0.58, 0.42)
# Hair and beard: near-black, the beard greying a little.
HAIR_TONE = (0.30, 0.26, 0.24)
BEARD_GREY = 0.18

# Animation source: Quaternius' Universal Animation Library (CC0), the author's OpenGameArt upload.
# Unreal retargets these clips onto him; this script only cleans the file for that.
UAL_ZIP_URL = "https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip"
UAL_FBX_IN_ZIP = "Animation Library[Standard]/Unreal Engine/AL_Standard.fbx"
UAL_CLIPS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Idle_Loop", "Crouch_Fwd_Loop",
             "Jump_Start", "Jump_Loop", "Jump_Land", "Roll", "Interact", "PickUp_Table",
             # Combat: melee, firearm and bow poses, hit reactions and death (the infected share them).
             "Sword_Idle", "Sword_Attack", "Punch_Cross", "Pistol_Idle_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot",
             "Pistol_Reload", "Hit_Chest", "Death01"]


# --- Helpers -----------------------------------------------------------------------------------

def deform_names(obj):
    arm = obj.find_armature()
    return {b.name for b in arm.data.bones} if arm else set()


def group_index(obj, name):
    group = obj.vertex_groups.get(name)
    return group.index if group else -1


def bake_shape_keys(obj):
    """Applies the MPFB targets (shape keys) to the mesh itself."""
    if not obj.data.shape_keys:
        return
    mix = obj.shape_key_add(name="__mix", from_mix=True)
    coords = [0.0] * (len(obj.data.vertices) * 3)
    mix.data.foreach_get("co", coords)
    obj.shape_key_clear()
    obj.data.vertices.foreach_set("co", coords)
    obj.data.update()


def make_image(name, pixels):
    """pixels: float array (H, W, 3|4) in 0..1, row 0 at the bottom (Blender convention)."""
    h, w = pixels.shape[:2]
    if pixels.shape[2] == 3:
        pixels = np.concatenate([pixels, np.ones((h, w, 1), dtype=np.float32)], axis=2)
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    return image


def save_image(image, path):
    """PNG, or JPEG (quality 90) for a .jpg path: the repository's asset budget is 50 MB."""
    image.filepath_raw = path
    if path.lower().endswith(".jpg"):
        image.file_format = "JPEG"
        image.save(quality=90)
    else:
        image.file_format = "PNG"
        image.save()


def textured_material(name, image, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return mat


# --- Build -------------------------------------------------------------------------------------

def build_human(name="Protagonist", body_parts=None, clothes=None, skin=SKIN, proxy=""):
    """The MakeHuman body with the game-engine rig. Every character shares PHENOTYPE, so they all
    get the same skeleton and can share one set of animations in Unreal."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    info = HumanService._create_default_human_info_dict()
    info["name"] = name
    info["phenotype"].update({k: v for k, v in PHENOTYPE.items() if k != "race"})
    info["phenotype"]["race"] = dict(PHENOTYPE["race"])
    info["rig"] = "game_engine"
    info.update(BODY_PARTS if body_parts is None else body_parts)
    info["clothes"] = list(CLOTHES if clothes is None else clothes)
    info["proxy"] = proxy
    info["skin_mhmat"] = skin
    info["skin_material_type"] = "GAMEENGINE"
    info["eyes_material_type"] = "GAMEENGINE"
    info["clothes_material_type"] = "GAMEENGINE"
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    basemesh = HumanService.deserialize_from_dict(info, settings)
    armature = basemesh.find_armature()
    return armature, basemesh


def hide_covered_body(basemesh, covered):
    """Deletes body faces deep under the outfit's shells, keeping a two-ring border at their openings."""
    bm = bmesh.new()
    bm.from_mesh(basemesh.data)
    bm.verts.ensure_lookup_table()
    covered_verts = {bm.verts[i] for i in covered}
    border = {v for v in covered_verts if any(e.other_vert(v) not in covered_verts for e in v.link_edges)}
    for _ in range(2):
        border |= {e.other_vert(v) for v in border for e in v.link_edges}
    inner = covered_verts - border
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in inner for v in f.verts)], context="FACES")
    bm.to_mesh(basemesh.data)
    bm.free()


def remove_helpers(basemesh):
    bm = bmesh.new()
    bm.from_mesh(basemesh.data)
    dl = bm.verts.layers.deform.verify()
    body_gi = group_index(basemesh, "body")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[dl].get(body_gi, 0) < 0.5], context="VERTS")
    bm.to_mesh(basemesh.data)
    bm.free()
    bones = deform_names(basemesh)
    for group in list(basemesh.vertex_groups):
        if group.name not in bones:
            basemesh.vertex_groups.remove(group)
    for modifier in list(basemesh.modifiers):
        if modifier.type != "ARMATURE":
            basemesh.modifiers.remove(modifier)


# --- Textures ----------------------------------------------------------------------------------

def adjust_skin(material, out_path):
    tex = next(n for n in material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
    src = tex.image
    w, h = src.size
    px = np.array(src.pixels[:], dtype=np.float32).reshape(h, w, 4)
    px[..., :3] *= np.array(SKIN_TONE, dtype=np.float32)
    image = make_image("T_Protagonist_Skin", px)
    save_image(image, out_path)
    return image


def tint_hair(image, size, grey=0.0):
    """Darkens a hair texture towards HAIR_TONE, mixing in some grey, and resizes it."""
    if image.size[0] > size:
        image.scale(size, size)
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    luminance = px[..., :3].mean(axis=2, keepdims=True)
    px[..., :3] = luminance * np.array(HAIR_TONE, dtype=np.float32) * (1.0 - grey) + luminance * 0.75 * grey
    image.pixels.foreach_set(px.ravel())
    return image


# --- Export ------------------------------------------------------------------------------------

def render_previews(armature):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.light = "STUDIO"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, location, rotation in (("front", (0.0, -4.2, 1.0), (math.radians(88), 0, 0)),
                                     ("back", (0.0, 4.2, 1.0), (math.radians(88), 0, math.radians(180))),
                                     ("side", (4.2, 0.0, 1.0), (math.radians(88), 0, math.radians(90))),
                                     ("head", (0.45, -1.3, 1.68), (math.radians(90), 0, math.radians(25)))):
        cam.location = location
        cam.rotation_euler = rotation
        cam_data.lens = 70 if name != "head" else 85
        scene.render.filepath = os.path.join(OUT_DIR, "preview_" + name + ".png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def action_fcurves(action):
    """F-curves of an action, for both the classic and the layered (Blender 4.4+) action model."""
    if getattr(action, "fcurves", None):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def export_for_unreal(armature, objects, path, animations=False):
    """Unreal reads the exported numbers as centimetres: scale everything up 100x and apply it, so
    bone translations are in centimetres and the root keeps a scale of 1 (a scaled root would be
    carried into every retargeted clip). Location keys are scaled to match."""
    armature.name = "Armature"  # Unreal drops a root node with this name
    for obj in bpy.data.objects:
        obj.select_set(obj in objects)
    bpy.context.view_layer.objects.active = armature
    armature.scale = (100.0, 100.0, 100.0)
    with bpy.context.temp_override(selected_editable_objects=objects, selected_objects=objects, active_object=armature):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if animations:
        for action in bpy.data.actions:
            for fcurve in action_fcurves(action):
                if fcurve.data_path.endswith(".location"):
                    for key in fcurve.keyframe_points:
                        key.co.y *= 100.0
                        key.handle_left.y *= 100.0
                        key.handle_right.y *= 100.0
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE", "MESH"},
                             add_leaf_bones=False, apply_scale_options="FBX_SCALE_ALL", mesh_smooth_type="FACE",
                             use_armature_deform_only=True, path_mode="STRIP",
                             bake_anim=animations, bake_anim_use_all_actions=animations,
                             bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=animations)


def export_animation_source():
    """Re-exports Quaternius' mannequin and the locomotion clips in the same clean form as the Protagonist.
    Returns the clip names."""
    cache = os.path.join(REPO, "Saved", "CC0Downloads", "quaternius_ual")
    os.makedirs(cache, exist_ok=True)
    zip_path = os.path.join(cache, "universal_animation_librarystandard.zip")
    if not os.path.exists(zip_path):
        request = urllib.request.Request(UAL_ZIP_URL, headers={"User-Agent": "seminole-asset-build"})
        with urllib.request.urlopen(request, timeout=300) as response, open(zip_path, "wb") as out:
            out.write(response.read())
    fbx_path = os.path.join(cache, "AL_Standard.fbx")
    if not os.path.exists(fbx_path):
        with zipfile.ZipFile(zip_path) as archive, open(fbx_path, "wb") as out:
            out.write(archive.read(UAL_FBX_IN_ZIP))

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.fbx(filepath=fbx_path, use_anim=True)
    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    # Takes are named after the rig and the clip, e.g. "Rig|Idle_Loop"; keep the clips the game uses.
    for action in list(bpy.data.actions):
        take = action.name.split("|")[-1]
        if take in UAL_CLIPS:
            action.name = take
        else:
            bpy.data.actions.remove(action)
    if armature.animation_data:
        armature.animation_data.action = None
    objects = [armature] + [o for o in bpy.data.objects if o.parent is armature]
    # Bake the importer's root rotation and scale into the data before scaling to centimetres.
    for obj in bpy.data.objects:
        obj.select_set(obj in objects)
    with bpy.context.temp_override(selected_editable_objects=objects, selected_objects=objects, active_object=armature):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    export_for_unreal(armature, objects, os.path.join(OUT_DIR, "AnimationSource.fbx"), animations=True)
    return sorted(action.name for action in bpy.data.actions)


def main():
    # Start from an empty texture folder so no texture from an earlier build survives.
    shutil.rmtree(os.path.join(OUT_DIR, "textures"), ignore_errors=True)
    os.makedirs(os.path.join(OUT_DIR, "textures"), exist_ok=True)
    armature, basemesh = build_human()
    parts = {o.name.split(".", 1)[1]: o for o in armature.children if o is not basemesh and "." in o.name}
    print("build_protagonist: parts", sorted(parts))

    bake_shape_keys(basemesh)
    for modifier in list(basemesh.modifiers):
        if modifier.type == "MASK":
            basemesh.modifiers.remove(modifier)

    shells, covered = outfit.build_shells(basemesh, armature)
    accessories = outfit.build_accessories(basemesh, armature, parts)
    hide_covered_body(basemesh, covered)
    remove_helpers(basemesh)

    textures = os.path.join(OUT_DIR, "textures")
    manifest = {"materials": {}}
    materials = {}

    def register(obj, material_name, image, path, masked=False, two_sided=False):
        if material_name not in materials:
            if image is not None and path is not None and not os.path.exists(path):
                save_image(image, path)  # copied textures are already in place
            materials[material_name] = textured_material(material_name, image, alpha=masked)
            manifest["materials"][material_name] = {"texture": os.path.basename(path), "masked": masked,
                                                    "two_sided": two_sided}
        obj.data.materials.clear()
        obj.data.materials.append(materials[material_name])

    skin_path = os.path.join(textures, "T_Protagonist_Skin.jpg")
    skin = adjust_skin(basemesh.data.materials[0], skin_path)
    register(basemesh, "M_Protagonist_Skin", skin, skin_path)

    painted = {}
    for obj, part in shells + accessories:
        if obj is None:
            continue
        painter, masked, two_sided = outfit.TEXTURES[part]
        if part not in painted:
            painted[part] = make_image("T_Protagonist_" + part, painter())
        register(obj, "M_Protagonist_" + part, painted[part], os.path.join(textures, "T_Protagonist_" + part + ".png"),
                 masked=masked, two_sided=two_sided)

    body_parts = (("high-poly", "Eyes", False), ("eyebrow001", "Eyebrows", True), ("eyelashes01", "Eyelashes", True),
                  ("long01", "Hair", True), ("rehmanpolanski_beard_viking", "Beard", True),
                  ("rehmanpolanski_moustache_viking", "Moustache", True))
    for key, name, masked in body_parts:
        obj = parts[key]
        tex = next(n for n in obj.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image).image
        path = os.path.join(textures, "T_Protagonist_" + name + ".png")
        if name in ("Hair", "Beard", "Moustache"):
            # Retinted; 1024 px (512 for the facial hair) keeps within the asset budget.
            tint_hair(tex, 1024 if name == "Hair" else 512, 0.0 if name == "Hair" else BEARD_GREY)
            save_image(tex, path)
        else:
            shutil.copyfile(bpy.path.abspath(tex.filepath), path)
        register(obj, "M_Protagonist_" + name, tex, path, masked=masked, two_sided=masked)
    for key in list(parts):
        if key not in {k for k, _, _ in body_parts}:
            bpy.data.objects.remove(parts[key], do_unlink=True)

    if PREVIEW:
        render_previews(armature)

    height = max((basemesh.matrix_world @ v.co).z for v in basemesh.data.vertices)
    exported = [armature] + [o for o in bpy.data.objects if o.parent is armature]
    export_for_unreal(armature, exported, os.path.join(OUT_DIR, "Protagonist.fbx"))
    # His right hand in the exported rest pose (Blender axes, centimetres after the export's x100):
    # scripts/blender/build_weapons.py builds each weapon in this grip.
    bones = armature.data.bones
    manifest["hand_r"] = {key: list(bones[bone].head_local)
                          for key, bone in (("wrist", "hand_r"), ("middle", "middle_01_r"), ("index", "index_01_r"),
                                            ("pinky", "pinky_01_r"))}
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "Protagonist.blend"))
    manifest["fbx"] = "Protagonist.fbx"
    manifest["animation_source"] = "AnimationSource.fbx"
    manifest["clips"] = [] if "--no-animations" in ARGS else export_animation_source()
    manifest["height_m"] = height
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as out:
        json.dump(manifest, out, indent=2)
    print("build_protagonist: wrote", OUT_DIR)

if __name__ == "__main__":
    main()
