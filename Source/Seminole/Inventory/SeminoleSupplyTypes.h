// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "SeminoleSupplyTypes.generated.h"

/** The three supply types of the vertical slice. Counts are plain integers. */
UENUM(BlueprintType)
enum class ESeminoleSupplyType : uint8
{
	Food,
	Ammo,
	Materials
};

/** Returns "Food", "Ammo" or "Materials"; used by logs and the Canvas HUD. */
SEMINOLE_API FString SeminoleSupplyTypeToString(ESeminoleSupplyType Type);

/** One supply type with an amount: the unit a container grants. */
USTRUCT(BlueprintType)
struct SEMINOLE_API FSeminoleSupplyAmount
{
	GENERATED_BODY()

	FSeminoleSupplyAmount() = default;
	FSeminoleSupplyAmount(ESeminoleSupplyType InType, int32 InAmount)
		: Type(InType)
		, Amount(InAmount)
	{
	}

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole")
	ESeminoleSupplyType Type = ESeminoleSupplyType::Food;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Amount = 0;
};

/**
 * A count per supply type. One explicit field per type (rather than a TMap) so the struct
 * can be marked Replicated unchanged when the networking ticket lands.
 */
USTRUCT(BlueprintType)
struct SEMINOLE_API FSeminoleSupplyCounts
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Food = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Ammo = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Materials = 0;

	int32 Get(ESeminoleSupplyType Type) const;

	/** Adds Delta (which may be negative) to one type and clamps the result at zero. */
	void Add(ESeminoleSupplyType Type, int32 Delta);

	/** Adds every entry of Amounts. */
	void Add(const TArray<FSeminoleSupplyAmount>& Amounts);

	/** Adds every count of Other. */
	void Add(const FSeminoleSupplyCounts& Other);

	int32 Total() const;
	bool IsEmpty() const;
	void Reset();

	/** "Food 3  Ammo 10  Materials 5" */
	FString ToString() const;
};
