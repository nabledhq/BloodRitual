// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleSettings.generated.h"

/**
 * Every gameplay tunable of the vertical slice, in one place.
 *
 * Defaults live here in C++; a project can override them in Config/DefaultGame.ini
 * (section [/Script/Seminole.SeminoleSettings]) or through Edit > Project Settings >
 * Game > Seminole. Gameplay code reads values through GetDefault<USeminoleSettings>()
 * and never hard-codes them.
 *
 * Some values are read only by later parts of the slice (bow and rifle noise radii by
 * part 2, weapons and infected); they are declared now so the tuning surface is complete.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Seminole"))
class SEMINOLE_API USeminoleSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	USeminoleSettings();

	virtual FName GetCategoryName() const override;

	// Day clock (Survival/SeminoleDayClockSubsystem).

	/** Length of the Day phase in seconds. */
	UPROPERTY(Config, EditAnywhere, Category = "Day Clock", meta = (ClampMin = "1.0", Units = "s"))
	float DayDurationSeconds = 480.0f;

	/** Length of the Dusk phase in seconds. Night follows and does not end on its own. */
	UPROPERTY(Config, EditAnywhere, Category = "Day Clock", meta = (ClampMin = "1.0", Units = "s"))
	float DuskDurationSeconds = 60.0f;

	/** How long the HUD shows the dusk warning banner after Dusk begins. */
	UPROPERTY(Config, EditAnywhere, Category = "Day Clock", meta = (ClampMin = "0.0", Units = "s"))
	float DuskWarningSeconds = 10.0f;

	// Lighting (Survival/SeminoleDayLightingComponent). Directional light in lux, sky light as a scale.

	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DaySunIntensity = 10.0f;

	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DuskSunIntensity = 2.5f;

	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float NightSunIntensity = 0.05f;

	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DaySkyLightIntensity = 1.0f;

	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float DuskSkyLightIntensity = 0.4f;

	UPROPERTY(Config, EditAnywhere, Category = "Lighting", meta = (ClampMin = "0.0"))
	float NightSkyLightIntensity = 0.05f;

	// Noise (World/SeminoleNoiseSubsystem). Radii in unreal units (cm).

	/** Radius of the noise a bow shot makes. Read by part 2 (weapons). */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0", Units = "cm"))
	float BowNoiseRadius = 500.0f;

	/** Radius of the noise a rifle shot makes. Read by part 2 (weapons). */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0", Units = "cm"))
	float RifleNoiseRadius = 3000.0f;

	/** Radius of the noise made when a container search starts. 0 disables it. */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0", Units = "cm"))
	float ContainerSearchNoiseRadius = 800.0f;

	// Scavenging (Inventory/SeminoleSupplyContainer, Interaction/SeminoleInteractionComponent).

	/** How long a container takes to search once interacted with. */
	UPROPERTY(Config, EditAnywhere, Category = "Scavenging", meta = (ClampMin = "0.0", Units = "s"))
	float ContainerSearchDurationSeconds = 2.0f;

	/**
	 * Supplies granted by each container the test environment spawns, one entry per container.
	 * The test environment spawns one container per entry at the scavenging area.
	 */
	UPROPERTY(Config, EditAnywhere, Category = "Scavenging")
	TArray<FSeminoleSupplyBundle> ContainerSupplies;

	/** Maximum distance from the player to an interactable for the Interact action to reach it. */
	UPROPERTY(Config, EditAnywhere, Category = "Scavenging", meta = (ClampMin = "0.0", Units = "cm"))
	float InteractionRange = 250.0f;
};
