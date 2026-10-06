// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleSettings.h"

USeminoleSettings::USeminoleSettings()
{
	// Three containers by default: one per supply type, so each type can be seen flowing
	// from a container through the inventory into the stockpile.
	FSeminoleContainerLoot FoodCache;
	FoodCache.Supplies.Add(FSeminoleSupplyAmount(ESeminoleSupplyType::Food, 3));

	FSeminoleContainerLoot AmmoCache;
	AmmoCache.Supplies.Add(FSeminoleSupplyAmount(ESeminoleSupplyType::Ammo, 10));

	FSeminoleContainerLoot MaterialsCache;
	MaterialsCache.Supplies.Add(FSeminoleSupplyAmount(ESeminoleSupplyType::Materials, 5));
	MaterialsCache.Supplies.Add(FSeminoleSupplyAmount(ESeminoleSupplyType::Food, 1));

	ScavengingContainers.Add(FoodCache);
	ScavengingContainers.Add(AmmoCache);
	ScavengingContainers.Add(MaterialsCache);
}

FName USeminoleSettings::GetCategoryName() const
{
	return FName(TEXT("Game"));
}
