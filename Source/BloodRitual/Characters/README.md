# Characters

Player and NPC characters: the base character class, Enhanced Input bindings, movement and animation hooks.

`UBloodRitualProtagonistAnimInstance` is the parent of the Protagonist's Animation Blueprint,
`ABP_Protagonist`, which `scripts/editor/build_anim_blueprint.py` generates
([ADR 0013](../../../docs/adr/0013-animation-blueprint.md)). The player pawn itself,
`ABloodRitualProtagonistCharacter` in the module root (legacy input), is still bootstrap scaffolding;
the real character class with Enhanced Input lands here when its ticket is funded.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
