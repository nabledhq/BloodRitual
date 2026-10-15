"""Builds the infected, the slice's first enemy, with MPFB (MakeHuman for Blender).

The infected share the Protagonist's phenotype and game-engine rig, so their skeleton matches his
bone for bone: in Unreal they are imported onto SK_Protagonist and play his retargeted clips, with
no animations of their own. To stay inside the asset budget they use MakeHuman's CC0 1591-vertex
"male1591" proxy body and low-poly eyes, no hair, and in Unreal reuse the Protagonist's skin and
eye textures, tinted. Their rags (torn trousers and the remains of a shirt) are generated here from
the body and are this repository's own work (MIT), with one small painted texture.

Run after scripts/blender/build_protagonist.py (same requirements):

    blender -b --python scripts/blender/build_infected.py -- [--preview]

Writes Saved/CharacterBuild/Infected.fbx, textures/T_Infected_Rags.png and infected.json for
scripts/editor/import_protagonist.py.
"""

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_protagonist as protagonist  # noqa: E402

OUT_DIR = protagonist.OUT_DIR
PREVIEW = protagonist.PREVIEW
BODY_PARTS = {"eyes": "low-poly/low-poly.mhclo", "eyebrows": "", "eyelashes": "", "hair": ""}
PROXY = "male1591/male1591.proxy"
SKIN_PREVIEW_TINT = (0.62, 0.66, 0.58)   # the Unreal material instance tints the shared skin like this
RAG = (0.50, 0.44, 0.34)


def apply_modifiers_and_shape(obj):
    protagonist.bake_shape_keys(obj)
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            continue
        with bpy.context.temp_override(object=obj, active_object=obj):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except RuntimeError:
                obj.modifiers.remove(modifier)


def rag_shell(body, armature, name, keep, offset):
    """Copies the body faces whose vertices keep(co, dominant_bone) accepts, pushed out by offset,
    with UVs around the body (u) and by height (v)."""
    shell = body.copy()
    shell.data = body.data.copy()
    shell.name = name
    bpy.context.scene.collection.objects.link(shell)
    bones = {b.name for b in armature.data.bones}
    to_bone = {g.index: g.name for g in shell.vertex_groups if g.name in bones}
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    dl = bm.verts.layers.deform.verify()
    kept = set()
    for v in bm.verts:
        w = {to_bone[g]: x for g, x in v[dl].items() if g in to_bone}
        dom = max(w, key=w.get) if w else None
        if keep(v.co, dom):
            kept.add(v.index)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in kept for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        previous = None
        for loop in face.loops:
            p = loop.vert.co
            angle = math.atan2(p.x, -p.y)
            if previous is not None:
                while angle - previous > math.pi:
                    angle -= 2 * math.pi
                while previous - angle > math.pi:
                    angle += 2 * math.pi
            previous = angle
            loop[uv].uv = (angle / (2 * math.pi) * 3.0, p.z * 1.5)
    bm.to_mesh(shell.data)
    bm.free()
    for group in list(shell.vertex_groups):
        if group.name not in bones:
            shell.vertex_groups.remove(group)
    shell.data.materials.clear()
    return shell


def paint_rags(size=256):
    """Stained homespun with holes and torn edges (alpha)."""
    rng = np.random.default_rng(31)
    h = w = size
    y, x = np.mgrid[0:h, 0:w]
    img = np.ones((h, w, 3)) * np.array(RAG)
    img *= (0.8 + 0.2 * np.sin(x * 1.7) * np.sin(y * 1.7))[..., None]

    def smooth_field(waves, scale):
        field = np.zeros((h, w))
        for _ in range(waves):
            angle, phase = rng.uniform(0, math.pi), rng.uniform(0, 2 * math.pi)
            freq = scale * rng.uniform(0.6, 1.4)
            field += np.sin((x * math.cos(angle) + y * math.sin(angle)) * freq + phase)
        return field / math.sqrt(waves)

    stains = smooth_field(7, 0.05)
    img *= (0.88 + 0.1 * stains)[..., None]
    img[stains > 1.3] *= np.array((0.6, 0.3, 0.25))      # dried blood
    holes = smooth_field(9, 0.09) > 1.55                   # torn holes
    alpha = (~holes).astype(float)
    return np.clip(np.concatenate([img, alpha[..., None]], axis=2), 0, 1)


def main():
    armature, basemesh = protagonist.build_human(name="Infected", body_parts=BODY_PARTS, clothes=[], proxy=PROXY)
    parts = {o.name.split(".", 1)[1]: o for o in armature.children if o is not basemesh and "." in o.name}
    print("build_infected: parts", sorted(parts))
    body = next(o for key, o in parts.items() if "male1591" in key)
    eyes = next(o for key, o in parts.items() if "low-poly" in key)
    for obj in (body, eyes):
        apply_modifiers_and_shape(obj)
    m = armature.matrix_world
    knee_z = (m @ armature.data.bones["calf_l"].head_local).z
    hip_z = (m @ armature.data.bones["pelvis"].head_local).z
    leg_bones = {"pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"}
    torso_bones = {"pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"}
    neck_z = (m @ armature.data.bones["neck_01"].head_local).z
    trousers = rag_shell(body, armature, "Trousers",
                         lambda co, dom: dom in leg_bones and knee_z - 0.18 <= co.z <= hip_z + 0.08, 0.012)
    shirt = rag_shell(body, armature, "Shirt",
                      lambda co, dom: dom in torso_bones and hip_z + 0.02 <= co.z <= neck_z - 0.01, 0.012)
    bpy.data.objects.remove(basemesh, do_unlink=True)

    textures = os.path.join(OUT_DIR, "textures")
    os.makedirs(textures, exist_ok=True)
    rag_path = os.path.join(textures, "T_Infected_Rags.png")
    rag_image = protagonist.make_image("T_Infected_Rags", paint_rags())
    protagonist.save_image(rag_image, rag_path)

    # The skin and eye textures are the Protagonist's (the build left them in textures/); the
    # preview tints them as the Unreal material instances do.
    skin = bpy.data.images.load(os.path.join(textures, "T_Protagonist_Skin.jpg"))
    eye = bpy.data.images.load(os.path.join(textures, "T_Protagonist_Eyes.png"))
    for obj, material_name, image, alpha in ((body, "M_Infected_Skin", skin, False), (eyes, "M_Infected_Eyes", eye, False),
                                             (trousers, "M_Infected_Rags", rag_image, True),
                                             (shirt, "M_Infected_Rags", rag_image, True)):
        material = bpy.data.materials.get(material_name) or protagonist.textured_material(material_name, image, alpha=alpha)
        obj.data.materials.clear()
        obj.data.materials.append(material)
    tint = bpy.data.materials["M_Infected_Skin"].node_tree.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    tint.inputs[7].default_value = (*SKIN_PREVIEW_TINT, 1.0)
    nodes = bpy.data.materials["M_Infected_Skin"].node_tree
    tex = next(n for n in nodes.nodes if n.type == "TEX_IMAGE")
    nodes.links.new(tex.outputs["Color"], tint.inputs[6])
    nodes.links.new(tint.outputs[2], nodes.nodes["Principled BSDF"].inputs["Base Color"])

    if PREVIEW:
        protagonist.render_previews(armature)
        for view in ("front", "back", "side", "head"):
            src = os.path.join(OUT_DIR, "preview_" + view + ".png")
            if os.path.exists(src):
                os.replace(src, os.path.join(OUT_DIR, "preview_infected_" + view + ".png"))

    exported = [armature] + [o for o in bpy.data.objects if o.parent is armature]
    for obj in (trousers, shirt):
        if obj not in exported:
            exported.append(obj)
    protagonist.export_for_unreal(armature, exported, os.path.join(OUT_DIR, "Infected.fbx"))
    manifest = {
        "fbx": "Infected.fbx",
        "materials": {
            "M_Infected_Skin": {"texture": "T_Protagonist_Skin", "shared": True, "masked": False, "two_sided": False},
            "M_Infected_Eyes": {"texture": "T_Protagonist_Eyes", "shared": True, "masked": False, "two_sided": False},
            "M_Infected_Rags": {"texture": "T_Infected_Rags.png", "shared": False, "masked": True, "two_sided": True},
        },
    }
    with open(os.path.join(OUT_DIR, "infected.json"), "w", encoding="utf-8") as out:
        json.dump(manifest, out, indent=2)
    print("build_infected: wrote", OUT_DIR, "verts", sum(len(o.data.vertices) for o in exported if o.type == "MESH"))


main()
