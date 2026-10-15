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

	/** Noise radius (world units) of a bow shot. */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0"))
	float BowNoiseRadius = 500.0f;

	/** Noise radius (world units) of a rifle shot. */
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

	// --- Survival -----------------------------------------------------------------------------

	/** The player's health. */
	UPROPERTY(Config, EditAnywhere, Category = "Survival", meta = (ClampMin = "1.0"))
	float PlayerMaxHealth = 100.0f;

	/** Seconds between the player's death and respawning at the PlayerStart (carried supplies are lost). */
	UPROPERTY(Config, EditAnywhere, Category = "Survival", meta = (ClampMin = "0.0"))
	float PlayerRespawnDelaySeconds = 5.0f;

	// --- Weapons ------------------------------------------------------------------------------

	/** Ammo the player carries when he (re)spawns. Rifle rounds and arrows both come out of Ammo. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0"))
	int32 StartingAmmo = 6;

	/** Damage of a tomahawk blow. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float TomahawkDamage = 40.0f;

	/** How far (world units) in front of him a tomahawk blow reaches. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float TomahawkReach = 170.0f;

	/** Swing speed of the tomahawk (play rate of the swing; higher is faster). */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.1"))
	float TomahawkSwingRate = 1.4f;

	/** Damage of a rock sledgehammer blow. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RockSledgeDamage = 90.0f;

	/** How far (world units) in front of him a sledgehammer blow reaches. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RockSledgeReach = 200.0f;

	/** Swing speed of the sledgehammer (play rate of the swing; below 1 is slower than the clip). */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.1"))
	float RockSledgeSwingRate = 0.75f;

	/** Speed (cm/s) a sledgehammer blow knocks its target back with. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RockSledgeKnockback = 700.0f;

	/** Noise radius (world units) of a melee blow that lands. */
	UPROPERTY(Config, EditAnywhere, Category = "Noise", meta = (ClampMin = "0.0"))
	float MeleeNoiseRadius = 600.0f;

	/** Damage of an arrow. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float ArrowDamage = 75.0f;

	/** Launch speed (cm/s) of an arrow. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "100.0"))
	float ArrowSpeed = 4500.0f;

	/** Seconds between bow shots (nocking the next arrow). */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float BowShotIntervalSeconds = 0.9f;

	/** Damage of a rifle round. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RifleDamage = 60.0f;

	/** Range (world units) of a rifle shot. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RifleRange = 10000.0f;

	/** Rounds the rifle's tube magazine holds. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "1"))
	int32 RifleMagazineSize = 8;

	/** Seconds between rifle shots (working the lever). */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RifleShotIntervalSeconds = 0.7f;

	/** Seconds a rifle reload takes. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "0.0"))
	float RifleReloadSeconds = 1.4f;

	/** Damage multiplier of an arrow or a rifle round that hits the head. */
	UPROPERTY(Config, EditAnywhere, Category = "Weapons", meta = (ClampMin = "1.0"))
	float HeadshotMultiplier = 2.0f;

	// --- Infected -----------------------------------------------------------------------------

	/** How many infected the test environment spawns around the scavenging area. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0"))
	int32 InfectedCount = 4;

	/** Health of one infected. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "1.0"))
	float InfectedMaxHealth = 100.0f;

	/** Speed (cm/s) of an infected wandering. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedWalkSpeed = 110.0f;

	/** Speed (cm/s) of an infected going to a noise. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedInvestigateSpeed = 200.0f;

	/** Speed (cm/s) of an infected chasing a player (the player's top speed is 600). */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedChaseSpeed = 380.0f;

	/** How far (world units) an infected sees. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedSightRange = 1600.0f;

	/** Full angle (degrees) of an infected's field of view. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0", ClampMax = "360.0"))
	float InfectedSightAngleDegrees = 120.0f;

	/** Distance (world units) within which an infected senses a player in any direction. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedProximityRange = 300.0f;

	/** Seconds an infected keeps chasing without seeing its target before searching. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedLoseTargetSeconds = 4.0f;

	/** Radius (world units) around its spawn point that an infected wanders. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedWanderRadius = 800.0f;

	/** Distance (world units) from which an infected attacks. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedAttackRange = 140.0f;

	/** Damage of one infected blow. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedAttackDamage = 15.0f;

	/** Seconds between an infected's blows. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedAttackIntervalSeconds = 1.6f;

	/** Seconds a dead infected's body stays before it is removed. */
	UPROPERTY(Config, EditAnywhere, Category = "Infected", meta = (ClampMin = "0.0"))
	float InfectedCorpseSeconds = 30.0f;
};
