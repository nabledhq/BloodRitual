// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Combat/BloodRitualWeaponTypes.h"
#include "BloodRitualWeaponComponent.generated.h"

class ABloodRitualArrow;
class UBloodRitualInventoryComponent;
class UPointLightComponent;
class UStaticMesh;
class UStaticMeshComponent;

/**
 * The player's weapons: which he carries and holds, the rifle's loaded rounds, and every attack.
 *
 *   * Melee (tomahawk, rock sledgehammer): a swing lands SwingContactSeconds (scaled by the
 *     weapon's swing rate) after it starts and hurts every living pawn in an arc in front of him;
 *     the sledgehammer also knocks them back. A blow that lands is noisy (MeleeNoiseRadius).
 *   * Rifle: hitscan along the view, from the magazine, which R refills out of carried Ammo.
 *   * Bow: each arrow costs one carried Ammo and flies as an ABloodRitualArrow.
 * Shots emit RifleNoiseRadius / BowNoiseRadius. Every number comes from UBloodRitualSettings.
 *
 * The held weapon is a static mesh attached to the owner character's hand_r. The meshes are
 * modelled in the character's mesh space at his rest pose (scripts/blender/build_weapons.py), so
 * the attachment is offset by the inverse of the hand's reference-pose transform.
 *
 * Animation is the owner's job: Attack and StartReload say what happened and the swing rate
 * says how fast to play the swing. Timed work goes through Advance (ticked; tests call it).
 */
UCLASS(ClassGroup = (BloodRitual), meta = (BlueprintSpawnableComponent))
class BLOODRITUAL_API UBloodRitualWeaponComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UBloodRitualWeaponComponent();

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/**
	 * Holds Weapon; asking for the weapon already held puts it away. Not possible mid-swing;
	 * abandons a reload. Returns the weapon now held.
	 */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Weapons")
	EBloodRitualWeapon SelectWeapon(EBloodRitualWeapon Weapon);

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	EBloodRitualWeapon GetCurrentWeapon() const { return CurrentWeapon; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	EBloodRitualWeaponHold GetHold() const { return BloodRitualWeapons::GetHold(CurrentWeapon); }

	/**
	 * Attacks with the held weapon along the view (the camera's location and direction, which
	 * ranged weapons aim along). Returns what happened.
	 */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Weapons")
	EBloodRitualAttackResult Attack(const FVector& ViewLocation, const FVector& ViewDirection);

	/** Starts refilling the rifle's magazine from carried Ammo. False if there is nothing to do. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Weapons")
	bool StartReload();

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	bool IsReloading() const { return ReloadSecondsLeft > 0.0f; }

	/** Swinging, between shots or reloading. */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	bool IsBusy() const { return CooldownSecondsLeft > 0.0f || IsReloading(); }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	int32 GetLoadedRounds() const { return LoadedRounds; }

	/** Ammo the owner carries (rifle rounds and arrows alike). */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	int32 GetCarriedAmmo() const;

	/** Play rate of the swing clip for the held melee weapon (1 for anything else). */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	float GetSwingRate() const;

	/** Seconds since an attack last hurt something (for a hit marker); large if never. */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Weapons")
	float GetSecondsSinceHit() const { return SecondsSinceHit; }

	/** Clears swings, cooldowns and reloads in progress (the owner was hit, rolled or died). */
	void Interrupt();

	/** Counts down cooldowns, lands pending swings and finishes reloads. */
	void Advance(float DeltaSeconds);

	/** Records a hit made on this component's behalf (arrows report back through this). */
	void NotifyHit() { SecondsSinceHit = 0.0f; }

private:
	void UpdateHeldMesh();
	void LandSwing();
	EBloodRitualAttackResult FireRifle(const FVector& ViewLocation, const FVector& ViewDirection);
	EBloodRitualAttackResult FireBow(const FVector& ViewLocation, const FVector& ViewDirection);

	/** First thing along the view (starting level with the owner), or the end of Range. */
	FVector TraceView(const FVector& ViewLocation, const FVector& ViewDirection, float Range, FHitResult& OutHit) const;

	void Flash();
	UBloodRitualInventoryComponent* GetInventory() const;
	void ReportNoise(float Radius) const;

	UPROPERTY()
	TObjectPtr<UStaticMesh> TomahawkMesh;

	UPROPERTY()
	TObjectPtr<UStaticMesh> RockSledgeMesh;

	UPROPERTY()
	TObjectPtr<UStaticMesh> BowMesh;

	UPROPERTY()
	TObjectPtr<UStaticMesh> RifleMesh;

	/** The weapon in his hand (created in BeginPlay). */
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> HeldMesh;

	/** A brief light at the muzzle when the rifle fires. */
	UPROPERTY()
	TObjectPtr<UPointLightComponent> MuzzleFlash;

	EBloodRitualWeapon CurrentWeapon = EBloodRitualWeapon::None;
	int32 LoadedRounds = 0;
	float CooldownSecondsLeft = 0.0f;
	float ReloadSecondsLeft = 0.0f;
	float SwingContactSecondsLeft = -1.0f;
	EBloodRitualWeapon SwingWeapon = EBloodRitualWeapon::None;
	float FlashSecondsLeft = 0.0f;
	float SecondsSinceHit = 1000.0f;
};
