# World

World Partition and PCG integration: the swamp map, biome rules, loot and spawn placement, and the shared noise event subsystem.

Implemented (vertical slice part 1):

* `UBloodRitualNoiseSubsystem` with `EmitNoise(Location, Radius, Instigator)` and the `IBloodRitualNoiseListener` interface (`BloodRitualNoiseListener.h`). Every noisy action calls `EmitNoise`; anything that hears implements the interface and registers in `BeginPlay`.
* `ABloodRitualNoiseListenerPlaceholder`, a sphere that counts and flashes on noise, standing in for the infected.
* `UBloodRitualDayLightingComponent`, which drives the directional and sky light from the day clock.

Map, World Partition and PCG work is not here yet.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
