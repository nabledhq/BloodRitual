// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "BloodRitualSupplyTypes.generated.h"

/** The three supply types of the vertical slice. Counts are plain integers. */
UENUM(BlueprintType)
enum class EBloodRitualSupplyType : uint8
{
	Food,
	Ammo,
	Materials
};

/** Returns "Food", "Ammo" or "Materials"; used by logs and the Canvas HUD. */
BLOODRITUAL_API FString BloodRitualSupplyTypeToString(EBloodRitualSupplyType Type);

/** One supply type with an amount: the unit a container grants. */
USTRUCT(BlueprintType)
struct BLOODRITUAL_API FBloodRitualSupplyAmount
{
	GENERATED_BODY()

	FBloodRitualSupplyAmount() = default;
	FBloodRitualSupplyAmount(EBloodRitualSupplyType InType, int32 InAmount)
		: Type(InType)
		, Amount(InAmount)
	{
	}

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "BloodRitual")
	EBloodRitualSupplyType Type = EBloodRitualSupplyType::Food;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "BloodRitual", meta = (ClampMin = "0"))
	int32 Amount = 0;
};

/**
 * A count per supply type. One explicit field per type (rather than a TMap) so the struct
 * can be marked Replicated unchanged when the networking ticket lands.
 */
USTRUCT(BlueprintType)
struct BLOODRITUAL_API FBloodRitualSupplyCounts
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "BloodRitual", meta = (ClampMin = "0"))
	int32 Food = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "BloodRitual", meta = (ClampMin = "0"))
	int32 Ammo = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "BloodRitual", meta = (ClampMin = "0"))
	int32 Materials = 0;

	int32 Get(EBloodRitualSupplyType Type) const;

	/** Adds Delta (which may be negative) to one type and clamps the result at zero. */
	void Add(EBloodRitualSupplyType Type, int32 Delta);

	/** Adds every entry of Amounts. */
	void Add(const TArray<FBloodRitualSupplyAmount>& Amounts);

	/** Adds every count of Other. */
	void Add(const FBloodRitualSupplyCounts& Other);

	int32 Total() const;
	bool IsEmpty() const;
	void Reset();

	/** "Food 3  Ammo 10  Materials 5" */
	FString ToString() const;
};
