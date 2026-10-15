# Combat

Weapons, melee and ranged attacks, damage application and hit reactions. Attacks emit noise events.

Implemented (ADR 0012): `UBloodRitualWeaponComponent` on the player (tomahawk, rock sledgehammer, bow and rifle; melee arcs, rifle hitscan with a magazine reloaded from carried Ammo, bow arrows that cost Ammo, headshots, noise), `ABloodRitualArrow` (the arrow in flight), and `EBloodRitualWeapon` / `BloodRitualWeapons` helpers. Damage goes through the engine's damage pipeline to `UBloodRitualHealthComponent` (`Survival/`). Tuning lives in `UBloodRitualSettings`.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
