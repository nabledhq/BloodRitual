# Inventory

Items, containers, equipment slots and the data assets that describe them.

Implemented (ticket #23):

* `ESeminoleSupplyType` / `FSeminoleSupplyBundle`: Food, Ammo and Materials as integer counts.
* `USeminoleInventoryComponent`: what a pawn carries, with add, remove, query and `TakeAll()`.
* `ASeminoleSupplyContainer`: a searchable crate that grants its configured supplies once.

Items, equipment slots and data assets are later tickets.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) and [ADR 0009](../../../docs/adr/0009-vertical-slice-core-systems.md).
