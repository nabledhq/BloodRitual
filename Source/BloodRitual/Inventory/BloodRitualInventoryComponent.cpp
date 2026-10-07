// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Inventory/BloodRitualInventoryComponent.h"

UBloodRitualInventoryComponent::UBloodRitualInventoryComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UBloodRitualInventoryComponent::AddSupply(EBloodRitualSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return;
	}
	Supplies.Add(Type, Amount);
	OnInventoryChanged.Broadcast();
}

void UBloodRitualInventoryComponent::AddSupplies(const TArray<FBloodRitualSupplyAmount>& Amounts)
{
	bool bChanged = false;
	for (const FBloodRitualSupplyAmount& Amount : Amounts)
	{
		if (Amount.Amount > 0)
		{
			Supplies.Add(Amount.Type, Amount.Amount);
			bChanged = true;
		}
	}
	if (bChanged)
	{
		OnInventoryChanged.Broadcast();
	}
}

bool UBloodRitualInventoryComponent::RemoveSupply(EBloodRitualSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return true;
	}
	if (Supplies.Get(Type) < Amount)
	{
		return false;
	}
	Supplies.Add(Type, -Amount);
	OnInventoryChanged.Broadcast();
	return true;
}

FBloodRitualSupplyCounts UBloodRitualInventoryComponent::TakeAll()
{
	const FBloodRitualSupplyCounts Taken = Supplies;
	if (!Taken.IsEmpty())
	{
		Supplies.Reset();
		OnInventoryChanged.Broadcast();
	}
	return Taken;
}
