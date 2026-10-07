"""Create and save the local test map /Game/Maps/L_TestMap (Content/Maps/L_TestMap.umap).

The map contains the same four things ABloodRitualGameMode spawns at runtime when a map lacks
them: a 100 m x 100 m floor (/Engine/BasicShapes/Cube, tagged "BloodRitualFloor"), a movable
directional light, a movable sky light and a PlayerStart above the floor. Running the game on
this map therefore spawns nothing extra. The script is OPTIONAL: the project boots without it.

Requirements
------------
* Unreal Editor 5.8 with the project built (BloodRitualEditor target).
* The "Python Editor Script Plugin" (PythonScriptPlugin), which is NOT enabled in
  BloodRitual.uproject. Enable it locally: Edit > Plugins, search "Python Editor Script Plugin",
  tick Enabled, restart the editor. Do not commit the resulting .uproject change unless a
  ticket asks for it.

How to run
----------
Either of these, from the editor:

* Tools > Execute Python Script... and pick this file.
* Output Log: switch the command line from "Cmd" to "Python" and enter
      py "<repo>/scripts/editor/create_test_map.py"

Or headless, from a terminal (adjust paths):

    "<UE_ROOT>\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" "<repo>\\BloodRitual.uproject" ^
        -run=pythonscript -script="<repo>\\scripts\\editor\\create_test_map.py"

Running the script again on an existing L_TestMap only adds whatever is missing.

Afterwards: booting into the generated map
------------------------------------------
By default the project boots into the engine map /Engine/Maps/Entry. To boot into L_TestMap:

1. Config/DefaultEngine.ini, section [/Script/EngineSettings.GameMapsSettings]:
       GameDefaultMap=/Game/Maps/L_TestMap.L_TestMap
       EditorStartupMap=/Game/Maps/L_TestMap.L_TestMap
2. Config/DefaultGame.ini, section [/Script/UnrealEd.ProjectPackagingSettings]: add
       +MapsToCook=(FilePath="/Game/Maps/L_TestMap")
   so a packaged build includes it.

The map is generated locally. .umap files go through Git LFS (.gitattributes); do not commit
L_TestMap unless a ticket calls for a committed map.
"""

import unreal

MAP_PACKAGE_PATH = "/Game/Maps/L_TestMap"
FLOOR_MESH_PATH = "/Engine/BasicShapes/Cube.Cube"
FLOOR_TAG = "BloodRitualFloor"

# Same layout as ABloodRitualTestEnvironment (Source/BloodRitual/BloodRitualTestEnvironment.cpp).
FLOOR_LOCATION = unreal.Vector(0.0, 0.0, -50.0)  # 1 m thick slab, top surface at Z = 0
FLOOR_SCALE = unreal.Vector(100.0, 100.0, 1.0)  # cube is 1 m, so 100 m x 100 m x 1 m
PLAYER_START_LOCATION = unreal.Vector(0.0, 0.0, 120.0)
LIGHT_LOCATION = unreal.Vector(0.0, 0.0, 500.0)
# unreal.Rotator takes (roll, pitch, yaw).
SUN_ROTATION = unreal.Rotator(0.0, -50.0, 30.0)


def _has_component(actors, component_class):
    return any(actor.get_component_by_class(component_class) is not None for actor in actors)


def _has_floor(actors):
    return any(
        isinstance(actor, unreal.StaticMeshActor) and FLOOR_TAG in [str(tag) for tag in actor.tags]
        for actor in actors
    )


def _has_player_start(actors):
    return any(isinstance(actor, unreal.PlayerStart) for actor in actors)


def _spawn(actor_subsystem, actor_class, location, rotation=None, label=None):
    actor = actor_subsystem.spawn_actor_from_class(actor_class, location, rotation or unreal.Rotator())
    if actor is None:
        raise RuntimeError("Could not spawn {}".format(actor_class.__name__))
    if label:
        actor.set_actor_label(label)
    return actor


def _spawn_floor(actor_subsystem):
    mesh = unreal.load_asset(FLOOR_MESH_PATH)
    if mesh is None:
        raise RuntimeError("Could not load {}".format(FLOOR_MESH_PATH))
    floor = _spawn(actor_subsystem, unreal.StaticMeshActor, FLOOR_LOCATION, label="BloodRitualFloor")
    floor.set_actor_scale3d(FLOOR_SCALE)
    floor.set_editor_property("tags", [unreal.Name(FLOOR_TAG)])
    component = floor.static_mesh_component
    component.set_editor_property("static_mesh", mesh)
    component.set_collision_profile_name(unreal.Name("BlockAll"))
    component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
    return floor


def _spawn_directional_light(actor_subsystem):
    light = _spawn(actor_subsystem, unreal.DirectionalLight, LIGHT_LOCATION, SUN_ROTATION, label="BloodRitualSun")
    light.light_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    return light


def _spawn_sky_light(actor_subsystem):
    light = _spawn(actor_subsystem, unreal.SkyLight, LIGHT_LOCATION, label="BloodRitualSkyLight")
    light.light_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    return light


def _spawn_player_start(actor_subsystem):
    return _spawn(actor_subsystem, unreal.PlayerStart, PLAYER_START_LOCATION, label="BloodRitualPlayerStart")


def main():
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    if unreal.EditorAssetLibrary.does_asset_exist(MAP_PACKAGE_PATH):
        unreal.log("create_test_map: {} exists, opening it and adding only what is missing".format(MAP_PACKAGE_PATH))
        if not level_subsystem.load_level(MAP_PACKAGE_PATH):
            raise RuntimeError("Could not load {}".format(MAP_PACKAGE_PATH))
    else:
        unreal.log("create_test_map: creating empty level {}".format(MAP_PACKAGE_PATH))
        if not level_subsystem.new_level(MAP_PACKAGE_PATH):
            raise RuntimeError("Could not create {}".format(MAP_PACKAGE_PATH))

    actors = actor_subsystem.get_all_level_actors()
    spawned = []

    if not _has_floor(actors):
        _spawn_floor(actor_subsystem)
        spawned.append("floor")
    if not _has_component(actors, unreal.DirectionalLightComponent):
        _spawn_directional_light(actor_subsystem)
        spawned.append("directional light")
    if not _has_component(actors, unreal.SkyLightComponent):
        _spawn_sky_light(actor_subsystem)
        spawned.append("sky light")
    if not _has_player_start(actors):
        _spawn_player_start(actor_subsystem)
        spawned.append("PlayerStart")

    if not level_subsystem.save_current_level():
        raise RuntimeError("Could not save {}".format(MAP_PACKAGE_PATH))

    unreal.log("create_test_map: saved {} (spawned: {})".format(
        MAP_PACKAGE_PATH, ", ".join(spawned) if spawned else "nothing, all four pieces were present"))


main()
