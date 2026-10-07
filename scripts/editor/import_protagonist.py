"""Imports the Seminole man built by scripts/blender/build_protagonist.py and gives him animations.

Input: Saved/CharacterBuild/ (Protagonist.fbx, AnimationSource.fbx, textures/, manifest.json),
written by the Blender script. Output: /Game/Characters/Protagonist (rebuilt from scratch) with

  * SKM_Protagonist, its skeleton and physics asset (legacy FBX import);
  * one material instance per part (skin, eyes, brows, lashes, hair, shirt, turban, sash,
    kerchief) of three small master materials under /Game/Characters/Materials;
  * Animations/: the Quaternius locomotion and jump clips and BS_Locomotion (idle, walk, jog,
    sprint over ground speed), retargeted onto his skeleton.

The Quaternius mannequin and clips (AnimationSource.fbx) are imported, given the blend space,
retargeted through IK Rigs and an IK Retargeter made here, and then deleted with those tools:
only the retargeted clips are needed at runtime.

Delete Content/Characters/Protagonist and Content/Characters/Materials on disk before re-running
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
# Quaternius notes that the default ACL compression adds jitter to these clips.
BONE_COMPRESSION = "/Engine/Animation/DefaultAnimBoneCompressionSettings.DefaultAnimBoneCompressionSettings"

# Per material: roughness, and which master (opaque one-sided, cloth two-sided, masked two-sided).
ROUGHNESS = {"Skin": 0.55, "Eyes": 0.15, "Hair": 0.6, "Eyebrows": 0.7, "Eyelashes": 0.7}
CLOTH_ROUGHNESS = 0.92

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
mat_lib = unreal.MaterialEditingLibrary
assets = unreal.EditorAssetLibrary


def log(message):
    print("import_protagonist: " + message)


def reset_folder(folder):
    if assets.does_directory_exist(folder):
        assets.delete_directory(folder)


def import_fbx(fbx_path, folder, name, animations):
    """Legacy FBX importer (synchronous, and the one Quaternius' clips were authored for)."""
    unreal.SystemLibrary.execute_console_command(None, "Interchange.FeatureFlags.Import.FBX 0")
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", True)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    options.set_editor_property("import_animations", animations)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("create_physics_asset", True)
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


def prepare_source_clips(clip_names):
    """Names the imported clips A_<clip>, fixes their compression and builds BS_Locomotion."""
    compression = unreal.load_asset(BONE_COMPRESSION)
    clips = {}
    skeleton = None
    for path in assets.list_assets(SOURCE_FOLDER, recursive=False, include_folder=False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.Skeleton):
            skeleton = asset
        if isinstance(asset, unreal.AnimSequence):
            clip = next((c for c in clip_names if asset.get_name().endswith(c)), None)
            if clip is None:
                continue
            asset.set_editor_property("bone_compression_settings", compression)
            assets.rename_asset(path.split(".")[0], "{}/A_{}".format(SOURCE_FOLDER, clip))
            clips[clip] = unreal.load_asset("{}/A_{}".format(SOURCE_FOLDER, clip))
    missing = [c for c in clip_names if c not in clips]
    if missing:
        raise RuntimeError("clips not found in the animation source: {}".format(missing))

    factory = unreal.BlendSpaceFactory1D()
    factory.set_editor_property("target_skeleton", skeleton)
    blend_space = asset_tools.create_asset("BS_Locomotion", SOURCE_FOLDER, unreal.BlendSpace1D, factory)
    params = list(blend_space.get_editor_property("blend_parameters"))
    axis = params[0]
    axis.set_editor_property("display_name", "Speed")
    axis.set_editor_property("min", 0.0)
    axis.set_editor_property("max", LOCOMOTION_SAMPLES[-1][1])
    axis.set_editor_property("grid_num", 12)
    params[0] = axis
    blend_space.set_editor_property("blend_parameters", params)
    # Setting sample_data from Python never builds the runtime blend data, so the samples go
    # through the module's editor-only helper.
    if not unreal.BloodRitualEditorScripting.set_blend_space_samples(
            blend_space, [clips[name] for name, _ in LOCOMOTION_SAMPLES],
            [unreal.Vector(speed, 0.0, 0.0) for _, speed in LOCOMOTION_SAMPLES]):
        raise RuntimeError("could not set the locomotion blend space samples")
    assets.save_directory(SOURCE_FOLDER, only_if_is_dirty=False)
    return [blend_space.get_path_name().split(".")[0], "{}/A_Jump_Loop".format(SOURCE_FOLDER)]


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
    """Base colour (x Tint) from one texture, a Roughness parameter; masked ones clip on alpha."""
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
    tinted = mat_lib.create_material_expression(material, unreal.MaterialExpressionMultiply, -200, -300)
    mat_lib.connect_material_expressions(base, "RGB", tinted, "A")
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
    build_materials(mesh, manifest)

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
    unreal.log_warning("import_protagonist: done")


main()
