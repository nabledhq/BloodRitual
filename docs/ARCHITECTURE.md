# Seminole architecture

Seminole is a 1–4 player co-op survival game set in the Florida Everglades
around 1900. Players are members of a Seminole camp: by day they travel the
swamp by canoe and scavenge; by night they defend the camp against the
infected. This document records the technical foundation every later
community-funded feature builds on. Each major choice has an architecture
decision record in [`adr/`](adr/README.md).

This document describes intent. Nothing below is implemented yet; the ticket
that implements a system owns the details and updates this file.

## Engine and programming model

* Unreal Engine **5.8**, desktop first (Windows, then Linux and macOS as
  effort allows), distributed on Steam. See [ADR 0001](adr/0001-unreal-engine-5.md).
* One game module, `Seminole`, under `Source/Seminole/`, with one subfolder
  per system (AI, Characters, Combat, Community, Inventory, Interaction,
  Multiplayer, Persistence, Survival, Vehicles, World). Each subfolder's
  `README.md` states its purpose.
* C++ for core systems: base classes, components, subsystems, replication,
  save/load and anything performance-sensitive. Blueprint and data assets for
  content: concrete characters, items, weapons, missions and tuning. Blueprint
  classes derive from C++ bases and are not expected to contain system logic.
  See [ADR 0002](adr/0002-cpp-blueprint-hybrid.md).
* Enhanced Input for all player input; Input Actions and Mapping Contexts are
  data assets under `Content/`.
* No Gameplay Ability System by default. Health, stamina, damage and status
  effects are plain components and data assets until a concrete need appears.
  See [ADR 0007](adr/0007-no-gameplay-ability-system-by-default.md).

### Intended plugins

The project enables **no** plugins today (`Seminole.uproject` has an empty
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

StateTree tasks, conditions and evaluators are C++ in `Source/Seminole/AI/`;
the trees themselves and per-type tuning are assets under `Content/AI/`.
AI runs on the host only (see Multiplayer); clients receive replicated
movement and animation.

## Noise event system

Noise is **one shared gameplay event**, not a per-system mechanic. See
[ADR 0004](adr/0004-noise-event-system.md).

* A world subsystem (`Source/Seminole/World/`) exposes
  `ReportNoise(Location, Loudness, Instigator, Tag)`.
* Everything that makes noise calls it: footsteps, gunshots, melee impacts,
  canoe paddling, doors, dropped items, campfire work.
* The subsystem forwards each event to AI Perception's hearing sense and
  broadcasts a delegate so other systems (audio cues, UI, missions) can react
  to the same event.
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
* World code lives in `Source/Seminole/World/`; maps and PCG graphs under
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
* Code in `Source/Seminole/Multiplayer/`. No dedicated servers.

## Persistence

* A **host-owned save game**: the host's machine stores the camp, world state,
  mission progress and every participating player's character. See
  [ADR 0006](adr/0006-host-owned-save-game.md).
* Saving happens at phase boundaries (end of day, end of night) and on
  graceful exit, using `USaveGame` subclasses serialised with the engine's
  save system.
* Clients joining a saved session receive state through normal replication;
  their own character is restored from the host's save when they reconnect.
* Code in `Source/Seminole/Persistence/`.

## Gameplay components

Systems are `UActorComponent`s on C++ base actors, configured by data assets.
Planned components and their folders:

| Folder | Components |
| --- | --- |
| `Characters/` | Player and villager base characters, Enhanced Input, animation hooks |
| `Survival/` | Health, stamina, hunger, day/night phase |
| `Combat/` | Weapons, melee and ranged attacks, damage |
| `Inventory/` | Items, containers, equipment |
| `Interaction/` | Interactable actors and the interaction component |
| `Vehicles/` | Canoe: a paddled pawn carrying passengers |
| `Community/` | Villagers, roles, camp upgrades |

Every component that can make noise reports it through the noise subsystem.

## UI

* **UMG** widgets built on **CommonUI** for consistent input handling across
  keyboard/mouse and gamepad, and for a single activatable-widget stack.
* HUD (health, stamina, time of day, noise indicator), inventory, pause and
  session menus. Widget assets under `Content/UI/`.

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
* The period setting (Seminole camp life around 1900) should be reviewed by
  cultural advisors before final art is accepted.

## Source control

* **Git with Git LFS**. `.gitattributes` routes `.uasset`, `.umap`, `.fbx`,
  `.wav`, `.png`, `.tga`, `.psd`, `.blend`, `.spp`, `.sbs` and `.sbsar`
  through LFS. See [ADR 0008](adr/0008-git-lfs-before-perforce.md).
* Binary assets cannot be merged. Until file locking is needed, coordinate
  through tickets: one open ticket owns a given map or asset at a time. Keep
  maps small and split content with World Partition data layers and One File
  Per Actor to reduce conflicts.
* `.gitignore` excludes `Binaries/`, `Intermediate/`, `Saved/`,
  `DerivedDataCache/` and IDE files. `Content/` and `Config/` are tracked.
* Perforce is a possible later move if LFS becomes a bottleneck; nothing in
  the layout prevents it.

## Browser strategy

* The repository also contains a **Babylon.js browser prototype** (`src/`,
  `index.html`, `package.json`, deployed to GitHub Pages by
  `.github/workflows/nabled-play.yml`). It exists so backers can try builds
  in a browser and it predates this document.
* The shipping game is the Unreal Engine 5.8 project. The browser prototype
  is a preview and design sandbox, not a second target: gameplay systems
  are built once, in Unreal.
* The prototype stays in the repository and keeps working; it is not deleted
  by the UE scaffold, and the two trees do not share code. Its future
  (keep as showcase, or retire once the UE build has playable releases) is
  a later decision.
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

## Deferred / Out of scope

Deferred (possible later, not planned now):

* MassEntity for large infected populations.
* Gameplay Ability System.
* Perforce.
* Linux and macOS builds; gamepad polish beyond CommonUI defaults.
* Retiring or re-scoping the browser prototype.

Out of scope for this project:

* Dedicated servers, MMO-style worlds, backend orchestration.
* Browser-first or mobile builds, console ports.
* Final art direction or content.
* Any gameplay system in this ticket: AI, noise, health, inventory, weapons,
  canoe, persistence, networking are documented here and implemented later.
