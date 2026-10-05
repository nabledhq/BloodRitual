# Manual validation checklist

**None of the steps below were executed by the implementers of tickets #22 and #23.** The
changes were written and reviewed statically, in an environment without Unreal Engine or Windows.
Compiling, launching, playing, packaging and the automation tests have not been verified. The
first person with Unreal Engine 5.8 on Windows should walk through this list and record the
result (and any fixes) on the pull request or in a follow-up ticket. Section 7 covers the
vertical slice part 1 (#23).

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
      `MoveRight` (D/A), `Turn` (Mouse X), `LookUp` (Mouse Y, scale -1) and the Action Mappings
      `Jump` (Space Bar) and `Interact` (E) are listed; Default Player Input Class is
      `PlayerInput`, Default Input Component Class is `InputComponent`.

## 3. Play In Editor: scene, movement, look, jump

Before pressing Play, set the Play button's dropdown **Spawn player at: Default Player Start**
(the editor otherwise spawns at the viewport camera, which in the empty map may be below the
runtime-spawned floor).

- [ ] Press **Play** (Selected Viewport or New Editor Window). The Output Log (`LogSeminole`)
      shows four scene lines: spawned a floor, spawned a movable directional light, spawned a
      movable sky light, spawned a PlayerStart (followed by the three slice lines of section 7).
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
- [ ] Press Play a second time: still exactly the same `LogSeminole` spawn lines (no duplicates
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

## 7. Vertical slice part 1

Everything here is #23 code that has never been compiled. Check it after sections 1 to 3 pass.

### 7.1 Compile

- [ ] **Development Editor | Win64** builds with no errors after regenerating project files
      (new folders: `Source/Seminole/{Community,Interaction,Inventory,Survival,Tests,World}`;
      `Seminole.Build.cs` adds the `DeveloperSettings` module). Report any error verbatim.
- [ ] Unreal Header Tool accepts `USeminoleSettings`, `ASeminoleGameState`, `ASeminoleHUD`, the two
      `UINTERFACE`s (`USeminoleInteractable`, `USeminoleNoiseListener`), `USeminoleDayClockSubsystem`
      and `USeminoleNoiseSubsystem`.

### 7.2 Automation tests

- [ ] **Tools > Session Frontend > Automation**, filter `Seminole`. Three tests are listed under
      `Seminole.VerticalSlice`: `Noise.ListenersInsideRadiusHear`,
      `DayClock.TransitionsInOrderAndResets`, `Loot.SearchDepositAndSpend`.
- [ ] All three pass. They create a bare game world (`UWorld::CreateWorld`) and do not need a map.
      If `Loot.SearchDepositAndSpend` fails at "GameState registered"/deposit, note it: the test
      relies on `UWorld::SetGameState` and `AGameStateBase::PostInitializeComponents`.
- [ ] Headless alternative:
      `UnrealEditor-Cmd.exe <repo>\Seminole.uproject -ExecCmds="Automation RunTests Seminole.VerticalSlice; Quit" -unattended -nopause -nullrhi -log`
      ends with 3 passed, 0 failed.

### 7.3 Project Settings

- [ ] **Edit > Project Settings > Game > Seminole** exists and lists: Day Duration 480, Dusk Duration
      60, Dusk Warning 10; Day/Dusk/Night Sun Intensity 10 / 2.5 / 0.05; Day/Dusk/Night Sky Light
      Intensity 1 / 0.4 / 0.05; Bow Noise Radius 500, Rifle Noise Radius 3000, Container Search
      Noise Radius 800; Container Search Duration 2; Container Supplies with three entries
      (3/0/1, 0/6/2, 2/2/4); Interaction Range 250.
- [ ] Changing a value (e.g. Day Duration to 20) and pressing Play uses the new value; the
      change is written to `Config/DefaultGame.ini` under `[/Script/Seminole.SeminoleSettings]`.
      Revert it afterwards.

### 7.4 Play: clock, HUD, lighting

- [ ] On Play the Output Log also shows: spawned the hub stockpile, spawned 3 supply containers,
      spawned a placeholder noise listener, and `SeminoleDayClock` lines when the phase changes.
- [ ] The HUD (top-left) shows `Day 8:00` counting down, `Carrying: Food 0  Ammo 0  Materials 0`,
      `Stockpile: Food 0  Ammo 0  Materials 0`, and a controls line at the bottom. No widget assets
      were added; it is `ASeminoleHUD` drawing to the canvas.
- [ ] With Day Duration set to 20 s for this check: at 0:00 the HUD switches to an orange `Dusk 1:00`
      and a banner `DUSK - night is coming, return to the hub` is shown top-centre for 10 s. The
      scene visibly darkens over the 60 s of Dusk (sun 2.5 lux -> 0.05 lux, sky light 0.4 -> 0.05).
      Note: auto exposure partially compensates; the darkening should still be obvious.
- [ ] At the end of Dusk the HUD reads `Night` (blue, no countdown), the lights hold their night
      values and nothing further happens (part 3 owns the night).
- [ ] During Day the scene dims slightly over the phase (sun 10 -> 2.5 lux). If the maintainer
      prefers a constant daytime level, set Dusk Sun Intensity to 10 and tune only Night.

### 7.5 Play: containers, inventory, noise, stockpile

- [ ] 30 m ahead of the spawn (+X) stand three brown crates 3 m apart with a blue sphere beside
      them; 6 m behind the spawn stands a yellow block (hub stockpile).
- [ ] Walking within 2.5 m of a crate shows `[E] Search container` at the bottom centre. Pressing
      **E** shows `Searching... N%` for 2 s; then the crate turns dark grey, `Carrying:` increases by
      that crate's amounts, and the Output Log shows `found Food x  Ammo y  Materials z`.
- [ ] The blue sphere turns red the first time a search starts (the search emits a noise with an
      800 uu radius and the sphere is 400 to 500 uu from each crate); the log shows `heard noise #1`.
- [ ] Pressing **E** again at a searched crate does nothing and shows no prompt.
- [ ] Searching all three crates gives `Carrying: Food 5  Ammo 8  Materials 7` with the default
      settings.
- [ ] Near the yellow block with supplies, `[E] Deposit supplies` is shown; **E** sets `Carrying:` to
      all zeros and `Stockpile:` to the deposited totals. With nothing carried the prompt is hidden.
- [ ] Stopping and restarting Play resets everything (clock at Day, crates brown, stockpile zero).

### 7.6 Input binding

- [ ] `Interact` is the legacy action mapping added to `Config/DefaultInput.ini` (key E). If the
      project is later switched to Enhanced Input, this binding must be recreated as an Input
      Action and the `BindAction(TEXT("Interact"), ...)` call in `SeminolePlaceholderCharacter.cpp`
      replaced. No manual step is needed for the legacy path.

## Reporting

Record for each section: pass / fail, engine version shown in the editor's title bar, and the
exact error text for any failure (the Output Log for editor issues, the packaging log for
section 4, `Packaged\Windows\Seminole\Saved\Logs\Seminole.log` or
`%LOCALAPPDATA%\Seminole\Saved\Logs\Seminole.log` for section 5).
