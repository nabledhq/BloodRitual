# World

World Partition and PCG integration: the swamp map, biome rules, loot and spawn placement, and the shared noise event subsystem.

Implemented (vertical slice part 1):

* `USeminoleNoiseSubsystem` with `EmitNoise(Location, Radius, Instigator)` and the `ISeminoleNoiseListener` interface (`SeminoleNoiseListener.h`). Every noisy action calls `EmitNoise`; anything that hears implements the interface and registers in `BeginPlay`.
* `ASeminoleNoiseListenerPlaceholder`, a sphere that counts and flashes on noise, standing in for the infected.
* `USeminoleDayLightingComponent`, which drives the directional and sky light from the day clock.

Map, World Partition and PCG work is not here yet.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
