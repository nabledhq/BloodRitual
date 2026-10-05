// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "SeminoleSupplyTypes.generated.h"

/** The three supply types of the vertical slice. Stored as integer counts everywhere. */
UENUM(BlueprintType)
enum class ESeminoleSupplyType : uint8
{
	Food,
	Ammo,
	Materials
};

/**
 * A set of supply counts, one per ESeminoleSupplyType.
 *
 * Used for what a container holds, what the player carries and what the hub stockpile has.
 * Plain fields (rather than a map) so the values are editable in Project Settings and
 * trivially serialisable; Get/GetRef map an enum value onto its field.
 */
USTRUCT(BlueprintType)
struct SEMINOLE_API FSeminoleSupplyBundle
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Food = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Ammo = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Seminole", meta = (ClampMin = "0"))
	int32 Materials = 0;

	FSeminoleSupplyBundle() = default;
	FSeminoleSupplyBundle(int32 InFood, int32 InAmmo, int32 InMaterials)
		: Food(InFood), Ammo(InAmmo), Materials(InMaterials)
	{
	}

	int32 Get(ESeminoleSupplyType Type) const;
	int32& GetRef(ESeminoleSupplyType Type);

	/** Adds every count of Other to this bundle. */
	void Add(const FSeminoleSupplyBundle& Other);

	/** True when every count is zero. */
	bool IsEmpty() const;

	/** Sum of all counts. */
	int32 Total() const;

	/** "Food 3  Ammo 0  Materials 1", for logs and the placeholder HUD. */
	FString ToString() const;
};

/** Display name of a supply type ("Food", "Ammo", "Materials"). */
SEMINOLE_API FString SeminoleSupplyTypeToString(ESeminoleSupplyType Type);
