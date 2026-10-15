"""Imports the weapons built by scripts/blender/build_weapons.py into /Game/Weapons.

Input: Saved/WeaponBuild/ (SM_*.fbx, textures/T_Weapons.png, manifest.json). Output, rebuilt from
scratch: SM_Tomahawk, SM_RockSledge, SM_Bow, SM_Rifle and SM_Arrow (legacy FBX import, no
collision: held weapons never collide and the arrow collides with its own sphere), the texture
atlas T_Weapons, the master M_WeaponMaster (base colour x Tint, a Roughness parameter) and its
instance MI_Weapons. UBloodRitualWeaponComponent and ABloodRitualArrow load them by path.

Delete Content/Weapons on disk before re-running (the C++ class defaults load these assets when
the editor starts). Run headless:

    "<UE_ROOT>\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" "<repo>\\BloodRitual.uproject" ^
        -run=pythonscript -script="<repo>\\scripts\\editor\\import_weapons.py" -unattended -nopause
"""

import json
import os

import unreal

BUILD_DIR = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "WeaponBuild")
FOLDER = "/Game/Weapons"
ROUGHNESS = 0.6

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
mat_lib = unreal.MaterialEditingLibrary
assets = unreal.EditorAssetLibrary


def import_texture(path):
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = FOLDER + "/Textures"
    task.destination_name = "T_Weapons"
    task.automated = True
    task.replace_existing = True
    task.factory = unreal.TextureFactory()
    asset_tools.import_asset_tasks([task])
    texture = unreal.load_asset(FOLDER + "/Textures/T_Weapons")
    if texture is None:
        raise RuntimeError("texture import failed: " + path)
    return texture


def build_material(texture):
    master = asset_tools.create_asset("M_WeaponMaster", FOLDER + "/Materials", unreal.Material, unreal.MaterialFactoryNew())
    base = mat_lib.create_material_expression(master, unreal.MaterialExpressionTextureSampleParameter2D, -500, -200)
    base.set_editor_property("parameter_name", "BaseColor")
    base.set_editor_property("texture", texture)
    tint = mat_lib.create_material_expression(master, unreal.MaterialExpressionVectorParameter, -500, -400)
    tint.set_editor_property("parameter_name", "Tint")
    tint.set_editor_property("default_value", unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
    tinted = mat_lib.create_material_expression(master, unreal.MaterialExpressionMultiply, -200, -300)
    mat_lib.connect_material_expressions(base, "RGB", tinted, "A")
    mat_lib.connect_material_expressions(tint, "", tinted, "B")
    rough = mat_lib.create_material_expression(master, unreal.MaterialExpressionScalarParameter, -500, 100)
    rough.set_editor_property("parameter_name", "Roughness")
    rough.set_editor_property("default_value", ROUGHNESS)
    mat_lib.connect_material_property(tinted, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mat_lib.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mat_lib.recompile_material(master)
    assets.save_loaded_asset(master)

    instance = asset_tools.create_asset("MI_Weapons", FOLDER + "/Materials", unreal.MaterialInstanceConstant,
                                        unreal.MaterialInstanceConstantFactoryNew())
    mat_lib.set_material_instance_parent(instance, master)
    mat_lib.set_material_instance_texture_parameter_value(instance, "BaseColor", texture)
    mat_lib.update_material_instance(instance)
    return instance


def import_mesh(path, name, material):
    unreal.SystemLibrary.execute_console_command(None, "Interchange.FeatureFlags.Import.FBX 0")
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("import_animations", False)
    data = options.static_mesh_import_data
    data.set_editor_property("combine_meshes", True)
    data.set_editor_property("auto_generate_collision", False)
    data.set_editor_property("generate_lightmap_u_vs", False)
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = FOLDER
    task.destination_name = name
    task.automated = True
    task.replace_existing = True
    task.factory = unreal.FbxFactory()
    task.options = options
    asset_tools.import_asset_tasks([task])
    mesh = unreal.load_asset("{}/{}".format(FOLDER, name))
    if mesh is None:
        raise RuntimeError("static mesh import failed: " + path)
    mesh.set_material(0, material)
    return mesh


def main():
    with open(os.path.join(BUILD_DIR, "manifest.json"), encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    if assets.does_directory_exist(FOLDER):
        assets.delete_directory(FOLDER)
    texture = import_texture(os.path.join(BUILD_DIR, "textures", manifest["texture"]))
    material = build_material(texture)
    for name in manifest["meshes"]:
        import_mesh(os.path.join(BUILD_DIR, name + ".fbx"), name, material)
        unreal.log("import_weapons: imported " + name)
    assets.save_directory(FOLDER, only_if_is_dirty=False)
    unreal.log_warning("import_weapons: done")


main()
