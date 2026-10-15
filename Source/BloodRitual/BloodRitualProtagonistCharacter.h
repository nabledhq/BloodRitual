// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Combat/BloodRitualWeaponTypes.h"
#include "BloodRitualProtagonistCharacter.generated.h"

class UAnimSequence;
class UBlendSpace;
class UCameraComponent;
class UBloodRitualHealthComponent;
class UBloodRitualInteractionComponent;
class UBloodRitualInventoryComponent;
class UBloodRitualWeaponComponent;
class USpringArmComponent;
class UStaticMeshComponent;

/**
 * Stand-in player pawn: a capsule carrying the Protagonist (a MakeHuman body in a project-made
 * outfit after the concept renders in renders/; see ASSETS_LICENSES.md), a third-person
 * spring-arm camera, and controls to move, look, jump, crouch, roll, interact and fight.
 *
 * Fighting goes through UBloodRitualWeaponComponent (1-4 pick the tomahawk, rock sledgehammer,
 * bow or rifle, the same key again puts it away; left mouse attacks; right mouse aims a ranged
 * weapon, turning him with the camera and zooming in; R reloads the rifle). Health is a
 * UBloodRitualHealthComponent: a hit makes him flinch; at zero he dies and, after
 * PlayerRespawnDelaySeconds, the game mode restarts the player at the PlayerStart (carried
 * supplies are lost with the body).
 *
 * The body plays one asset at a time (single-node animation, no Animation Blueprint), chosen in
 * UpdateAnimation each tick from the Quaternius clips retargeted to his skeleton:
 *   * the death clip once dead;
 *   * a one-shot action while one runs: the roll, the jump take-off and landing, searching a
 *     container (stretched over the search), depositing at the stockpile, a swing, a shot, a
 *     reload or a flinch;
 *   * the jump loop while falling;
 *   * the aiming pose while aiming a ranged weapon and standing still;
 *   * otherwise a blend space at the current ground speed: crouched, or standing with an idle
 *     that matches what he holds (unarmed, melee, ranged).
 * Switching assets does not blend. If the assets are missing he is a cylinder.
 *
 * Input uses the legacy axis and action mappings in Config/DefaultInput.ini, bound in
 * SetupPlayerInputComponent. The real player character, with Enhanced Input and an Animation
 * Blueprint, is a later ticket under Characters/; it keeps the components added here.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualProtagonistCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ABloodRitualProtagonistCharacter();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void Landed(const FHitResult& Hit) override;
	virtual void OnJumped_Implementation() override;

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualInventoryComponent* GetInventory() const { return Inventory; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualInteractionComponent* GetInteraction() const { return Interaction; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualHealthComponent* GetHealth() const { return Health; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualWeaponComponent* GetWeapons() const { return Weapons; }

	/** Crouches if standing, stands up if crouched (and there is room). */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void ToggleCrouch();

	/** Rolls along the current movement input, or forward without input. Only on the ground. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void Roll();

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	bool IsRolling() const { return bRolling; }

	/** Uses the nearest interactable, turning to it and playing the search or deposit clip. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void Interact();

	/** Picks a weapon (the one held again puts it away). */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void SelectWeapon(EBloodRitualWeapon Weapon);

	/** Attacks with the held weapon along the camera's view. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void Attack();

	/** Aiming a ranged weapon: he turns with the camera, walks slowly and the camera zooms in. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void SetAiming(bool bNewAiming);

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	bool IsAiming() const { return bAiming; }

	/** Refills the rifle from carried Ammo. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual")
	void Reload();

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	bool IsDead() const;

private:
	void MoveForward(float Value);
	void MoveRight(float Value);
	void StartJump();
	void StartAiming() { SetAiming(true); }
	void StopAiming() { SetAiming(false); }
	void SelectTomahawk() { SelectWeapon(EBloodRitualWeapon::Tomahawk); }
	void SelectRockSledge() { SelectWeapon(EBloodRitualWeapon::RockSledge); }
	void SelectBow() { SelectWeapon(EBloodRitualWeapon::Bow); }
	void SelectRifle() { SelectWeapon(EBloodRitualWeapon::Rifle); }

	UFUNCTION()
	void HandleDamaged(UBloodRitualHealthComponent* DamagedHealth, float Amount, AActor* DamageCauser);

	UFUNCTION()
	void HandleDied(UBloodRitualHealthComponent* DeadHealth, AActor* Killer);

	void Respawn();

	/** Applies aiming to rotation, speed and the camera boom (eased towards its targets). */
	void UpdateAimCamera(float DeltaSeconds);

	/**
	 * Plays a one-shot clip from StartSeconds at PlayRate. For LockSeconds movement input is
	 * ignored; after that, movement input ends the action early.
	 */
	void PlayAction(UAnimSequence* Clip, float PlayRate, float StartSeconds = 0.0f, float LockSeconds = 0.0f);
	void EndAction();
	void AdvanceAction(float DeltaSeconds);

	/** True while movement input should be ignored (rolling, swinging, dead). Otherwise input cancels the action. */
	bool ConsumeMovementForAction();

	/** Plays the current action, the jump loop while falling, the aiming pose or a blend space at the ground speed. */
	void UpdateAnimation();

	/** Idle / walk / jog / sprint over ground speed (cm/s), unarmed. */
	UPROPERTY()
	TObjectPtr<UBlendSpace> LocomotionBlendSpace;

	/** The same with a melee weapon at the ready (idle: Quaternius "Sword_Idle"). */
	UPROPERTY()
	TObjectPtr<UBlendSpace> MeleeLocomotionBlendSpace;

	/** The same with a ranged weapon held (idle: Quaternius "Pistol_Idle_Loop"). */
	UPROPERTY()
	TObjectPtr<UBlendSpace> RangedLocomotionBlendSpace;

	/** Crouched idle / crouched walk over ground speed (cm/s). */
	UPROPERTY()
	TObjectPtr<UBlendSpace> CrouchBlendSpace;

	UPROPERTY()
	TObjectPtr<UAnimSequence> JumpStart;

	UPROPERTY()
	TObjectPtr<UAnimSequence> JumpLoop;

	UPROPERTY()
	TObjectPtr<UAnimSequence> JumpLand;

	UPROPERTY()
	TObjectPtr<UAnimSequence> RollClip;

	/** Reaching and rummaging (Quaternius "Interact"), played over a container search. */
	UPROPERTY()
	TObjectPtr<UAnimSequence> SearchClip;

	/** A short reach (Quaternius "PickUp_Table"), played when depositing at the stockpile. */
	UPROPERTY()
	TObjectPtr<UAnimSequence> DepositClip;

	/** Melee swing (Quaternius "Sword_Attack"), played at the weapon's swing rate. */
	UPROPERTY()
	TObjectPtr<UAnimSequence> SwingClip;

	/** Arm raised along the aim (Quaternius "Pistol_Aim_Neutral"), held while aiming. */
	UPROPERTY()
	TObjectPtr<UAnimSequence> AimClip;

	/** Recoil (Quaternius "Pistol_Shoot"), for the rifle and the bow. */
	UPROPERTY()
	TObjectPtr<UAnimSequence> ShootClip;

	UPROPERTY()
	TObjectPtr<UAnimSequence> ReloadClip;

	UPROPERTY()
	TObjectPtr<UAnimSequence> HitClip;

	UPROPERTY()
	TObjectPtr<UAnimSequence> DeathClip;

	/** The one-shot clip playing, if any, and how long it and its movement lock have left. */
	UPROPERTY()
	TObjectPtr<UAnimSequence> ActionClip;
	float ActionSecondsLeft = 0.0f;
	float ActionLockSecondsLeft = 0.0f;

	bool bRolling = false;
	FVector RollDirection = FVector::ForwardVector;
	float DefaultMaxWalkSpeed = 600.0f;
	bool bAiming = false;
	FTimerHandle RespawnTimer;

	/** Fallback body when the character assets are missing: /Engine/BasicShapes/Cylinder scaled to the capsule. No collision. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> BodyMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UCameraComponent> FollowCamera;

	/** Carried supplies (vertical slice part 1). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UBloodRitualInventoryComponent> Inventory;

	/** Finds and uses the nearest interactable on the Interact action (E). */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UBloodRitualInteractionComponent> Interaction;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UBloodRitualHealthComponent> Health;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UBloodRitualWeaponComponent> Weapons;
};
