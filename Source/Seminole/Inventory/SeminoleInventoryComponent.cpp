// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Inventory/SeminoleInventoryComponent.h"

USeminoleInventoryComponent::USeminoleInventoryComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void USeminoleInventoryComponent::AddSupply(ESeminoleSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return;
	}
	Supplies.Add(Type, Amount);
	OnInventoryChanged.Broadcast();
}

void USeminoleInventoryComponent::AddSupplies(const TArray<FSeminoleSupplyAmount>& Amounts)
{
	bool bChanged = false;
	for (const FSeminoleSupplyAmount& Amount : Amounts)
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

bool USeminoleInventoryComponent::RemoveSupply(ESeminoleSupplyType Type, int32 Amount)
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

FSeminoleSupplyCounts USeminoleInventoryComponent::TakeAll()
{
	const FSeminoleSupplyCounts Taken = Supplies;
	if (!Taken.IsEmpty())
	{
		Supplies.Reset();
		OnInventoryChanged.Broadcast();
	}
	return Taken;
}
