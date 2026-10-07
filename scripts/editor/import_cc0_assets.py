"""Downloads the CC0 stand-in art listed below and imports it into Content/.

Source: Poly Haven (https://polyhaven.com), through its public API; every model and texture is
CC0 (public domain), see ASSETS_LICENSES.md. (The player character has its own pipeline:
scripts/blender/build_protagonist.py and scripts/editor/import_protagonist.py.)

Downloads are cached in Saved/CC0Downloads (ignored by Git), so re-running only re-imports. The
imported .uasset files are committed through Git LFS; run this only to change the asset list or the
resolution. Everything under the destination folders below is deleted and rebuilt.

Models are imported as geometry only. Their textures are imported straight from the downloaded
JPEGs (which keeps the JPEG source compression; the glTF translator would store them losslessly at
2-4x the size) and wired into two master materials with a Tint parameter that gameplay code sets:

  /Game/Environments/Materials/M_PropMaster      opaque props
  /Game/Environments/Materials/M_FoliageMaster   masked, two-sided plants

Delete those destination folders on disk before re-running: the C++ class defaults load these
assets when the editor starts, so they cannot be cleanly replaced in the same session.

Run it headless (the Python Editor Script Plugin is enabled in the .uproject):

    "<UE_ROOT>\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" "<repo>\\BloodRitual.uproject" ^
        -run=pythonscript -script="<repo>\\scripts\\editor\\import_cc0_assets.py" -unattended -nopause

or in the editor with Tools > Execute Python Script. A summary is written to
Saved/CC0Downloads/imported.json.
"""

import json
import os
import urllib.request

import unreal

RESOLUTION = "1k"
USER_AGENT = "bloodritual-asset-import (https://github.com/nabledhq/BloodRitual)"
API_FILES = "https://api.polyhaven.com/files/{}"
CACHE_DIR = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "CC0Downloads")

MATERIALS_FOLDER = "/Game/Environments/Materials"

# (Poly Haven id, destination folder, combine, foliage). Each model lands in <folder>/<id>/.
# Props made of parts (lid, latch, base) are combined into one SM_<id>; sets of variants
# (fern_02_a..d, rock01..06) stay separate meshes, SM_<node name>, to be scattered individually.
# Variants keep their offset inside the set (node transforms are baked, which also keeps their
# rotations), so code that places one centres it on its bounds.
MODELS = [
    # Searchable containers at the scavenging area.
    ("wooden_crate_01", "/Game/Items/Containers", True, False),
    ("wine_barrel_01", "/Game/Items/Containers", True, False),
    ("wicker_basket_02", "/Game/Items/Containers", True, False),
    # The hub stockpile.
    ("wooden_crate_02", "/Game/Items/Containers", True, False),
    # Camp scenery.
    ("stone_fire_pit", "/Game/Environments/Camp", True, False),
    ("tree_stump_01", "/Game/Environments/Camp", True, False),
    ("dead_tree_trunk_02", "/Game/Environments/Camp", True, False),
    ("rock_moss_set_01", "/Game/Environments/Camp", False, False),
    ("fern_02", "/Game/Environments/Camp", False, True),
    ("shrub_02", "/Game/Environments/Camp", False, True),
]

# Tiling ground texture: (Poly Haven id, destination folder, material name, tile size in cm).
GROUND = ("brown_mud_leaves_01", "/Game/Environments/Ground", "M_Ground_BrownMudLeaves", 400.0)

PREFIXES = {
    "StaticMesh": "SM_",
    "SkeletalMesh": "SKM_",
    "Skeleton": "SK_",
    "PhysicsAsset": "PHYS_",
    "AnimSequence": "A_",
    "Material": "M_",
    "MaterialInstanceConstant": "MI_",
    "Texture2D": "T_",
}

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
mat_lib = unreal.MaterialEditingLibrary
assets = unreal.EditorAssetLibrary


def log(message):
    print("import_cc0_assets: " + message)


# --- Downloads -------------------------------------------------------------------------------

def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, open(path, "wb") as out:
        out.write(response.read())
    return path


def polyhaven_files(asset_id):
    request = urllib.request.Request(API_FILES.format(asset_id), headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def download_model(asset_id, foliage):
    """Returns (gltf path, {map: local file}) for the glTF and its texture maps."""
    files = polyhaven_files(asset_id)
    folder = os.path.join(CACHE_DIR, asset_id)
    gltf = files["gltf"][RESOLUTION]["gltf"]
    gltf_path = fetch(gltf["url"], os.path.join(folder, os.path.basename(gltf["url"])))
    for relative, info in gltf.get("include", {}).items():
        if relative.endswith(".bin"):
            fetch(info["url"], os.path.join(folder, relative.replace("/", os.sep)))
    return gltf_path, download_maps(files, folder, foliage)


def download_maps(files, folder, alpha):
    wanted = [("BaseColor", "Diffuse", "jpg"), ("Normal", "nor_dx", "jpg"), ("ARM", "arm", "jpg")]
    if alpha:
        wanted.append(("Alpha", "Alpha", "png"))
    maps = {}
    for role, key, fmt in wanted:
        info = files[key][RESOLUTION][fmt]
        maps[role] = fetch(info["url"], os.path.join(folder, "maps", os.path.basename(info["url"])))
    return maps


# --- Import ----------------------------------------------------------------------------------

def reset_folder(destination):
    if assets.does_directory_exist(destination):
        assets.delete_directory(destination)


def interchange_import(source_file, destination, pipeline, destination_name=""):
    """Imports one file with an explicit pipeline (a new one per call: an import consumes it)."""
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    params.replace_existing = True
    params.destination_name = destination_name
    # OverridePipelines holds soft paths; a transient pipeline's path resolves while it is alive.
    params.override_pipelines.append(unreal.SoftObjectPath(pipeline.get_path_name()))
    manager.import_asset(destination, unreal.InterchangeManager.create_source_data(source_file), params)
    manager.wait_until_all_tasks_done(False)  # the argument is bCancel


def geometry_pipeline(combine):
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    mesh = pipeline.mesh_pipeline
    mesh.import_static_meshes = True
    mesh.import_skeletal_meshes = False
    mesh.combine_static_meshes_behavior = (
        unreal.InterchangeCombineStaticMeshesBehavior.ALL if combine
        else unreal.InterchangeCombineStaticMeshesBehavior.DO_NOT_COMBINE)
    mesh.collision = True
    # Small props: Nanite only adds repository size here.
    mesh.build_nanite = False
    pipeline.common_meshes_properties.recompute_tangents = True
    # Materials and textures are built from the JPEGs instead (see the module docstring).
    pipeline.material_pipeline.import_materials = False
    pipeline.material_pipeline.texture_pipeline.import_textures = False
    return pipeline


def import_textures(maps, destination):
    """Imports image files as new assets, named T_<file stem without resolution>. Imported
    directly, JPEGs keep their JPEG source compression."""
    textures = {}
    for role, path in maps.items():
        name = "T_" + os.path.splitext(os.path.basename(path))[0].replace("_" + RESOLUTION, "")
        task = unreal.AssetImportTask()
        task.filename = path
        task.destination_path = destination
        task.destination_name = name
        task.automated = True
        task.replace_existing = True
        task.factory = unreal.TextureFactory()
        asset_tools.import_asset_tasks([task])
        texture = unreal.load_asset("{}/{}".format(destination, name))
        if not isinstance(texture, unreal.Texture2D):
            raise RuntimeError("texture import failed: " + path)
        if role == "Normal":
            texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
            texture.set_editor_property("srgb", False)
        elif role in ("ARM", "Alpha"):
            texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
            texture.set_editor_property("srgb", False)
        textures[role] = texture
    return textures


def rename_meshes(destination, base_name):
    """SM_<id> for a combined mesh, SM_<node name> for variants."""
    for path in assets.list_assets(destination, recursive=True, include_folder=False):
        mesh = unreal.load_asset(path)
        if not isinstance(mesh, unreal.StaticMesh) or mesh.get_name().startswith("SM_"):
            continue
        name = mesh.get_name().replace("_" + RESOLUTION, "").replace("-", "_")
        target = "{}/SM_{}".format(destination, base_name if name.rstrip("0123456789") == base_name else name)
        assets.rename_asset(path.split(".")[0], target)


# --- Materials -------------------------------------------------------------------------------

def texture_parameter(material, name, texture, sampler, x, y):
    node = mat_lib.create_material_expression(material, unreal.MaterialExpressionTextureSampleParameter2D, x, y)
    node.set_editor_property("parameter_name", name)
    node.set_editor_property("texture", texture)
    node.set_editor_property("sampler_type", sampler)
    return node


def build_master(name, defaults, foliage):
    """Base colour x Tint, normal, and AO / roughness / metallic from an ARM map (glTF packing)."""
    path = "{}/{}".format(MATERIALS_FOLDER, name)
    if assets.does_asset_exist(path):
        assets.delete_asset(path)
    material = asset_tools.create_asset(name, MATERIALS_FOLDER, unreal.Material, unreal.MaterialFactoryNew())
    if foliage:
        material.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
        material.set_editor_property("two_sided", True)

    base = texture_parameter(material, "BaseColor", defaults["BaseColor"], unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -500, -300)
    normal = texture_parameter(material, "Normal", defaults["Normal"], unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, -500, 0)
    arm = texture_parameter(material, "ARM", defaults["ARM"], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, -500, 250)
    tint = mat_lib.create_material_expression(material, unreal.MaterialExpressionVectorParameter, -500, -500)
    tint.set_editor_property("parameter_name", "Tint")
    tint.set_editor_property("default_value", unreal.LinearColor(1.0, 1.0, 1.0, 1.0))
    tinted = mat_lib.create_material_expression(material, unreal.MaterialExpressionMultiply, -200, -350)
    mat_lib.connect_material_expressions(base, "RGB", tinted, "A")
    mat_lib.connect_material_expressions(tint, "", tinted, "B")

    mat_lib.connect_material_property(tinted, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mat_lib.connect_material_property(normal, "RGB", unreal.MaterialProperty.MP_NORMAL)
    mat_lib.connect_material_property(arm, "R", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
    mat_lib.connect_material_property(arm, "G", unreal.MaterialProperty.MP_ROUGHNESS)
    mat_lib.connect_material_property(arm, "B", unreal.MaterialProperty.MP_METALLIC)
    if foliage:
        alpha = texture_parameter(material, "Alpha", defaults["Alpha"], unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, -500, 500)
        mat_lib.connect_material_property(alpha, "R", unreal.MaterialProperty.MP_OPACITY_MASK)
    mat_lib.recompile_material(material)
    assets.save_loaded_asset(material)
    return material


def make_instance(parent, textures, destination, asset_id):
    name = "MI_" + asset_id
    instance = asset_tools.create_asset(name, destination, unreal.MaterialInstanceConstant,
                                        unreal.MaterialInstanceConstantFactoryNew())
    mat_lib.set_material_instance_parent(instance, parent)
    for role, texture in textures.items():
        mat_lib.set_material_instance_texture_parameter_value(instance, role, texture)
    mat_lib.update_material_instance(instance)
    return instance


def assign_material(destination, instance):
    for path in assets.list_assets(destination, recursive=True, include_folder=False):
        mesh = unreal.load_asset(path)
        if isinstance(mesh, unreal.StaticMesh):
            for index in range(len(mesh.get_editor_property("static_materials"))):
                mesh.set_material(index, instance)


def build_ground(asset_id, destination, material_name, tile_size_cm):
    folder = os.path.join(CACHE_DIR, asset_id)
    textures = import_textures(download_maps(polyhaven_files(asset_id), folder, alpha=False), destination)
    material = asset_tools.create_asset(material_name, destination, unreal.Material, unreal.MaterialFactoryNew())
    # World-space planar UVs, so the texture tiles at a fixed size however large the floor is.
    world = mat_lib.create_material_expression(material, unreal.MaterialExpressionWorldPosition, -900, 0)
    mask = mat_lib.create_material_expression(material, unreal.MaterialExpressionComponentMask, -750, 0)
    mask.set_editor_property("r", True)
    mask.set_editor_property("g", True)
    tile = mat_lib.create_material_expression(material, unreal.MaterialExpressionScalarParameter, -750, 120)
    tile.set_editor_property("parameter_name", "TileSizeCm")
    tile.set_editor_property("default_value", tile_size_cm)
    uv = mat_lib.create_material_expression(material, unreal.MaterialExpressionDivide, -600, 40)
    mat_lib.connect_material_expressions(world, "", mask, "")
    mat_lib.connect_material_expressions(mask, "", uv, "A")
    mat_lib.connect_material_expressions(tile, "", uv, "B")
    samples = {}
    for role, sampler, y in [("BaseColor", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -200),
                             ("Normal", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, 50),
                             ("ARM", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, 300)]:
        node = mat_lib.create_material_expression(material, unreal.MaterialExpressionTextureSample, -400, y)
        node.set_editor_property("texture", textures[role])
        node.set_editor_property("sampler_type", sampler)
        mat_lib.connect_material_expressions(uv, "", node, "UVs")
        samples[role] = node
    mat_lib.connect_material_property(samples["BaseColor"], "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
    mat_lib.connect_material_property(samples["Normal"], "RGB", unreal.MaterialProperty.MP_NORMAL)
    mat_lib.connect_material_property(samples["ARM"], "R", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
    mat_lib.connect_material_property(samples["ARM"], "G", unreal.MaterialProperty.MP_ROUGHNESS)
    mat_lib.recompile_material(material)
    return material


# --- Main ------------------------------------------------------------------------------------

def main():
    report = {"models": {}}
    for folder in sorted({m[1] for m in MODELS} | {GROUND[1], MATERIALS_FOLDER}):
        reset_folder(folder)

    downloaded = []
    for asset_id, folder, combine, foliage in MODELS:
        destination = "{}/{}".format(folder, asset_id)
        log("importing " + asset_id)
        gltf_path, maps = download_model(asset_id, foliage)
        interchange_import(gltf_path, destination, geometry_pipeline(combine))
        rename_meshes(destination, asset_id)
        downloaded.append((asset_id, destination, foliage, maps))
    downloaded = [(a, d, f, import_textures(maps, d)) for a, d, f, maps in downloaded]

    # The first prop's and first plant's textures are the masters' defaults.
    prop_master = build_master("M_PropMaster", next(t for _, _, f, t in downloaded if not f), foliage=False)
    foliage_master = build_master("M_FoliageMaster", next(t for _, _, f, t in downloaded if f), foliage=True)
    for asset_id, destination, foliage, textures in downloaded:
        instance = make_instance(foliage_master if foliage else prop_master, textures, destination, asset_id)
        assign_material(destination, instance)
        assets.save_directory(destination)
        report["models"][asset_id] = sorted(assets.list_assets(destination, recursive=True))

    ground_id, ground_folder, material_name, tile = GROUND
    ground_destination = "{}/{}".format(ground_folder, ground_id)
    build_ground(ground_id, ground_destination, material_name, tile)
    assets.save_directory(ground_destination)
    report["ground"] = sorted(assets.list_assets(ground_destination, recursive=True))

    assets.save_directory(MATERIALS_FOLDER)

    with open(os.path.join(CACHE_DIR, "imported.json"), "w", encoding="utf-8") as out:
        json.dump(report, out, indent=2)
    unreal.log_warning("import_cc0_assets: done, {} models; see {}".format(
        len(report["models"]), os.path.join(CACHE_DIR, "imported.json")))


main()
