# Inventory

Items, containers, equipment slots and the data assets that describe them.

Implemented (vertical slice part 1): the supply types (`EBloodRitualSupplyType`, `FBloodRitualSupplyAmount`, `FBloodRitualSupplyCounts` in `BloodRitualSupplyTypes.h`), `UBloodRitualInventoryComponent` (per-type counts on the player pawn) and `ABloodRitualSupplyContainer` (a timed, one-shot lootable crate). Items, slots and data assets are later.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
