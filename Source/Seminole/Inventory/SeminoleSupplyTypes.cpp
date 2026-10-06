// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Inventory/SeminoleSupplyTypes.h"

FString SeminoleSupplyTypeToString(ESeminoleSupplyType Type)
{
	switch (Type)
	{
	case ESeminoleSupplyType::Food:
		return TEXT("Food");
	case ESeminoleSupplyType::Ammo:
		return TEXT("Ammo");
	case ESeminoleSupplyType::Materials:
		return TEXT("Materials");
	default:
		return TEXT("Unknown");
	}
}

int32 FSeminoleSupplyCounts::Get(ESeminoleSupplyType Type) const
{
	switch (Type)
	{
	case ESeminoleSupplyType::Food:
		return Food;
	case ESeminoleSupplyType::Ammo:
		return Ammo;
	case ESeminoleSupplyType::Materials:
		return Materials;
	default:
		return 0;
	}
}

void FSeminoleSupplyCounts::Add(ESeminoleSupplyType Type, int32 Delta)
{
	switch (Type)
	{
	case ESeminoleSupplyType::Food:
		Food = FMath::Max(0, Food + Delta);
		break;
	case ESeminoleSupplyType::Ammo:
		Ammo = FMath::Max(0, Ammo + Delta);
		break;
	case ESeminoleSupplyType::Materials:
		Materials = FMath::Max(0, Materials + Delta);
		break;
	default:
		break;
	}
}

void FSeminoleSupplyCounts::Add(const TArray<FSeminoleSupplyAmount>& Amounts)
{
	for (const FSeminoleSupplyAmount& Amount : Amounts)
	{
		Add(Amount.Type, Amount.Amount);
	}
}

void FSeminoleSupplyCounts::Add(const FSeminoleSupplyCounts& Other)
{
	Add(ESeminoleSupplyType::Food, Other.Food);
	Add(ESeminoleSupplyType::Ammo, Other.Ammo);
	Add(ESeminoleSupplyType::Materials, Other.Materials);
}

int32 FSeminoleSupplyCounts::Total() const
{
	return Food + Ammo + Materials;
}

bool FSeminoleSupplyCounts::IsEmpty() const
{
	return Total() == 0;
}

void FSeminoleSupplyCounts::Reset()
{
	Food = 0;
	Ammo = 0;
	Materials = 0;
}

FString FSeminoleSupplyCounts::ToString() const
{
	return FString::Printf(TEXT("Food %d  Ammo %d  Materials %d"), Food, Ammo, Materials);
}
