// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Inventory/BloodRitualSupplyTypes.h"
#include "BloodRitualInventoryComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FBloodRitualInventoryChanged);

/**
 * Carried supplies: an integer count per EBloodRitualSupplyType on the player pawn. Containers add
 * to it, the stockpile takes everything out of it. No items, slots or weight; that is the
 * later Inventory ticket.
 */
UCLASS(ClassGroup = (BloodRitual), meta = (BlueprintSpawnableComponent))
class BLOODRITUAL_API UBloodRitualInventoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UBloodRitualInventoryComponent();

	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Inventory")
	void AddSupply(EBloodRitualSupplyType Type, int32 Amount);

	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Inventory")
	void AddSupplies(const TArray<FBloodRitualSupplyAmount>& Amounts);

	/** Removes Amount of Type. Returns false, changing nothing, when fewer are carried. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Inventory")
	bool RemoveSupply(EBloodRitualSupplyType Type, int32 Amount);

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Inventory")
	int32 GetSupplyCount(EBloodRitualSupplyType Type) const { return Supplies.Get(Type); }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Inventory")
	int32 GetTotalSupplyCount() const { return Supplies.Total(); }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Inventory")
	bool IsEmpty() const { return Supplies.IsEmpty(); }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Inventory")
	FBloodRitualSupplyCounts GetSupplies() const { return Supplies; }

	/** Empties the inventory and returns what it held (used by the stockpile deposit). */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Inventory")
	FBloodRitualSupplyCounts TakeAll();

	/** Fired after every change. The HUD reads the counts directly, so no payload. */
	UPROPERTY(BlueprintAssignable, Category = "BloodRitual|Inventory")
	FBloodRitualInventoryChanged OnInventoryChanged;

private:
	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Inventory")
	FBloodRitualSupplyCounts Supplies;
};
