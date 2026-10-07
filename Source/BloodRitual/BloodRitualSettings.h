// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "Inventory/BloodRitualSupplyTypes.h"
#include "BloodRitualSettings.generated.h"

/** What one scavenging container holds. The settings list one of these per container. */
USTRUCT(BlueprintType)
struct BLOODRITUAL_API FBloodRitualContainerLoot
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "BloodRitual")
	TArray<FBloodRitualSupplyAmount> Supplies;
};

/**
 * Every tunable of the vertical slice, in one place: Edit > Project Settings > Game > Blood Ritual.
 *
 * Defaults are the C++ initialisers below; values changed in the editor are written to
 * Config/DefaultGame.ini (section [/Script/BloodRitual.BloodRitualSettings]). Gameplay code reads
 * them through GetDefault<UBloodRitualSettings>() and never hard-codes them.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Blood Ritual"))
class BLOODRITUAL_API UBloodRitualSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UBloodRitualSettings();

	//~ UDeveloperSettings
	virtual FName GetCategoryName() const override;

	/** Length of the Day phase (scavenging) in seconds. */
	UPROPERTY(Config, EditAnywhere, Category = "Day Clock", meta = (ClampMin = "1.0"))
	float DayDurationSeconds = 480.0f;

	/** Length of the Dusk phase (the warning before night) in seconds. */
	UPROPERTY(Config, EditAnywhere, Category = "Day Clock", meta = (ClampMin = "1.0"))
	float DuskDurationSeconds = 60.0f;

	/** Directional light intensity (lux) at the start of Day. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DaySunIntensity = 10.0f;

	/** Directional light intensity (lux) when Dusk begins; Day interpolates towards it. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DuskSunIntensity = 3.0f;

	/** Directional light intensity (lux) when Night begins; Dusk interpolates towards it. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float NightSunIntensity = 0.05f;

	/** Sky light intensity scale at the start of Day. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DaySkyLightIntensity = 1.0f;

	/** Sky light intensity scale when Dusk begins. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DuskSkyLightIntensity = 0.4f;

	/** Sky light intensity scale when Night begins. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float NightSkyLightIntensity = 0.05f;

	/** Directional light colour at the start of Day. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting")
	FLinearColor DaySunColor = FLinearColor(1.0f, 0.98f, 0.92f);

	/** Directional light colour when Dusk begins. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting")
	FLinearColor DuskSunColor = FLinearColor(1.0f, 0.55f, 0.25f);

	/** Directional light colour when Night begins. */
	UPROPERTY(Config, EditAnywhere, Category = "Lighting")
	FLinearColor NightSunColor = FLinearColor(0.3f, 0.4f, 0.7f);

	/** Noise radius (world units) of a bow shot. Read by the weapons ticket (part 2). */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0"))
	float BowNoiseRadius = 500.0f;

	/** Noise radius (world units) of a rifle shot. Read by the weapons ticket (part 2). */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0"))
	float RifleNoiseRadius = 3000.0f;

	/** Noise radius (world units) emitted when a container search starts. Zero emits nothing. */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0"))
	float ContainerSearchNoiseRadius = 800.0f;

	/** How long (seconds) a container search takes before it grants its supplies. */
	UPROPERTY(Config, EditAnywhere, Category = "Scavenging", meta = (ClampMin = "0.0"))
	float ContainerSearchDurationSeconds = 2.0f;

	/**
	 * The containers spawned at the scavenging area of the test environment, one entry per
	 * container, with the supplies each grants when searched.
	 */
	UPROPERTY(Config, EditAnywhere, Category = "Scavenging")
	TArray<FBloodRitualContainerLoot> ScavengingContainers;

	/** Distance (world units) from the player within which an interactable can be used. */
	UPROPERTY(Config, EditAnywhere, Category = "Interaction", meta = (ClampMin = "0.0"))
	float InteractionRange = 250.0f;
};
