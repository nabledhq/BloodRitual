# Asset licences

Every texture, environment map, model and animation in *Indigenous: Blood Ritual* is listed here with its
source and licence. Third-party assets must be CC0 (or similarly
unrestricted), no larger than 2048×2048 per texture, and the total size of
added binary assets must stay under 50 MB.

## Third-party assets

All of these are **CC0 1.0** (public domain dedication,
<https://creativecommons.org/publicdomain/zero/1.0/>). They are stand-in art for
the vertical slice, not final art. Props and ground are downloaded and imported
by `scripts/editor/import_cc0_assets.py` (1k, 1024×1024 textures); the player is
built by `scripts/blender/build_protagonist.py` and imported by
`scripts/editor/import_protagonist.py`. The infected (`scripts/blender/build_infected.py`) and the weapons
(`scripts/blender/build_weapons.py`, `scripts/editor/import_weapons.py`) are built the same way.
All content totals 48.6 MB.

| Asset | Used as | Source | Content folder | Size |
| ----- | ------- | ------ | -------------- | ---- |
| Wooden Crate 01 | Searchable container; on top of the stockpile | [Poly Haven](https://polyhaven.com/a/wooden_crate_01) | `Items/Containers/wooden_crate_01` | 2.2 MB |
| Wine Barrel 01 | Searchable container; beside the stockpile | [Poly Haven](https://polyhaven.com/a/wine_barrel_01) | `Items/Containers/wine_barrel_01` | 1.0 MB |
| Wicker Basket 02 | Searchable container | [Poly Haven](https://polyhaven.com/a/wicker_basket_02) | `Items/Containers/wicker_basket_02` | 3.0 MB |
| Wooden Crate 02 | Stockpile | [Poly Haven](https://polyhaven.com/a/wooden_crate_02) | `Items/Containers/wooden_crate_02` | 2.2 MB |
| Stone Fire Pit | Camp scenery | [Poly Haven](https://polyhaven.com/a/stone_fire_pit) | `Environments/Camp/stone_fire_pit` | 2.6 MB |
| Tree Stump 01 | Camp scenery | [Poly Haven](https://polyhaven.com/a/tree_stump_01) | `Environments/Camp/tree_stump_01` | 5.0 MB |
| Dead Tree Trunk 02 | Camp scenery | [Poly Haven](https://polyhaven.com/a/dead_tree_trunk_02) | `Environments/Camp/dead_tree_trunk_02` | 5.6 MB |
| Rock Moss Set 01 | Camp scenery (six rocks) | [Poly Haven](https://polyhaven.com/a/rock_moss_set_01) | `Environments/Camp/rock_moss_set_01` | 2.8 MB |
| Fern 02 | Camp scenery (four variants) | [Poly Haven](https://polyhaven.com/a/fern_02) | `Environments/Camp/fern_02` | 1.4 MB |
| Shrub 02 | Camp scenery (four variants) | [Poly Haven](https://polyhaven.com/a/shrub_02) | `Environments/Camp/shrub_02` | 2.1 MB |
| Brown Mud Leaves 01 (texture) | Ground | [Poly Haven](https://polyhaven.com/a/brown_mud_leaves_01) | `Environments/Ground/brown_mud_leaves_01` | 3.5 MB |
| Universal Animation Library (Standard): the Idle, Walk, Jog, Sprint, Crouch (idle, forward), Jump (start, loop, land), Roll, Interact, PickUp_Table, Sword (idle, attack), Pistol (idle, aim, shoot, reload), Punch_Cross, Hit_Chest and Death01 clips, retargeted onto the player and shared by the infected (the mannequin itself is not kept) | Player animation | Quaternius, [quaternius.com](https://quaternius.com/packs/universalanimationlibrary.html); downloaded from the author's [OpenGameArt upload](https://opengameart.org/content/universal-animation-library) (its `License.txt` states CC0 1.0) | `Characters/Protagonist/Animations` | 4.3 MB |
| MakeHuman / MPFB: base mesh and targets, `game_engine` rig and weights, brown eye texture, `eyebrow001`, `eyelashes01`, `long01` hair (texture darkened, halved to 1024 px) | Player body | [MakeHuman community](https://static.makehumancommunity.org/about/license.html), "MakeHuman system assets" pack (CC0) and the [MPFB extension](https://extensions.blender.org/add-ons/mpfb/) | `Characters/Protagonist` | 11.8 MB with the rows below and the outfit |
| MakeHuman / MPFB: the `male1591` proxy body and `low-poly` eyes (the infected reuse the player's skin and eye textures, tinted) | Infected body | [MakeHuman community](https://static.makehumancommunity.org/about/license.html), "MakeHuman system assets" pack (CC0) | `Characters/Infected` | 0.69 MB with the rags |
| MakeHuman `middleage_asian_male` skin texture (tinted) | Player skin | [MakeHuman community](https://static.makehumancommunity.org/about/license.html), "skins02" pack (CC0) | `Characters/Protagonist` | (above) |
| `rehmanpolanski_beard_viking` and `rehmanpolanski_moustache_viking` (textures darkened and greyed, 512 px) | Player beard | Rehman Polanski, [MakeHuman community](http://www.makehumancommunity.org/), "bodyparts05" pack (CC0 in the pack index and in each file's header) | `Characters/Protagonist` | (above) |

## Project assets (this repository, MIT)

- `Environments/Materials/M_PropMaster` and `M_FoliageMaster`: master materials
  for the models above, built by the import script.
- `Environments/Ground/.../M_Ground_BrownMudLeaves`: the world-aligned ground
  material.
- The player's outfit: leggings, boots, bracers, hip flaps, headband, earrings,
  choker, bead necklaces, medallions, arm bands, belt, aprons, braids, feathers and
  the fur cape, and their procedurally painted textures, generated by
  `scripts/blender/protagonist_outfit.py` (run by `build_protagonist.py`) after the
  project's own concept renders in `renders/`.
- `Characters/Materials/M_CharacterOpaque`, `M_CharacterCloth`, `M_CharacterMasked`
  and the `Characters/Protagonist` material instances.
- `Characters/Protagonist/Animations/BS_Locomotion`, `BS_Locomotion_Melee`,
  `BS_Locomotion_Ranged` and `BS_Crouch`: blend spaces over the retargeted Quaternius clips.
- `Characters/Protagonist/ABP_Protagonist`: the Protagonist's Animation Blueprint, generated
  by `scripts/editor/build_anim_blueprint.py` (0.38 MB).
- The infected's rags (torn shirt and trousers) and their painted texture, generated by
  `scripts/blender/build_infected.py`; `Characters/Infected` material instances.
- `Weapons/`: the tomahawk, rock sledgehammer, bow, lever-action rifle and arrow meshes,
  the `T_Weapons` texture atlas and `M_WeaponMaster` / `MI_Weapons`, generated by
  `scripts/blender/build_weapons.py` and `scripts/editor/import_weapons.py` (0.17 MB).
