// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Inventory/BloodRitualSupplyTypes.h"

FString BloodRitualSupplyTypeToString(EBloodRitualSupplyType Type)
{
	switch (Type)
	{
	case EBloodRitualSupplyType::Food:
		return TEXT("Food");
	case EBloodRitualSupplyType::Ammo:
		return TEXT("Ammo");
	case EBloodRitualSupplyType::Materials:
		return TEXT("Materials");
	default:
		return TEXT("Unknown");
	}
}

int32 FBloodRitualSupplyCounts::Get(EBloodRitualSupplyType Type) const
{
	switch (Type)
	{
	case EBloodRitualSupplyType::Food:
		return Food;
	case EBloodRitualSupplyType::Ammo:
		return Ammo;
	case EBloodRitualSupplyType::Materials:
		return Materials;
	default:
		return 0;
	}
}

void FBloodRitualSupplyCounts::Add(EBloodRitualSupplyType Type, int32 Delta)
{
	switch (Type)
	{
	case EBloodRitualSupplyType::Food:
		Food = FMath::Max(0, Food + Delta);
		break;
	case EBloodRitualSupplyType::Ammo:
		Ammo = FMath::Max(0, Ammo + Delta);
		break;
	case EBloodRitualSupplyType::Materials:
		Materials = FMath::Max(0, Materials + Delta);
		break;
	default:
		break;
	}
}

void FBloodRitualSupplyCounts::Add(const TArray<FBloodRitualSupplyAmount>& Amounts)
{
	for (const FBloodRitualSupplyAmount& Amount : Amounts)
	{
		Add(Amount.Type, Amount.Amount);
	}
}

void FBloodRitualSupplyCounts::Add(const FBloodRitualSupplyCounts& Other)
{
	Add(EBloodRitualSupplyType::Food, Other.Food);
	Add(EBloodRitualSupplyType::Ammo, Other.Ammo);
	Add(EBloodRitualSupplyType::Materials, Other.Materials);
}

int32 FBloodRitualSupplyCounts::Total() const
{
	return Food + Ammo + Materials;
}

bool FBloodRitualSupplyCounts::IsEmpty() const
{
	return Total() == 0;
}

void FBloodRitualSupplyCounts::Reset()
{
	Food = 0;
	Ammo = 0;
	Materials = 0;
}

FString FBloodRitualSupplyCounts::ToString() const
{
	return FString::Printf(TEXT("Food %d  Ammo %d  Materials %d"), Food, Ammo, Materials);
}
