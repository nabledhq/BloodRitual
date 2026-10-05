// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleSettings.h"

USeminoleSettings::USeminoleSettings()
{
	// Three containers at the scavenging area; together they cover every supply type.
	ContainerSupplies.Add(FSeminoleSupplyBundle(3, 0, 1));
	ContainerSupplies.Add(FSeminoleSupplyBundle(0, 6, 2));
	ContainerSupplies.Add(FSeminoleSupplyBundle(2, 2, 4));
}

FName USeminoleSettings::GetCategoryName() const
{
	return FName(TEXT("Game"));
}
