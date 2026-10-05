# Community

The player camp as a community: villagers, their roles and needs, and camp upgrades between day and night phases.

Implemented (ticket #23):

* `ASeminoleStockpile`: the hub actor players deposit into. Totals live in `ASeminoleGameState` (module root), which also offers `TrySpend()` for part 3.

Villagers, roles and upgrades are later tickets.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) and [ADR 0009](../../../docs/adr/0009-vertical-slice-core-systems.md).
