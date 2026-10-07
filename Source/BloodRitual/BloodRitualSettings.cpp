// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualSettings.h"

UBloodRitualSettings::UBloodRitualSettings()
{
	// Three containers by default: one per supply type, so each type can be seen flowing
	// from a container through the inventory into the stockpile.
	FBloodRitualContainerLoot FoodCache;
	FoodCache.Supplies.Add(FBloodRitualSupplyAmount(EBloodRitualSupplyType::Food, 3));

	FBloodRitualContainerLoot AmmoCache;
	AmmoCache.Supplies.Add(FBloodRitualSupplyAmount(EBloodRitualSupplyType::Ammo, 10));

	FBloodRitualContainerLoot MaterialsCache;
	MaterialsCache.Supplies.Add(FBloodRitualSupplyAmount(EBloodRitualSupplyType::Materials, 5));
	MaterialsCache.Supplies.Add(FBloodRitualSupplyAmount(EBloodRitualSupplyType::Food, 1));

	ScavengingContainers.Add(FoodCache);
	ScavengingContainers.Add(AmmoCache);
	ScavengingContainers.Add(MaterialsCache);
}

FName UBloodRitualSettings::GetCategoryName() const
{
	return FName(TEXT("Game"));
}
