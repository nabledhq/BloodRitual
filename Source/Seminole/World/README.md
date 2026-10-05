# World

World Partition and PCG integration: the swamp map, biome rules, loot and spawn placement, and the shared noise event subsystem.

Implemented (ticket #23):

* `USeminoleNoiseSubsystem`: `EmitNoise(Location, Radius, Instigator)` delivers to registered `ISeminoleNoiseListener`s within the radius and broadcasts `OnNoiseEmitted`.
* `ISeminoleNoiseListener`: the interface part 2's infected implement.
* `ASeminoleNoiseListenerPlaceholder`: a sphere that turns red when it hears something.

The map, World Partition and PCG are later tickets.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md), [ADR 0004](../../../docs/adr/0004-noise-event-system.md) and [ADR 0009](../../../docs/adr/0009-vertical-slice-core-systems.md).
