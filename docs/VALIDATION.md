# Manual validation checklist

**None of the steps below were executed by the implementers of tickets #22 and #23.** The
changes were written and reviewed statically, in an environment without Unreal Engine or
Windows. Compiling, launching, playing, testing and packaging have not been verified. The first
person with Unreal Engine 5.8 on Windows should walk through this list and record the result
(and any fixes) on the pull request or in a follow-up ticket. Section 7 covers the vertical
slice part 1 (#23).

**First run, 2026-10-06** (Unreal Engine 5.8.3, Visual Studio 2022 / MSVC 14.44, Windows 10):

* The editor target did not compile at first: headers are included by path from the module root
  (`"Inventory/BloodRitualSupplyTypes.h"`), which was not an include path. Fixed by
  `PublicIncludePaths.Add(ModuleDirectory)` in `BloodRitual.Build.cs`; the build then succeeded with
  no errors or warnings (built with `Engine\Build\BatchFiles\Build.bat BloodRitualEditor Win64
  Development`, not through a generated `.sln`).
* The game ran standalone (`UnrealEditor.exe BloodRitual.uproject -game`) with no errors in the log.
  `LogBloodRitual` showed the floor, both lights, stockpile, 3 containers and noise listener being
  spawned and `Day begins (480 s)`. No "spawned a PlayerStart" line appeared. Searching two
  crates logged the search start, the noise heard by the listener (distances 600 and 650 within
  radius 800) and the completed search (`Ammo 10`, then `Food 3`).
* Not yet checked: project-file generation, PIE, the visual items, the HUD, the stockpile
  deposit, dusk/night and packaging.
* Later the same day, after the CC0 stand-in art (ADR 0011): the four automation tests passed
  headless (`UnrealEditor-Cmd.exe ... -ExecCmds="Automation RunTests BloodRitual; Quit" -nullrhi`),
  and standalone screenshots showed the textured floor, the stockpile, the three containers,
  the camp scenery and the player character idling and walking, with no errors in the log. On this
  machine (GTX 1080, driver 560.94) the engine stops at a "denylisted driver" dialog before the
  first frame; pass `-unattended` or update the driver.

Prerequisites: Windows 10/11, Unreal Engine 5.8 (Epic Games Launcher), Visual Studio 2022 with
the "Game development with C++" workload (or Rider), Git with Git LFS. Follow the README's
[Getting Started](../README.md#getting-started) up to and including generating project files.

Tick each box only when the observed result matches.

## 1. Build the editor target

- [ ] Right-click `BloodRitual.uproject` > **Generate Visual Studio project files** completes
      without errors and produces `BloodRitual.sln` (ignored by Git).
- [x] In Visual Studio, configuration **Development Editor | Win64**, project `BloodRitual`:
      **Build** succeeds with no errors. (Warnings about the deprecated legacy input path are
      acceptable; errors are not.)
- [x] The build produced `Binaries/Win64/UnrealEditor-BloodRitual.dll`.

## 2. Open the editor and the startup map

- [ ] `scripts\open-project.bat` (or double-clicking `BloodRitual.uproject`) opens Unreal Editor
      5.8 without a "missing modules / rebuild" prompt.
- [ ] The editor starts on the startup map `/Engine/Maps/Entry` (`Config/DefaultEngine.ini`,
      `EditorStartupMap`). This is an empty engine map, so the editor viewport is empty before
      play; that is expected.
- [ ] **Edit > Project Settings > Maps & Modes**: Default GameMode is `BloodRitualGameMode`,
      Default Pawn Class is `BloodRitualProtagonistCharacter`, Editor Startup Map and Game Default
      Map are both `Entry`.
- [ ] **Edit > Project Settings > Input**: the Axis Mappings `MoveForward` (W/S),
      `MoveRight` (D/A), `Turn` (Mouse X), `LookUp` (Mouse Y, scale -1) and the Action Mappings
      `Jump` (Space Bar) and `Interact` (E) are listed; Default Player Input Class is
      `PlayerInput`, Default Input Component Class is `InputComponent`.

## 3. Play In Editor: scene, movement, look, jump

Before pressing Play, set the Play button's dropdown **Spawn player at: Default Player Start**
(the editor otherwise spawns at the viewport camera, which in the empty map may be below the
runtime-spawned floor).

- [ ] Press **Play** (Selected Viewport or New Editor Window). The Output Log (`LogBloodRitual`)
      shows four scene lines: spawned a floor, spawned a movable directional light, spawned a
      movable sky light, spawned a PlayerStart (plus the slice lines checked in section 7).
- [ ] The scene shows a large flat muddy floor with ferns, shrubs and rocks, lit by a directional
      light under a blue sky, with the Seminole man (the placeholder character) standing on it, viewed from a
      third-person camera behind it.
      The sky is black (there is no atmosphere in this shell); that is expected.
- [ ] The World Outliner lists `BloodRitualTestEnvironment`, `BloodRitualFloor`, `BloodRitualSun`,
      `BloodRitualSkyLight` and `BloodRitualPlayerStart` (only during play), plus the slice actors of
      section 7.
- [ ] **W / S** move forward / back and **A / D** strafe left / right, relative to the camera.
      The character turns to face the direction it moves and walks, jogs or sprints with speed;
      his shadowed side is lit by the sky, not black.
- [ ] Moving the **mouse** orbits the camera around the character (left/right = yaw, up/down =
      pitch; moving the mouse up looks up).
- [ ] **Space** jumps; the character leaves the floor and lands on it again.
- [ ] Walking to the edge of the floor (50 m from the start) and off it makes the character
      fall, confirming the floor has collision and nothing else is holding the pawn.
- [ ] Press Play a second time: the same `LogBloodRitual` spawn lines as the first time (no
      duplicates accumulate between sessions).
- [ ] **Play > Standalone Game** boots the same scene with the same controls.

## 4. Package Win64 Development

- [ ] **Platforms > Windows > Package Project** (Binary Configuration: **Development**,
      build target `BloodRitual`). When asked for an output folder, choose `<repo>\Packaged`.
- [ ] Packaging finishes with "BUILD SUCCESSFUL" and produces
      `Packaged\Windows\BloodRitual.exe` (plus `BloodRitual\` and `Engine\` folders beside it).
- [ ] `git status` shows nothing new: `Packaged/`, `Binaries/`, `Intermediate/`, `Saved/`,
      `DerivedDataCache/` and `*.sln` are all ignored.

## 5. Run the packaged game

- [ ] `scripts\run-latest-build.bat` launches the game. (Also check the failure path: rename
      `Packaged\Windows\BloodRitual.exe` temporarily, run the script, confirm it prints the
      "No packaged build found" error and `echo %errorlevel%` prints `1`, then rename back.)
- [ ] The packaged game loads the same scene as PIE: floor, sky, lighting, character, models.
      (If grey engine shapes appear instead of models, the `/Game` content folders were not
      cooked; note it on the PR.)
- [ ] WASD, mouse look and Space behave as in section 3.
- [ ] `Alt+F4` closes the game cleanly.

## 6. Optional: generate and boot L_TestMap

- [x] The **Python Editor Script Plugin** is enabled in the `.uproject` (editor only).
- [ ] **Tools > Execute Python Script...**, choose `scripts/editor/create_test_map.py`. The
      Output Log shows `create_test_map: saved /Game/Maps/L_TestMap (spawned: floor,
      directional light, sky light, PlayerStart)` and `Content/Maps/L_TestMap.umap` exists.
- [ ] Open `/Game/Maps/L_TestMap` in the editor: it contains `BloodRitualFloor`, `BloodRitualSun`,
      `BloodRitualSkyLight` and `BloodRitualPlayerStart`.
- [ ] Press Play on L_TestMap: the Output Log shows **no** `LogBloodRitual` spawn lines (the game
      mode found everything already in place), and the scene and controls match section 3.
- [ ] Running the script a second time logs `spawned: nothing, all four pieces were present`
      and adds no actors.
- [ ] Following the script header, point `GameDefaultMap` / `EditorStartupMap` at
      `/Game/Maps/L_TestMap.L_TestMap`, add it to `MapsToCook`, repackage and confirm the
      packaged game boots into it. Revert these local config changes and do not commit the
      `.umap` or the `.uproject` plugin change unless a ticket asks for it.

## 7. Vertical slice part 1 (#23): config, clock, noise, loot, stockpile

Everything in this section was written without a compiler. Start with the build and the tests;
compile errors are the most likely failure and should be reported with the exact error text.

### 7.1 Compile

- [x] **Development Editor | Win64** builds with no errors after regenerating project files
      (new folders `Survival/`, `World/`, `Inventory/`, `Interaction/`, `Community/`, `UI/`,
      `Tests/` under `Source/BloodRitual/`; new module dependency `DeveloperSettings` in
      `BloodRitual.Build.cs`).
- [ ] Known risk points to look at if it does not: `EAutomationTestFlags_ApplicationContextMask`
      (UE >= 5.5 enum-class flags) in `Tests/*.cpp`; `UWorld::CreateWorld` /
      `GEngine->CreateNewWorldContext` in `Tests/BloodRitualTestWorld.h`; `AHUD::DrawText` /
      `DrawRect` / `GetTextSize` in `UI/BloodRitualHUD.cpp`; `Cast<IBloodRitualInteractable>` /
      `Cast<IBloodRitualNoiseListener>` on actors.

### 7.2 Automation tests

- [ ] **Tools > Session Frontend > Automation**, refresh, filter `BloodRitual`. Four tests are
      listed: `BloodRitual.Survival.DayClock.Transitions`,
      `BloodRitual.Survival.DayClock.LargeStepCrossesPhasesInOrder`,
      `BloodRitual.World.Noise.RadiusFiltering`, `BloodRitual.Inventory.LootFlow`.
- [x] All four pass. (The noise and loot tests create and destroy a throwaway game world; a
      failure there with a null world or subsystem points at `Tests/BloodRitualTestWorld.h`.)
- [x] Optional, headless:
      `UnrealEditor-Cmd.exe <repo>\BloodRitual.uproject -ExecCmds="Automation RunTests BloodRitual; Quit" -unattended -nopause -nullrhi -log`
      reports 4 passed in the log.

### 7.3 Settings

- [ ] **Edit > Project Settings > Game > Blood Ritual** exists and shows: Day Duration 480, Dusk
      Duration 60, Bow Noise Radius 500, Rifle Noise Radius 3000, Container Search Noise Radius
      800, Container Search Duration 2, three Scavenging Containers (Food 3; Ammo 10;
      Materials 5 + Food 1), Interaction Range 250, and the Lighting values.
- [ ] Changing *Day Duration Seconds* to 20 and pressing **Set as Default** writes a
      `[/Script/BloodRitual.BloodRitualSettings]` section to `Config/DefaultGame.ini`. Revert
      afterwards (or do not commit it).

### 7.4 Spawned placeholders

- [ ] Press **Play**. `LogBloodRitual` additionally shows: spawned the hub stockpile, spawned 3
      scavenging containers, spawned a placeholder noise listener, `BloodRitualDayLighting: driving
      a directional light and a sky light`, and `BloodRitualDayClock: Day begins (480 s)`.
- [ ] The World Outliner lists `BloodRitualStockpile`, `BloodRitualContainer1..3` and
      `BloodRitualNoiseListener`.
- [ ] Crates and a barrel (the stockpile) stand 4 m in front of the start; 30 m away along +X
      stand a crate, a barrel and a basket in a row with a red sphere 6 m behind them. All rest
      on the floor (not sunk, not floating).

### 7.5 HUD and clock

- [ ] Top left: `Day 8:00` (large font) counting down once per second, then
      `Carried:   Food 0  Ammo 0  Materials 0` and `Stockpile: Food 0  Ammo 0  Materials 0`.
- [ ] Nothing else is drawn until you approach an interactable (no prompt, no warning).

### 7.6 Interact: containers and the noise listener

- [ ] Walk to a crate. Within about 2.5 m the prompt `[E] Search container` appears centred in
      the lower third of the screen; it disappears when you walk away.
- [ ] Press **E** next to a crate: the prompt changes to `[E] Searching...`, a yellow progress
      bar fills over 2 seconds, then the container darkens, the prompt reads
      `[E] Container (empty)` and *Carried* shows the crate's supplies (e.g. `Food 3`).
      `LogBloodRitual` shows the search start, the noise heard by `BloodRitualNoiseListener`, and
      the search complete line.
- [ ] The red sphere flashes yellow for about a second when the search starts.
- [ ] Pressing **E** at a darkened container does nothing (supplies unchanged, no log line).
- [ ] Search the other two crates: *Carried* accumulates `Food 4  Ammo 10  Materials 5`.
- [ ] Pressing **E** with no interactable in range does nothing.

### 7.7 Interact: stockpile

- [ ] Near the stockpile with empty hands the prompt reads
      `[E] Stockpile (nothing to deposit)` and **E** does nothing.
- [ ] Carrying supplies, the prompt reads `[E] Deposit supplies`; pressing **E** sets *Carried*
      to all zeros and *Stockpile* to the deposited totals. `LogBloodRitual` shows the deposit line.

### 7.8 Dusk, night and lighting

For a quick run set *Day Duration Seconds* to 20 and *Dusk Duration Seconds* to 10 in Project
Settings (revert afterwards).

- [ ] During Day the scene gradually dims and warms: the sun goes from white-ish (intensity 10)
      to amber (intensity 3) by the end of Day.
- [ ] At the end of Day the top-left line turns orange (`Dusk 0:10` counting down) and a
      centred box reads `DUSK - night falls in 0:10. Return to the hub!`. `LogBloodRitual`:
      `BloodRitualDayClock: Dusk begins (10 s)`.
- [ ] During Dusk the light fades to the night values (sun intensity 0.05, bluish).
- [ ] At the end of Dusk the line reads `Night` in red with no timer, the centred box reads
      `NIGHT - the camp is on its own until dawn.`, the scene is dark, and the clock stays at
      Night indefinitely. `LogBloodRitual`: `BloodRitualDayClock: Night begins (0 s)`.
- [ ] Containers and the stockpile still work at Night.

### 7.9 Standalone and packaged

- [ ] **Play > Standalone Game** shows the same HUD, placeholders and behaviour.
- [ ] A packaged Win64 Development build (section 4) shows the same; in particular the crates
      and stockpile are tinted (if they are plain white/grey checker, `/Engine/BasicShapes`
      or its material was not cooked; note it on the PR).

## Reporting

Record for each section: pass / fail, engine version shown in the editor's title bar, and the
exact error text for any failure (the Output Log for editor issues, the packaging log for
section 4, `Packaged\Windows\BloodRitual\Saved\Logs\BloodRitual.log` or
`%LOCALAPPDATA%\BloodRitual\Saved\Logs\BloodRitual.log` for section 5).
