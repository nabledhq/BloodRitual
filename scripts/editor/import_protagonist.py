"""Imports the Protagonist built by scripts/blender/build_protagonist.py and gives him animations,
then the infected built by scripts/blender/build_infected.py onto his skeleton.

Input: Saved/CharacterBuild/ (Protagonist.fbx, AnimationSource.fbx, textures/, manifest.json),
written by the Blender script. Output: /Game/Characters/Protagonist (rebuilt from scratch) with

  * SKM_Protagonist, its skeleton and physics asset (legacy FBX import);
  * one material instance per part (skin, eyes, brows, lashes, hair, beard and the outfit's
    beadwork, gold, leather, fur, feathers and so on) of three small master materials under
    /Game/Characters/Materials;
  * Animations/: the Quaternius clips (locomotion, crouch, jump start/loop/land, roll, interact,
    pick up, sword idle and swing, pistol idle/aim/shoot/reload, punch, hit, death), the blend
    spaces BS_Locomotion (idle, walk, jog, sprint over ground speed), BS_Locomotion_Melee and
    BS_Locomotion_Ranged (the same with an armed idle) and BS_Crouch (crouched idle and walk),
    retargeted onto his skeleton.

and /Game/Characters/Infected: SKM_Infected on SK_Protagonist (the same bones, so it plays the
clips above), with material instances that reuse his skin and eye textures, tinted, and its own
rag texture.

The Quaternius mannequin and clips (AnimationSource.fbx) are imported, given the blend space,
retargeted through IK Rigs and an IK Retargeter made here, and then deleted with those tools:
only the retargeted clips are needed at runtime.

Delete Content/Characters/Protagonist, Content/Characters/Infected and Content/Characters/Materials
on disk before re-running
(the C++ class defaults load these assets when the editor starts). Run headless:

    "<UE_ROOT>\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" "<repo>\\BloodRitual.uproject" ^
        -run=pythonscript -script="<repo>\\scripts\\editor\\import_protagonist.py" -unattended -nopause
"""

import json
import os

import unreal

BUILD_DIR = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "CharacterBuild")
FOLDER = "/Game/Characters/Protagonist"
MATERIALS_FOLDER = "/Game/Characters/Materials"
SOURCE_FOLDER = FOLDER + "/Source"
RETARGET_FOLDER = FOLDER + "/Retargeting"
# Ground speed (cm/s) at which each clip plays in the locomotion blend space. Sprint matches the
# character's top speed (CharacterMovement MaxWalkSpeed, 600).
LOCOMOTION_SAMPLES = [("Idle_Loop", 0.0), ("Walk_Loop", 160.0), ("Jog_Fwd_Loop", 400.0), ("Sprint_Loop", 600.0)]
# The crouched walk's feet move at about three quarters of the walk's, so it plays at 130 cm/s,
# the character's crouched top speed (MaxWalkSpeedCrouched).
CROUCH_SAMPLES = [("Crouch_Idle_Loop", 0.0), ("Crouch_Fwd_Loop", 130.0)]
# Holding a weapon changes the idle only; walking, jogging and sprinting stay the same.
BLEND_SPACES = {
    "BS_Locomotion": LOCOMOTION_SAMPLES,
    "BS_Locomotion_Melee": [("Sword_Idle", 0.0)] + LOCOMOTION_SAMPLES[1:],
    "BS_Locomotion_Ranged": [("Pistol_Idle_Loop", 0.0)] + LOCOMOTION_SAMPLES[1:],
    "BS_Crouch": CROUCH_SAMPLES,
}
INFECTED_FOLDER = "/Game/Characters/Infected"
# Over the Protagonist's textures: the skin mostly desaturated and tinted a pale grey-green, the
# eyes bloodshot. Each infected varies its skin tint a little at runtime (ABloodRitualInfected
# uses the same skin tint).
INFECTED_DESATURATION = {"Skin": 0.85}
INFECTED_TINTS = {"Skin": (1.15, 1.3, 1.05), "Eyes": (1.0, 0.55, 0.5)}
# Quaternius notes that the default ACL compression adds jitter to these clips.
BONE_COMPRESSION = "/Engine/Animation/DefaultAnimBoneCompressionSettings.DefaultAnimBoneCompressionSettings"

# Per material: roughness, and which master (opaque one-sided, cloth two-sided, masked two-sided).
ROUGHNESS = {"Skin": 0.55, "Eyes": 0.15, "Hair": 0.85, "Eyebrows": 0.7, "Eyelashes": 0.7, "Beard": 0.7,
             "Moustache": 0.7, "Braid": 0.85, "Gold": 0.35, "Beads": 0.4, "Beadwork": 0.5, "Leather": 0.75,
             "BootLeather": 0.75}
CLOTH_ROUGHNESS = 0.92

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
mat_lib = unreal.MaterialEditingLibrary
assets = unreal.EditorAssetLibrary


def log(message):
    print("import_protagonist: " + message)


def reset_folder(folder):
    if assets.does_directory_exist(folder):
        assets.delete_directory(folder)


def import_fbx(fbx_path, folder, name, animations, skeleton=None):
    """Legacy FBX importer (synchronous, and the one Quaternius' clips were authored for). With a
    skeleton, the mesh is imported onto it (no new skeleton or physics asset)."""
    unreal.SystemLibrary.execute_console_command(None, "Interchange.FeatureFlags.Import.FBX 0")
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    options.set_editor_property("import_animations", animations)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("create_physics_asset", skeleton is None)
    if skeleton is not None:
        options.set_editor_property("skeleton", skeleton)
    options.skeletal_mesh_import_data.set_editor_property("use_t0_as_ref_pose", False)
    if animations:
        anim = options.anim_sequence_import_data
        anim.set_editor_property("animation_length", unreal.FBXAnimationLengthImportType.FBXALIT_EXPORTED_TIME)
        anim.set_editor_property("use_default_sample_rate", True)
        anim.set_editor_property("snap_to_closest_frame_boundary", True)
    task = unreal.AssetImportTask()
    task.filename = fbx_path
    task.destination_path = folder
    task.destination_name = "SKM_" + name
    task.automated = True
    task.replace_existing = True
    task.factory = unreal.FbxFactory()
    task.options = options
    asset_tools.import_asset_tasks([task])
    mesh = unreal.load_asset("{}/SKM_{}".format(folder, name))
    if mesh is None:
        raise RuntimeError("skeletal mesh import failed: " + fbx_path)
    for path in assets.list_assets(folder, recursive=False, include_folder=False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.Skeleton):
            assets.rename_asset(path.split(".")[0], "{}/SK_{}".format(folder, name))
        elif isinstance(asset, unreal.PhysicsAsset):
            assets.rename_asset(path.split(".")[0], "{}/PHYS_{}".format(folder, name))
    return mesh


def make_blend_space(name, skeleton, clips, samples):
    factory = unreal.BlendSpaceFactory1D()
    factory.set_editor_property("target_skeleton", skeleton)
    blend_space = asset_tools.create_asset(name, SOURCE_FOLDER, unreal.BlendSpace1D, factory)
    params = list(blend_space.get_editor_property("blend_parameters"))
    axis = params[0]
    axis.set_editor_property("display_name", "Speed")
    axis.set_editor_property("min", 0.0)
    axis.set_editor_property("max", samples[-1][1])
    axis.set_editor_property("grid_num", 12)
    params[0] = axis
    blend_space.set_editor_property("blend_parameters", params)
    # Setting sample_data from Python never builds the runtime blend data, so the samples go
    # through the module's editor-only helper.
    if not unreal.BloodRitualEditorScripting.set_blend_space_samples(
            blend_space, [clips[clip] for clip, _ in samples],
            [unreal.Vector(speed, 0.0, 0.0) for _, speed in samples]):
        raise RuntimeError("could not set the samples of " + name)
    return blend_space


def prepare_source_clips(clip_names):
    """Names the imported clips A_<clip>, fixes their compression and builds the blend spaces.
    Returns what to retarget: the blend spaces (which bring their clips) and the other clips."""
    compression = unreal.load_asset(BONE_COMPRESSION)
    clips = {}
    skeleton = None
    for path in assets.list_assets(SOURCE_FOLDER, recursive=False, include_folder=False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.Skeleton):
            skeleton = asset
        if isinstance(asset, unreal.AnimSequence):
            # The longest match: "..._Crouch_Idle_Loop" also ends with "Idle_Loop".
            matches = [c for c in clip_names if asset.get_name().endswith(c)]
            if not matches:
                continue
            clip = max(matches, key=len)
            asset.set_editor_property("bone_compression_settings", compression)
            assets.rename_asset(path.split(".")[0], "{}/A_{}".format(SOURCE_FOLDER, clip))
            clips[clip] = unreal.load_asset("{}/A_{}".format(SOURCE_FOLDER, clip))
    missing = [c for c in clip_names if c not in clips]
    if missing:
        raise RuntimeError("clips not found in the animation source: {}".format(missing))

    to_retarget = []
    in_blend_spaces = set()
    for name, samples in BLEND_SPACES.items():
        blend_space = make_blend_space(name, skeleton, clips, samples)
        to_retarget.append(blend_space.get_path_name().split(".")[0])
        in_blend_spaces.update(clip for clip, _ in samples)
    to_retarget += ["{}/A_{}".format(SOURCE_FOLDER, clip) for clip in clip_names if clip not in in_blend_spaces]
    assets.save_directory(SOURCE_FOLDER, only_if_is_dirty=False)
    return to_retarget


def import_texture(path, name):
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = FOLDER + "/Textures"
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.factory = unreal.TextureFactory()
    asset_tools.import_asset_tasks([task])
    texture = unreal.load_asset("{}/Textures/{}".format(FOLDER, name))
    if texture is None:
        raise RuntimeError("texture import failed: " + path)
    return texture


def build_master(name, default_texture, two_sided, masked):
    """Base colour from one texture, desaturated by Desaturation (0 by default) and multiplied by
    Tint, and a Roughness parameter; masked ones clip on alpha."""
    material = asset_tools.create_asset(name, MATERIALS_FOLDER, unreal.Material, unreal.MaterialFactoryNew())
    # Without this a skinned mesh renders it with the default material.
    material.set_editor_property("used_with_skeletal_mesh", True)
    material.set_editor_property("two_sided", two_sided)
    if masked:
        material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    base = mat_lib.create_material_expression(material, unreal.MaterialExpressionTextureSampleParameter2D, -500, -200)
    base.set_editor_property("parameter_name", "BaseColor")
    base.set_editor_property("texture", default_texture)
    tint = mat_lib.create_material_expression(material, unreal.MaterialExpressionVectorParameter, -500, -400)
    tint.set_editor_property("parameter_name", "Tint")
    tint.set_editor_property("default_value", unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
    fraction = mat_lib.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -650, -300)
    fraction.set_editor_property("parameter_name", "Desaturation")
    fraction.set_editor_property("default_value", 0.0)
    grey = mat_lib.create_material_expression(material, unreal.MaterialExpressionDesaturation, -350, -250)
    mat_lib.connect_material_expressions(base, "RGB", grey, "")
    mat_lib.connect_material_expressions(fraction, "", grey, "Fraction")
    tinted = mat_lib.create_material_expression(material, unreal.MaterialExpressionMultiply, -200, -300)
    mat_lib.connect_material_expressions(grey, "", tinted, "A")
    mat_lib.connect_material_expressions(tint, "", tinted, "B")
    rough = mat_lib.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -500, 100)
    rough.set_editor_property("parameter_name", "Roughness")
    rough.set_editor_property("default_value", 0.8)
    mat_lib.connect_material_property(tinted, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mat_lib.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    if masked:
        mat_lib.connect_material_property(base, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    mat_lib.recompile_material(material)
    assets.save_loaded_asset(material)
    return material


def build_materials(mesh, manifest):
    textures = {}
    for material_name, info in manifest["materials"].items():
        part = material_name.replace("M_Protagonist_", "")
        textures[material_name] = import_texture(os.path.join(BUILD_DIR, "textures", info["texture"]), "T_Protagonist_" + part)
    first = next(iter(textures.values()))
    masters = {
        "opaque": build_master("M_CharacterOpaque", first, two_sided=False, masked=False),
        "cloth": build_master("M_CharacterCloth", first, two_sided=True, masked=False),
        "masked": build_master("M_CharacterMasked", first, two_sided=True, masked=True),
    }
    instances = {}
    for material_name, info in manifest["materials"].items():
        part = material_name.replace("M_Protagonist_", "")
        kind = "masked" if info["masked"] else ("cloth" if info["two_sided"] else "opaque")
        instance = asset_tools.create_asset("MI_Protagonist_" + part, FOLDER + "/Materials",
                                            unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mat_lib.set_material_instance_parent(instance, masters[kind])
        mat_lib.set_material_instance_texture_parameter_value(instance, "BaseColor", textures[material_name])
        mat_lib.set_material_instance_scalar_parameter_value(instance, "Roughness", ROUGHNESS.get(part, CLOTH_ROUGHNESS))
        mat_lib.update_material_instance(instance)
        instances[material_name] = instance

    slots = list(mesh.get_editor_property("materials"))
    for slot in slots:
        name = str(slot.get_editor_property("material_slot_name"))
        match = next((m for m in instances if name == m or name.startswith(m)), None)
        if match is None:
            unreal.log_warning("import_protagonist: no material for slot " + name)
            continue
        slot.set_editor_property("material_interface", instances[match])
    mesh.set_editor_property("materials", slots)
    return masters


def import_infected(skeleton, masters):
    """SKM_Infected on the Protagonist's skeleton, with tinted copies of his skin and eye materials."""
    with open(os.path.join(BUILD_DIR, "infected.json"), encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    reset_folder(INFECTED_FOLDER)
    mesh = import_fbx(os.path.join(BUILD_DIR, manifest["fbx"]), INFECTED_FOLDER, "Infected", animations=False,
                      skeleton=skeleton)
    instances = {}
    for material_name, info in manifest["materials"].items():
        part = material_name.replace("M_Infected_", "")
        if info["shared"]:
            texture = unreal.load_asset("{}/Textures/{}".format(FOLDER, info["texture"]))
        else:
            task = unreal.AssetImportTask()
            task.filename = os.path.join(BUILD_DIR, "textures", info["texture"])
            task.destination_path = INFECTED_FOLDER + "/Textures"
            task.destination_name = "T_Infected_" + part
            task.automated = True
            task.replace_existing = True
            task.factory = unreal.TextureFactory()
            asset_tools.import_asset_tasks([task])
            texture = unreal.load_asset("{}/Textures/T_Infected_{}".format(INFECTED_FOLDER, part))
        if texture is None:
            raise RuntimeError("no texture for " + material_name)
        kind = "masked" if info["masked"] else ("cloth" if info["two_sided"] else "opaque")
        instance = asset_tools.create_asset("MI_Infected_" + part, INFECTED_FOLDER + "/Materials",
                                            unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        mat_lib.set_material_instance_parent(instance, masters[kind])
        mat_lib.set_material_instance_texture_parameter_value(instance, "BaseColor", texture)
        mat_lib.set_material_instance_scalar_parameter_value(instance, "Roughness", ROUGHNESS.get(part, CLOTH_ROUGHNESS))
        if part in INFECTED_DESATURATION:
            mat_lib.set_material_instance_scalar_parameter_value(instance, "Desaturation", INFECTED_DESATURATION[part])
        if part in INFECTED_TINTS:
            mat_lib.set_material_instance_vector_parameter_value(instance, "Tint", unreal.LinearColor(*INFECTED_TINTS[part], 1.0))
        mat_lib.update_material_instance(instance)
        instances[material_name] = instance

    slots = list(mesh.get_editor_property("materials"))
    for slot in slots:
        name = str(slot.get_editor_property("material_slot_name"))
        match = next((m for m in instances if name == m or name.startswith(m)), None)
        if match is None:
            unreal.log_warning("import_protagonist: no material for infected slot " + name)
            continue
        slot.set_editor_property("material_interface", instances[match])
    mesh.set_editor_property("materials", slots)
    assets.save_directory(INFECTED_FOLDER, only_if_is_dirty=False)
    return mesh


def make_ik_rig(name, mesh):
    rig = asset_tools.create_asset(name, RETARGET_FOLDER, unreal.IKRigDefinition, unreal.IKRigDefinitionFactory())
    controller = unreal.IKRigController.get_controller(rig)
    controller.set_skeletal_mesh(mesh)
    controller.apply_auto_generated_retarget_definition()
    controller.apply_auto_fbik()
    return rig


def make_retargeter(source_rig, target_rig, source_mesh, target_mesh):
    retargeter = asset_tools.create_asset("RTG_Quaternius_To_Protagonist", RETARGET_FOLDER,
                                          unreal.IKRetargeter, unreal.IKRetargetFactory())
    controller = unreal.IKRetargeterController.get_controller(retargeter)
    controller.set_ik_rig(unreal.RetargetSourceOrTarget.SOURCE, source_rig)
    controller.set_ik_rig(unreal.RetargetSourceOrTarget.TARGET, target_rig)
    controller.set_preview_mesh(unreal.RetargetSourceOrTarget.SOURCE, source_mesh)
    controller.set_preview_mesh(unreal.RetargetSourceOrTarget.TARGET, target_mesh)
    controller.add_default_ops()
    controller.assign_ik_rig_to_all_ops(unreal.RetargetSourceOrTarget.SOURCE, source_rig)
    controller.assign_ik_rig_to_all_ops(unreal.RetargetSourceOrTarget.TARGET, target_rig)
    controller.auto_map_chains(unreal.AutoMapChainType.FUZZY, True)
    # Quaternius' mannequin is in a T-pose and MakeHuman's rig in an A-pose: align the target's
    # retarget pose to the source's bone directions.
    controller.auto_align_all_bones(unreal.RetargetSourceOrTarget.TARGET)
    assets.save_loaded_asset(retargeter)
    return retargeter


def retarget_animations(source_assets, source_mesh, target_mesh, retargeter):
    inputs = unreal.IKRetargetBatchOperationInputs()
    inputs.assets_to_retarget = [assets.find_asset_data(path) for path in source_assets]
    inputs.source_mesh = source_mesh
    inputs.target_mesh = target_mesh
    inputs.ik_retarget_asset = retargeter
    inputs.target_path = FOLDER + "/Animations"
    # The blend space brings its clips along and is re-pointed at the retargeted copies.
    inputs.include_referenced_assets = True
    inputs.overwrite_existing_files = True
    created = unreal.IKRetargetBatchOperation.run_batch_retarget(inputs)
    compression = unreal.load_asset(BONE_COMPRESSION)
    for data in created:
        asset = unreal.load_asset(str(data.package_name))
        if isinstance(asset, unreal.AnimSequence):
            asset.set_editor_property("bone_compression_settings", compression)
    return [str(data.package_name) for data in created]


def main():
    with open(os.path.join(BUILD_DIR, "manifest.json"), encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    reset_folder(FOLDER)
    reset_folder(MATERIALS_FOLDER)

    log("importing the mesh")
    mesh = import_fbx(os.path.join(BUILD_DIR, manifest["fbx"]), FOLDER, "Protagonist", animations=False)
    log("building materials")
    masters = build_materials(mesh, manifest)

    log("retargeting the Quaternius clips")
    source_mesh = import_fbx(os.path.join(BUILD_DIR, manifest["animation_source"]), SOURCE_FOLDER, "Quaternius",
                             animations=True)
    source_assets = prepare_source_clips(manifest["clips"])
    source_rig = make_ik_rig("IK_Quaternius", source_mesh)
    target_rig = make_ik_rig("IK_Protagonist", mesh)
    retargeter = make_retargeter(source_rig, target_rig, source_mesh, mesh)
    created = retarget_animations(source_assets, source_mesh, mesh, retargeter)
    log("retargeted: " + ", ".join(created))

    for folder in (FOLDER, MATERIALS_FOLDER):
        assets.save_directory(folder, only_if_is_dirty=False)
    # Only the retargeted clips are used at runtime.
    assets.delete_directory(RETARGET_FOLDER)
    assets.delete_directory(SOURCE_FOLDER)

    log("importing the infected")
    skeleton = unreal.load_asset(FOLDER + "/SK_Protagonist")
    import_infected(skeleton, masters)
    unreal.log_warning("import_protagonist: done")


main()
