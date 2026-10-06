# seminole
Seminole is a 3d game where the user is part of a Seminole tribe in the 1900s

## Unreal Engine project

The shipping game is built with **Unreal Engine 5.8** (`Seminole.uproject`,
C++ module `Seminole` under `Source/Seminole/`, content under `Content/`). The
technical foundation is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and the decisions behind it in [docs/adr/](docs/adr/README.md).

The project is a bootable shell plus **part 1 of the playable vertical slice**:
it opens an empty engine map, `ASeminoleGameMode` spawns a floor, lights, a
PlayerStart, a hub stockpile, three scavenging containers and a noise listener
at runtime, and `ASeminolePlaceholderCharacter` (a capsule with a cylinder,
third-person camera, WASD / mouse look / jump / interact) is the pawn. A day
clock runs Day -> Dusk -> Night, dimming the lights, and a Canvas HUD shows the
phase, your carried supplies and the stockpile. It builds and runs on
Unreal Engine 5.8.3; packaging has not been verified yet. The manual
checklist in [docs/VALIDATION.md](docs/VALIDATION.md) records what has been
checked so far.

## Getting Started

Windows is the supported development platform.

### Requirements

- **Unreal Engine 5.8**, installed through the Epic Games Launcher (the
  `.uproject` pins `EngineAssociation` to `5.8`).
- **Visual Studio 2022** with the *Game development with C++* workload
  (including the Windows 10/11 SDK and MSVC), or JetBrains **Rider**.
- **Git** and **Git LFS**.

### 1. Install Git LFS and clone

Binary assets (`.uasset`, `.umap`, textures, meshes, audio) go through Git
LFS. Install it *before* cloning so LFS files are fetched instead of pointer
stubs:

```sh
git lfs install
git clone https://github.com/nabledhq/seminole.git
cd seminole
```

If you cloned before installing LFS, run `git lfs install` and then
`git lfs pull` inside the repository.

### 2. Generate Visual Studio project files

Right-click `Seminole.uproject` in Explorer and choose **Generate Visual Studio
project files**. This creates `Seminole.sln` (ignored by Git). If the menu
entry is missing, run the Epic Games Launcher once so it registers the
`.uproject` file type, or use the Unreal Version Selector from the engine
install (`Engine\Binaries\Win64\UnrealVersionSelector.exe /projectfiles
<path>\Seminole.uproject`).

### 3. Build the editor

Open `Seminole.sln`, select **Development Editor | Win64**, set `Seminole` as
the startup project and **Build**. Rider: open the `.uproject` directly and
build the `SeminoleEditor` configuration.

### 4. Open the project

Double-click `Seminole.uproject`, or run `scripts\open-project.bat`. The script
uses `%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe` when the `UE_ROOT`
environment variable points at an engine install, and otherwise falls back to
the `.uproject` file association. The editor starts on the engine map
`/Engine/Maps/Entry`; it is empty until you play.

### 5. Play

Press **Play** (set *Spawn player at* to **Default Player Start** in the Play
dropdown, see Troubleshooting) or **Play > Standalone Game**. You should see a
grey 100 m x 100 m floor, a lit grey cylinder and a third-person camera.
Controls: **W/A/S/D** move, **mouse** looks, **Space** jumps, **E** interacts.

The vertical slice (part 1) loop:

1. The HUD (top left) shows `Day 8:00` counting down, your carried supplies
   and the stockpile totals. The green block 4 m ahead is the **stockpile**.
2. Walk straight ahead (the direction you face at start, +X), past the
   stockpile, about 30 m to the **scavenging area**: three brown crates in a
   row and a red sphere behind them.
3. Stand next to a crate; the prompt `[E] Search container` appears. Press
   **E**: a 2 s progress bar runs, the crate turns grey, your carried supplies
   go up, and the red sphere flashes yellow (it heard the search).
   A grey crate cannot be searched again.
4. Walk back to the stockpile and press **E** (`[E] Deposit supplies`): the
   carried counts go to zero and the stockpile totals rise.
5. After 8 minutes the HUD turns orange with a centred **DUSK** warning and
   the light turns amber; one minute later it is **NIGHT** and the scene
   goes dark. To get there faster, shorten *Day Duration Seconds* in
   **Edit > Project Settings > Game > Seminole** (all slice tunables live
   there) and press Play again.

Automation tests for these systems run from **Tools > Session Frontend >
Automation** (filter `Seminole`); see `Source/Seminole/Tests/README.md`.

### 6. Package for Windows

**Platforms > Windows > Package Project** with the **Development**
configuration. When asked for a folder, choose `Packaged` inside the
repository (it is in `.gitignore`). The result is
`Packaged\Windows\Seminole.exe`.

### 7. Run the packaged game

Launch `Packaged\Windows\Seminole.exe`, or run `scripts\run-latest-build.bat`,
which starts that executable and exits with an error (code 1) when no packaged
build exists yet.

### 8. Optional: generate a test map

`scripts/editor/create_test_map.py` creates and saves `/Game/Maps/L_TestMap`
(a floor, a directional light, a sky light and a PlayerStart) so you have an
editable map instead of the empty engine one. It needs the **Python Editor
Script Plugin** (Edit > Plugins), which is not enabled in the repository. The
file's header explains how to run it and how to point the config at the map.
The runtime fallback keeps working whether or not the script has been run,
and it spawns nothing on a map that already has those four actors. Do not
commit the generated map unless a ticket asks for it.

### Troubleshooting

- **"The following modules are missing or built with a different engine
  version" / rebuild prompt** when opening the `.uproject`: the editor DLLs
  under `Binaries/` are stale or absent. Click **No**, build **Development
  Editor | Win64** in Visual Studio or Rider, then open the project again.
  (Clicking **Yes** also works for small changes but hides compile errors.)
- **Project files out of date or Visual Studio does not list new source
  files**: regenerate them (right-click `Seminole.uproject` > *Generate Visual
  Studio project files*). Do this after adding or removing `.cpp`/`.h` files
  or editing `*.Build.cs` / `*.Target.cs`. Deleting `Binaries/`,
  `Intermediate/` and `Saved/` before regenerating gives a clean slate; they
  are all ignored by Git.
- **Wrong engine version**: if several engines are installed, right-click
  `Seminole.uproject` > *Switch Unreal Engine version...* and pick 5.8, or set
  `UE_ROOT` for `scripts\open-project.bat`.
- **Assets are tiny text files starting with `version https://git-lfs...`**:
  these are LFS pointer files, meaning Git LFS was not installed when you
  cloned. Run `git lfs install` then `git lfs pull`.
- **The character falls into darkness when pressing Play**: the editor spawned
  the pawn at the viewport camera position (its default), which in the empty
  engine map may sit below or outside the runtime floor. Use the Play dropdown
  and set *Spawn player at* to **Default Player Start**, or move the viewport
  camera above the origin.
- **`run-latest-build.bat` reports no packaged build**: package first (step
  6) and make sure the output folder is the repository's `Packaged` directory,
  so the executable ends up at `Packaged\Windows\Seminole.exe`.

## Project layout

```
Seminole.uproject       Unreal Engine 5.8 project (module Seminole; no plugins enabled yet)
Source/                 UE C++: Seminole.Target.cs, SeminoleEditor.Target.cs and the Seminole module
  Seminole/             Module (Seminole.Build.cs, Seminole.h/.cpp) and the bootstrap classes:
                        SeminoleGameMode, SeminolePlaceholderCharacter, SeminoleTestEnvironment;
                        plus one README-only folder per planned system
Content/                UE assets (AI, Characters, Environments, Items, Maps, Missions, Weapons, UI, Audio); empty for now
Config/                 UE DefaultEngine.ini (maps, game mode), DefaultGame.ini (project, packaging), DefaultInput.ini (legacy mappings)
scripts/                open-project.bat, run-latest-build.bat, editor/create_test_map.py
Packaged/               Packaged game output (ignored by Git; created by Platforms > Windows > Package Project)
docs/ARCHITECTURE.md    Technical foundation of the Unreal project
docs/VALIDATION.md      Manual build / play / package checklist (not yet executed)
docs/adr/               Architecture decision records
.gitattributes          Git LFS rules for binary assets; CRLF for .bat files
```
