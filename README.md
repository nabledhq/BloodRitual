# Indigenous: Blood Ritual

*Indigenous: Blood Ritual* is a 3D game where the player is part of a Seminole camp in the
Florida Everglades around 1900. Its code name is `BloodRitual` (`BloodRitual.uproject`, the
`BloodRitual` module, `ABloodRitual*` classes).

## Unreal Engine project

The shipping game is built with **Unreal Engine 5.8** (`BloodRitual.uproject`,
C++ module `BloodRitual` under `Source/BloodRitual/`, content under `Content/`). The
technical foundation is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and the decisions behind it in [docs/adr/](docs/adr/README.md).

The project is a bootable shell plus **part 1 of the playable vertical slice**:
it opens an empty engine map, `ABloodRitualGameMode` spawns a mud-and-leaves floor,
lights, a PlayerStart, a hub stockpile, three scavenging containers, a noise
listener and camp scenery (a fire pit, a stump, a fallen trunk, rocks, ferns and
shrubs) under a sky at runtime, and `ABloodRitualProtagonistCharacter` (a Seminole man of around
1900 in a big shirt, sash, kerchief and turban, animated, with a third-person camera and
WASD / mouse look / jump / interact) is the pawn. A day
clock runs Day -> Dusk -> Night, dimming the lights, and a Canvas HUD shows the
phase, your carried supplies and the stockpile. Everything is stand-in art, not final art:
CC0 models and ground from Poly Haven, and a MakeHuman (MPFB) man whose clothing is generated
by this repository, animated with retargeted CC0 Quaternius clips (see
[ASSETS_LICENSES.md](ASSETS_LICENSES.md)). The character is a game-art interpretation that has
not been reviewed by Seminole cultural advisors. It builds and runs on
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
stubs (without them the game falls back to grey engine shapes):

```sh
git lfs install
git clone https://github.com/nabledhq/BloodRitual.git
cd BloodRitual
```

If you cloned before installing LFS, run `git lfs install` and then
`git lfs pull` inside the repository.

### 2. Generate Visual Studio project files

Right-click `BloodRitual.uproject` in Explorer and choose **Generate Visual Studio
project files**. This creates `BloodRitual.sln` (ignored by Git). If the menu
entry is missing, run the Epic Games Launcher once so it registers the
`.uproject` file type, or use the Unreal Version Selector from the engine
install (`Engine\Binaries\Win64\UnrealVersionSelector.exe /projectfiles
<path>\BloodRitual.uproject`).

### 3. Build the editor

Open `BloodRitual.sln`, select **Development Editor | Win64**, set `BloodRitual` as
the startup project and **Build**. Rider: open the `.uproject` directly and
build the `BloodRitualEditor` configuration.

### 4. Open the project

Double-click `BloodRitual.uproject`, or run `scripts\open-project.bat`. The script
uses `%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe` when the `UE_ROOT`
environment variable points at an engine install, and otherwise falls back to
the `.uproject` file association. The editor starts on the engine map
`/Engine/Maps/Entry`; it is empty until you play.

### 5. Play

Press **Play** (set *Spawn player at* to **Default Player Start** in the Play
dropdown, see Troubleshooting) or **Play > Standalone Game**. You should see a
100 m x 100 m muddy clearing with ferns and shrubs under a blue sky, the Seminole man and a
third-person camera behind it.
Controls: **W/A/S/D** move, **mouse** looks, **Space** jumps, **E** interacts.

The vertical slice (part 1) loop:

1. The HUD (top left) shows `Day 8:00` counting down, your carried supplies
   and the stockpile totals. The crates and barrel 4 m ahead are the
   **stockpile**; the stone fire pit is to their right.
2. Walk straight ahead (the direction you face at start, +X), past the
   stockpile, about 30 m to the **scavenging area**: a crate, a barrel and a
   basket in a row and a red sphere behind them.
3. Stand next to a container; the prompt `[E] Search container` appears. Press
   **E**: a 2 s progress bar runs, the container darkens, your carried supplies
   go up, and the red sphere flashes yellow (it heard the search).
   A darkened container cannot be searched again.
4. Walk back to the stockpile and press **E** (`[E] Deposit supplies`): the
   carried counts go to zero and the stockpile totals rise.
5. After 8 minutes the HUD turns orange with a centred **DUSK** warning and
   the light turns amber; one minute later it is **NIGHT** and the scene
   goes dark. To get there faster, shorten *Day Duration Seconds* in
   **Edit > Project Settings > Game > Blood Ritual** (all slice tunables live
   there) and press Play again.

Automation tests for these systems run from **Tools > Session Frontend >
Automation** (filter `BloodRitual`); see `Source/BloodRitual/Tests/README.md`.

The stand-in art is committed, so you only rebuild it to change it:

- `Content/Items` and `Content/Environments`: `scripts/editor/import_cc0_assets.py`
  downloads the Poly Haven models and imports them.
- `Content/Characters`: `scripts/blender/build_protagonist.py` builds the man in
  Blender 4.2+ with the MPFB extension and its CC0 "MakeHuman system assets" pack
  (body, clothing, textures, and a clean copy of the Quaternius clips), then
  `scripts/editor/import_protagonist.py` imports him and retargets the clips.

Each script's header explains how to run it.

### 6. Package for Windows

**Platforms > Windows > Package Project** with the **Development**
configuration. When asked for a folder, choose `Packaged` inside the
repository (it is in `.gitignore`). The result is
`Packaged\Windows\BloodRitual.exe`.

### 7. Run the packaged game

Launch `Packaged\Windows\BloodRitual.exe`, or run `scripts\run-latest-build.bat`,
which starts that executable and exits with an error (code 1) when no packaged
build exists yet.

### 8. Optional: generate a test map

`scripts/editor/create_test_map.py` creates and saves `/Game/Maps/L_TestMap`
(a floor, a directional light, a sky light and a PlayerStart) so you have an
editable map instead of the empty engine one. It runs on the **Python Editor
Script Plugin**, which the `.uproject` enables (editor only). The file's header
explains how to run it and how to point the config at the map.
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
  files**: regenerate them (right-click `BloodRitual.uproject` > *Generate Visual
  Studio project files*). Do this after adding or removing `.cpp`/`.h` files
  or editing `*.Build.cs` / `*.Target.cs`. Deleting `Binaries/`,
  `Intermediate/` and `Saved/` before regenerating gives a clean slate; they
  are all ignored by Git.
- **Wrong engine version**: if several engines are installed, right-click
  `BloodRitual.uproject` > *Switch Unreal Engine version...* and pick 5.8, or set
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
  so the executable ends up at `Packaged\Windows\BloodRitual.exe`.

## Project layout

```
BloodRitual.uproject       Unreal Engine 5.8 project (module BloodRitual; Python Editor Script Plugin, editor only)
Source/                 UE C++: BloodRitual.Target.cs, BloodRitualEditor.Target.cs and the BloodRitual module
  BloodRitual/          Module (BloodRitual.Build.cs, BloodRitual.h/.cpp) and the bootstrap classes:
                        BloodRitualGameMode, BloodRitualProtagonistCharacter, BloodRitualTestEnvironment;
                        plus one README-only folder per planned system
Content/                UE assets: Characters/{Protagonist,Materials}, Environments/{Camp,Ground,Materials}, Items/Containers (stand-ins)
Config/                 UE DefaultEngine.ini (maps, game mode), DefaultGame.ini (project, packaging), DefaultInput.ini (legacy mappings)
scripts/                open-project.bat, run-latest-build.bat, editor/ (Unreal Python: create_test_map, import_cc0_assets,
                        import_protagonist), blender/build_protagonist.py
Packaged/               Packaged game output (ignored by Git; created by Platforms > Windows > Package Project)
docs/ARCHITECTURE.md    Technical foundation of the Unreal project
docs/VALIDATION.md      Manual build / play / package checklist (not yet executed)
docs/adr/               Architecture decision records
.gitattributes          Git LFS rules for binary assets; CRLF for .bat files
```
