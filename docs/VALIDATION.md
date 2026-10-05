# Manual validation checklist

**None of the steps below were executed by the implementer of ticket #22.** The change was
written and reviewed statically, in an environment without Unreal Engine or Windows. Compiling,
launching, playing and packaging have not been verified. The first person with Unreal Engine
5.8 on Windows should walk through this list and record the result (and any fixes) on the
pull request or in a follow-up ticket.

Prerequisites: Windows 10/11, Unreal Engine 5.8 (Epic Games Launcher), Visual Studio 2022 with
the "Game development with C++" workload (or Rider), Git with Git LFS. Follow the README's
[Getting Started](../README.md#getting-started) up to and including generating project files.

Tick each box only when the observed result matches.

## 1. Build the editor target

- [ ] Right-click `Seminole.uproject` > **Generate Visual Studio project files** completes
      without errors and produces `Seminole.sln` (ignored by Git).
- [ ] In Visual Studio, configuration **Development Editor | Win64**, project `Seminole`:
      **Build** succeeds with no errors. (Warnings about the deprecated legacy input path are
      acceptable; errors are not.)
- [ ] The build produced `Binaries/Win64/UnrealEditor-Seminole.dll`.

## 2. Open the editor and the startup map

- [ ] `scripts\open-project.bat` (or double-clicking `Seminole.uproject`) opens Unreal Editor
      5.8 without a "missing modules / rebuild" prompt.
- [ ] The editor starts on the startup map `/Engine/Maps/Entry` (`Config/DefaultEngine.ini`,
      `EditorStartupMap`). This is an empty engine map, so the editor viewport is empty before
      play; that is expected.
- [ ] **Edit > Project Settings > Maps & Modes**: Default GameMode is `SeminoleGameMode`,
      Default Pawn Class is `SeminolePlaceholderCharacter`, Editor Startup Map and Game Default
      Map are both `Entry`.
- [ ] **Edit > Project Settings > Input**: the Axis Mappings `MoveForward` (W/S),
      `MoveRight` (D/A), `Turn` (Mouse X), `LookUp` (Mouse Y, scale -1) and the Action Mapping
      `Jump` (Space Bar) are listed; Default Player Input Class is `PlayerInput`, Default Input
      Component Class is `InputComponent`.

## 3. Play In Editor: scene, movement, look, jump

Before pressing Play, set the Play button's dropdown **Spawn player at: Default Player Start**
(the editor otherwise spawns at the viewport camera, which in the empty map may be below the
runtime-spawned floor).

- [ ] Press **Play** (Selected Viewport or New Editor Window). The Output Log (`LogSeminole`)
      shows four lines: spawned a floor, spawned a movable directional light, spawned a movable
      sky light, spawned a PlayerStart.
- [ ] The scene shows a large flat grey floor, lit by a directional light, with a grey cylinder
      (the placeholder character) standing on it, viewed from a third-person camera behind it.
      The sky is black (there is no atmosphere in this shell); that is expected.
- [ ] The World Outliner lists `SeminoleTestEnvironment`, `SeminoleFloor`, `SeminoleSun`,
      `SeminoleSkyLight` and `SeminolePlayerStart` (only during play).
- [ ] **W / S** move forward / back and **A / D** strafe left / right, relative to the camera.
      The cylinder turns to face the direction it moves.
- [ ] Moving the **mouse** orbits the camera around the character (left/right = yaw, up/down =
      pitch; moving the mouse up looks up).
- [ ] **Space** jumps; the character leaves the floor and lands on it again.
- [ ] Walking to the edge of the floor (50 m from the start) and off it makes the character
      fall, confirming the floor has collision and nothing else is holding the pawn.
- [ ] Press Play a second time: still exactly four `LogSeminole` spawn lines (no duplicates
      accumulate between sessions).
- [ ] **Play > Standalone Game** boots the same scene with the same controls.

## 4. Package Win64 Development

- [ ] **Platforms > Windows > Package Project** (Binary Configuration: **Development**,
      build target `Seminole`). When asked for an output folder, choose `<repo>\Packaged`.
- [ ] Packaging finishes with "BUILD SUCCESSFUL" and produces
      `Packaged\Windows\Seminole.exe` (plus `Seminole\` and `Engine\` folders beside it).
- [ ] `git status` shows nothing new: `Packaged/`, `Binaries/`, `Intermediate/`, `Saved/`,
      `DerivedDataCache/` and `*.sln` are all ignored.

## 5. Run the packaged game

- [ ] `scripts\run-latest-build.bat` launches the game. (Also check the failure path: rename
      `Packaged\Windows\Seminole.exe` temporarily, run the script, confirm it prints the
      "No packaged build found" error and `echo %errorlevel%` prints `1`, then rename back.)
- [ ] The packaged game loads the same scene as PIE: floor, lighting, cylinder character.
      (If the floor is missing or the mesh is the default grey checker, `/Engine/BasicShapes`
      was not cooked; note it on the PR.)
- [ ] WASD, mouse look and Space behave as in section 3.
- [ ] `Alt+F4` closes the game cleanly.

## 6. Optional: generate and boot L_TestMap

- [ ] **Edit > Plugins**, enable **Python Editor Script Plugin**, restart the editor.
- [ ] **Tools > Execute Python Script...**, choose `scripts/editor/create_test_map.py`. The
      Output Log shows `create_test_map: saved /Game/Maps/L_TestMap (spawned: floor,
      directional light, sky light, PlayerStart)` and `Content/Maps/L_TestMap.umap` exists.
- [ ] Open `/Game/Maps/L_TestMap` in the editor: it contains `SeminoleFloor`, `SeminoleSun`,
      `SeminoleSkyLight` and `SeminolePlayerStart`.
- [ ] Press Play on L_TestMap: the Output Log shows **no** `LogSeminole` spawn lines (the game
      mode found everything already in place), and the scene and controls match section 3.
- [ ] Running the script a second time logs `spawned: nothing, all four pieces were present`
      and adds no actors.
- [ ] Following the script header, point `GameDefaultMap` / `EditorStartupMap` at
      `/Game/Maps/L_TestMap.L_TestMap`, add it to `MapsToCook`, repackage and confirm the
      packaged game boots into it. Revert these local config changes and do not commit the
      `.umap` or the `.uproject` plugin change unless a ticket asks for it.

## Reporting

Record for each section: pass / fail, engine version shown in the editor's title bar, and the
exact error text for any failure (the Output Log for editor issues, the packaging log for
section 4, `Packaged\Windows\Seminole\Saved\Logs\Seminole.log` or
`%LOCALAPPDATA%\Seminole\Saved\Logs\Seminole.log` for section 5).
