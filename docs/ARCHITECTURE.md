# Indigenous: Blood Ritual architecture

*Indigenous: Blood Ritual* (code name `BloodRitual`) is a 1–4 player co-op survival game set in the Florida Everglades
around 1900. Players are members of a Seminole camp: by day they travel the
swamp by canoe and scavenge; by night they defend the camp against the
infected. This document records the technical foundation every later
community-funded feature builds on. Each major choice has an architecture
decision record in [`adr/`](adr/README.md).

This document describes intent. Most of it is not implemented yet; the ticket
that implements a system owns the details and updates this file. What exists
today is listed under [Implemented: vertical slice part 1](#implemented-vertical-slice-part-1).

## Engine and programming model

* Unreal Engine **5.8**, desktop first (Windows, then Linux and macOS as
  effort allows), distributed on Steam. See [ADR 0001](adr/0001-unreal-engine-5.md).
* One game module, `BloodRitual`, under `Source/BloodRitual/`, with one subfolder
  per system (AI, Characters, Combat, Community, Inventory, Interaction,
  Multiplayer, Persistence, Survival, Vehicles, World). Each subfolder's
  `README.md` states its purpose.
* C++ for core systems: base classes, components, subsystems, replication,
  save/load and anything performance-sensitive. Blueprint and data assets for
  content: concrete characters, items, weapons, missions and tuning. Blueprint
  classes derive from C++ bases and are not expected to contain system logic.
  See [ADR 0002](adr/0002-cpp-blueprint-hybrid.md).
* Enhanced Input for all player input; Input Actions and Mapping Contexts are
  data assets under `Content/`. Until the Characters ticket lands, the
  bootstrap `ABloodRitualProtagonistCharacter` (module root) uses legacy
  axis/action mappings from `Config/DefaultInput.ini` so the project boots
  without any input assets (the vertical slice added `Interact` = E the same
  way). The real character replaces it, keeping its inventory and
  interaction components and binding `Interact` through Enhanced Input.
* No Gameplay Ability System by default. Health, stamina, damage and status
  effects are plain components and data assets until a concrete need appears.
  See [ADR 0007](adr/0007-no-gameplay-ability-system-by-default.md).

### Intended plugins

The project enables **no** plugins today (`BloodRitual.uproject` has an empty
`Plugins` list). Each of the following is enabled in the later ticket that
first needs it, never speculatively:

| Plugin | Needed by |
| --- | --- |
| StateTree | Infected AI |
| CommonUI | UI |
| PCG | World generation |
| MetaSounds | Audio |
| OnlineSubsystemSteam | Multiplayer/Steam |

## AI

The infected are `ACharacter`-based actors driven by **StateTree**, perceiving
through **AI Perception** (sight and hearing) and moving on **NavMesh**.
See [ADR 0003](adr/0003-statetree-ai-without-massentity-at-first.md).

State flow:

```
Idle -> Wander -> Hear Noise -> Investigate -> Detect Player -> Chase -> Attack -> Lose Player -> Search -> Wander
```

* `Idle` / `Wander`: low-cost ambient behaviour; wander picks reachable
  NavMesh points near a home location.
* `Hear Noise` / `Investigate`: a noise event (below) or a hearing stimulus
  sets a point of interest; the infected walks there and looks around.
* `Detect Player` / `Chase` / `Attack`: sight confirms a target; chase uses
  NavMesh pathing; attack is a melee range check and a hit on the target.
* `Lose Player` / `Search`: on losing sight, search around the last known
  position for a while, then fall back to `Wander`.

StateTree tasks, conditions and evaluators are C++ in `Source/BloodRitual/AI/`;
the trees themselves and per-type tuning are assets under `Content/AI/`.
AI runs on the host only (see Multiplayer); clients receive replicated
movement and animation.

## Noise event system

Noise is **one shared gameplay event**, not a per-system mechanic. See
[ADR 0004](adr/0004-noise-event-system.md).

* A world subsystem (`Source/BloodRitual/World/`) exposes
  `ReportNoise(Location, Loudness, Instigator, Tag)`. **Implemented** (part 1)
  as `UBloodRitualNoiseSubsystem::EmitNoise(Location, Radius, Instigator)`; the
  tag parameter arrives with the first system that needs it.
* Everything that makes noise calls it: footsteps, gunshots, melee impacts,
  canoe paddling, doors, dropped items, campfire work. Today: container
  searches.
* The subsystem forwards each event to AI Perception's hearing sense and
  broadcasts a delegate so other systems (audio cues, UI, missions) can react
  to the same event. Today it delivers to registered `IBloodRitualNoiseListener`
  objects within the radius (plain 3D distance) and broadcasts
  `OnNoiseEmitted`; AI Perception forwarding is part 2's job.
* Loudness is a radius in world units; falloff and material attenuation are
  tuning details for the implementing ticket.

## Large-population roadmap

1. **StateTree actors first.** The vertical slice uses individual
   `ACharacter` infected driven by StateTree. This is the simplest thing that
   works, debuggable in the editor, and sufficient for the camp-defense scale
   of the slice.
2. **Cheap distance tiers.** Reduce tick rate, perception frequency and
   animation quality for infected far from any player before touching the
   architecture.
3. **MassEntity as an optional later step.** If a later feature needs hordes
   beyond what tiered actors can handle, MassEntity can represent distant
   infected as entities and hand off to StateTree actors near players. This
   is not planned for the vertical slice and is not a dependency of any
   current system.

## World

* One persistent swamp level using **World Partition** for streaming; islands,
  hammocks and camp sites are placed as data layers and streamed by distance.
* **PCG** scatters vegetation, debris and loot spawn points from biome rules
  so the swamp can grow without hand-placing every palmetto.
* Water is traversable by canoe (see Gameplay components) and slow to wade.
* A day/night cycle is the clock for the scavenge and defense phases
  (Survival).
* World code lives in `Source/BloodRitual/World/`; maps and PCG graphs under
  `Content/Maps/` and `Content/Environments/`.

## Multiplayer/Steam

* **Listen server** for 1–4 players: one player hosts, others join. Single
  player is a listen server with no clients. See
  [ADR 0005](adr/0005-listen-server-and-steam.md).
* Authority lives on the host: AI, noise, damage, inventory mutations, loot
  and the day/night clock. Clients predict only their own movement.
* Steam provides sessions, invites and friends-join through
  `OnlineSubsystemSteam`; the Steam AppID and Steamworks configuration are
  added when the Steam ticket is funded.
* Code in `Source/BloodRitual/Multiplayer/`. No dedicated servers.

## Persistence

* A **host-owned save game**: the host's machine stores the camp, world state,
  mission progress and every participating player's character. See
  [ADR 0006](adr/0006-host-owned-save-game.md).
* Saving happens at phase boundaries (end of day, end of night) and on
  graceful exit, using `USaveGame` subclasses serialised with the engine's
  save system.
* Clients joining a saved session receive state through normal replication;
  their own character is restored from the host's save when they reconnect.
* Code in `Source/BloodRitual/Persistence/`.

## Gameplay components

Systems are `UActorComponent`s on C++ base actors, configured by data assets.
Planned components and their folders:

| Folder | Components |
| --- | --- |
| `Characters/` | Player and villager base characters, Enhanced Input, animation hooks |
| `Survival/` | Health, stamina, hunger, day/night phase (`UBloodRitualDayClockComponent` exists) |
| `Combat/` | Weapons, melee and ranged attacks, damage |
| `Inventory/` | Items, containers, equipment (`UBloodRitualInventoryComponent`, `ABloodRitualSupplyContainer` exist) |
| `Interaction/` | Interactable actors and the interaction component (`IBloodRitualInteractable`, `UBloodRitualInteractionComponent` exist) |
| `Vehicles/` | Canoe: a paddled pawn carrying passengers |
| `Community/` | Villagers, roles, camp upgrades (`ABloodRitualStockpile` exists) |

Every component that can make noise reports it through the noise subsystem.

## UI

* **UMG** widgets built on **CommonUI** for consistent input handling across
  keyboard/mouse and gamepad, and for a single activatable-widget stack.
* HUD (health, stamina, time of day, noise indicator), inventory, pause and
  session menus. Widget assets under `Content/UI/`. Until the UI ticket,
  `ABloodRitualHUD` (`Source/BloodRitual/UI/`) draws the slice's HUD with the
  `AHUD` Canvas so no widget assets are needed.

## Audio

* **MetaSounds** for procedural, parameter-driven sound: swamp ambience that
  follows the time of day, infected vocalisations, weapons.
* Audio reacts to the same noise events the AI hears, so what players hear and
  what the infected hear stay consistent.
* Sound assets under `Content/Audio/`.

## Art pipeline

* Source files (`.blend`, `.spp`, `.sbs`, `.sbsar`, `.psd`) are kept in the
  repository through Git LFS alongside the exported `.fbx`, `.png`, `.tga`
  and `.wav` they produce.
* Characters, environments, items and weapons each have a `Content/`
  folder; naming and texel-density conventions are set by the first art
  ticket.
* Until then the slice uses stand-in art built by scripts: CC0 Poly Haven models and
  ground (`scripts/editor/import_cc0_assets.py`) and a MakeHuman (MPFB) Seminole man in
  generated period clothing with retargeted CC0 Quaternius clips
  (`scripts/blender/build_protagonist.py`, `scripts/editor/import_protagonist.py`), with
  `SM_`, `SKM_`, `MI_`, `T_`, `A_` and `BS_` prefixes. See
  [ADR 0011](adr/0011-cc0-stand-in-art.md) and `ASSETS_LICENSES.md`.
* The period setting (Seminole camp life around 1900) should be reviewed by
  cultural advisors before final art is accepted.

## Source control

* **Git with Git LFS**. `.gitattributes` routes `.uasset`, `.umap`, `.fbx`,
  `.png`, `.tga`, `.jpg`, `.exr`, `.psd`, `.wav`, `.mp3`, `.ogg`, `.blend`,
  `.spp`, `.sbs` and `.sbsar` through LFS. See
  [ADR 0008](adr/0008-git-lfs-before-perforce.md).
* Binary assets cannot be merged. Until file locking is needed, coordinate
  through tickets: one open ticket owns a given map or asset at a time. Keep
  maps small and split content with World Partition data layers and One File
  Per Actor to reduce conflicts.
* `.gitignore` excludes `Binaries/`, `Intermediate/`, `Saved/`,
  `DerivedDataCache/`, IDE files and the packaged output folder `Packaged/`.
  `Content/` and `Config/` are tracked.
* Perforce is a possible later move if LFS becomes a bottleneck; nothing in
  the layout prevents it.

## Browser strategy

* The Unreal Engine 5.8 project is the only game in the repository.
* The earlier Babylon.js browser prototype (`src/`, `index.html`,
  `package.json` and its GitHub Pages workflow) has been removed; see
  [ADR 0010](adr/0010-retire-browser-prototype.md). It remains in Git
  history.
* Browser-first builds of the Unreal project (Pixel Streaming or otherwise)
  are out of scope.

## Vertical slice contents and target loop

Contents:

* One swamp map (World Partition, PCG-scattered vegetation).
* Canoe travel between the camp and scavenge sites.
* A **day scavenge phase**: paddle out, explore, gather items, make noise
  carefully, return.
* A **night defense phase**: infected drawn by noise and light approach the
  camp; players defend it.
* Co-op for 1–4 players over a listen server.

Target loop: wake at camp -> canoe out -> scavenge -> return before dark ->
prepare -> survive the night -> repeat. Each loop should make the camp a
little stronger and the night a little harder.

## Implemented: vertical slice part 1

Part 1 of the slice (ticket #23) delivers the non-combat core: tunable
config, the day clock, the noise subsystem, looting into an inventory and
depositing into a hub stockpile. Everything is C++ and runtime-spawned. See
[ADR 0009](adr/0009-vertical-slice-placeholder-systems.md) for the decisions.
The primitives it started with have since been replaced by CC0 stand-in
models, a ground texture, a sky and an animated Seminole man
([ADR 0011](adr/0011-cc0-stand-in-art.md)).

| System | Class | Folder |
| --- | --- | --- |
| Config | `UBloodRitualSettings` (`UDeveloperSettings`, Project Settings > Game > Blood Ritual) | module root |
| Day clock | `UBloodRitualDayClockComponent` on `ABloodRitualGameState` | `Survival/` |
| Lighting | `UBloodRitualDayLightingComponent` on `ABloodRitualTestEnvironment` | `World/` |
| Noise | `UBloodRitualNoiseSubsystem`, `IBloodRitualNoiseListener`, `ABloodRitualNoiseListenerPlaceholder` | `World/` |
| Supplies and inventory | `EBloodRitualSupplyType`, `FBloodRitualSupplyCounts`, `UBloodRitualInventoryComponent` | `Inventory/` |
| Containers | `ABloodRitualSupplyContainer` | `Inventory/` |
| Interaction | `IBloodRitualInteractable`, `UBloodRitualInteractionComponent` | `Interaction/` |
| Stockpile | `ABloodRitualStockpile` | `Community/` |
| HUD | `ABloodRitualHUD` (Canvas, no widgets) | `UI/` |
| Tests | `IMPLEMENT_SIMPLE_AUTOMATION_TEST` under `BloodRitual.*` | `Tests/` |

How the pieces connect:

* **Config.** Every tunable (day 480 s, dusk 60 s, bow 500 uu and rifle
  3000 uu noise radii, 2 s container search, per-container supply amounts,
  lighting values, interaction range) is a `Config` property of
  `UBloodRitualSettings` with its default in C++. Gameplay code reads
  `GetDefault<UBloodRitualSettings>()`; nothing hard-codes a value. Edits in
  Project Settings land in `Config/DefaultGame.ini`.
* **Clock.** `ABloodRitualGameState` owns the clock so the phase is host-owned
  state ready for replication. The clock starts in Day on `BeginPlay`, runs
  Day -> Dusk -> Night and stops at Night. `OnPhaseChanged` (dynamic
  multicast) fires on every transition and on `ResetToDay()`;
  `GetPhaseTimeRemaining()` and `GetPhaseProgress()` are queryable. All time
  keeping goes through `Advance(DeltaSeconds)`, which `TickComponent` feeds
  and tests call directly. **Part 3** binds `OnPhaseChanged` for Night and
  calls `ResetToDay()` after a survived night.
* **Lighting.** The lighting component finds the first directional light and
  sky light in the world and interpolates intensity and sun colour: Day
  values -> Dusk values across Day, Dusk values -> Night values across Dusk,
  Night values held at Night.
* **Noise.** `EmitNoise(Location, Radius, Instigator)` delivers an
  `FBloodRitualNoiseEvent` to every registered `IBloodRitualNoiseListener` whose
  `GetNoiseListenerLocation()` is within `Radius`. The placeholder listener
  (a red sphere at the scavenging area) flashes yellow and logs when it hears
  something. **Part 2**'s infected implement the interface and register in
  `BeginPlay`; weapons read `BowNoiseRadius` / `RifleNoiseRadius` from the
  settings and call `EmitNoise`.
* **Supplies.** `EBloodRitualSupplyType { Food, Ammo, Materials }` with integer
  counts in `FBloodRitualSupplyCounts` (one field per type so it can be marked
  `Replicated` later). `UBloodRitualInventoryComponent` on the player pawn has
  add, remove (fails without change if insufficient), query and `TakeAll`.
* **Interaction.** `IBloodRitualInteractable` (`CanInteract`, `Interact`,
  `GetInteractionPrompt`) is implemented by the container and the stockpile.
  `UBloodRitualInteractionComponent` on the pawn picks the nearest interactable
  within `InteractionRange` each tick (the HUD shows its prompt) and the
  legacy `Interact` action (`E`, `Config/DefaultInput.ini`) uses it. **Part 2**
  adds the canoe, **part 3** barricades, as further implementers.
* **Containers.** `ABloodRitualSupplyContainer::BeginSearch` starts a timed
  search (emits noise with `ContainerSearchNoiseRadius`), `AdvanceSearch`
  moves it forward (fed by `Tick`), completion grants the configured
  supplies to the searcher's inventory, turns the crate grey and locks it:
  a second search is refused. `UBloodRitualSettings::ScavengingContainers`
  lists one loot table per spawned container.
* **Stockpile.** `ABloodRitualStockpile` holds the camp totals. `DepositAll`
  moves a whole inventory in, `TrySpend(Type, Amount)` returns `false`
  without change when short. **Part 3** spends from it.
* **Placeholders.** `ABloodRitualTestEnvironment::EnsureSlicePlaceholders()`
  (called by the game mode after the scene basics) spawns, when the world
  has none: the stockpile at the hub (4 m in front of the PlayerStart), the
  configured containers in a row at the scavenging area 30 m along +X, and
  the noise listener 6 m beyond them.
* **HUD.** `ABloodRitualHUD::DrawHUD` draws the phase and remaining time, a
  centred dusk warning (and night notice), carried supplies, stockpile
  totals, the interaction prompt and a search progress bar.

Solo only: nothing is replicated yet, but the phase lives on the game state
and the totals on an authority-spawned actor, so adding `Replicated` later
does not move state. Known simplifications: a search keeps running if the
player walks away; the interaction scan iterates all actors (fine for a
handful of placeholders).

## Deferred / Out of scope

Deferred (possible later, not planned now):

* MassEntity for large infected populations.
* Gameplay Ability System.
* Perforce.
* Linux and macOS builds; gamepad polish beyond CommonUI defaults.

Out of scope for this project:

* Dedicated servers, MMO-style worlds, backend orchestration.
* Browser-first or mobile builds, console ports.
* Final art direction or content.
* Any gameplay system beyond part 1 of the vertical slice: AI, health,
  weapons, canoe, night defense, persistence and networking are documented
  here and implemented in later tickets.
