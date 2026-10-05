// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Inventory/SeminoleInventoryComponent.h"

USeminoleInventoryComponent::USeminoleInventoryComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void USeminoleInventoryComponent::AddSupplies(ESeminoleSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return;
	}
	Supplies.GetRef(Type) += Amount;
	OnInventoryChanged.Broadcast(Supplies);
}

void USeminoleInventoryComponent::AddBundle(const FSeminoleSupplyBundle& Bundle)
{
	if (Bundle.IsEmpty())
	{
		return;
	}
	Supplies.Add(Bundle);
	OnInventoryChanged.Broadcast(Supplies);
}

bool USeminoleInventoryComponent::RemoveSupplies(ESeminoleSupplyType Type, int32 Amount)
{
	if (Amount < 0)
	{
		return false;
	}
	int32& Count = Supplies.GetRef(Type);
	if (Count < Amount)
	{
		return false;
	}
	Count -= Amount;
	OnInventoryChanged.Broadcast(Supplies);
	return true;
}

FSeminoleSupplyBundle USeminoleInventoryComponent::TakeAll()
{
	const FSeminoleSupplyBundle Taken = Supplies;
	Supplies = FSeminoleSupplyBundle();
	OnInventoryChanged.Broadcast(Supplies);
	return Taken;
}
