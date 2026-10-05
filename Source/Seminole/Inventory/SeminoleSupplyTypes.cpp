// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Inventory/SeminoleSupplyTypes.h"

int32 FSeminoleSupplyBundle::Get(ESeminoleSupplyType Type) const
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

int32& FSeminoleSupplyBundle::GetRef(ESeminoleSupplyType Type)
{
	switch (Type)
	{
	case ESeminoleSupplyType::Ammo:
		return Ammo;
	case ESeminoleSupplyType::Materials:
		return Materials;
	case ESeminoleSupplyType::Food:
	default:
		return Food;
	}
}

void FSeminoleSupplyBundle::Add(const FSeminoleSupplyBundle& Other)
{
	Food += Other.Food;
	Ammo += Other.Ammo;
	Materials += Other.Materials;
}

bool FSeminoleSupplyBundle::IsEmpty() const
{
	return Food == 0 && Ammo == 0 && Materials == 0;
}

int32 FSeminoleSupplyBundle::Total() const
{
	return Food + Ammo + Materials;
}

FString FSeminoleSupplyBundle::ToString() const
{
	return FString::Printf(TEXT("Food %d  Ammo %d  Materials %d"), Food, Ammo, Materials);
}

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
