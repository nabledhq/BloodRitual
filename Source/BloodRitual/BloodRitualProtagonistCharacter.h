// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "BloodRitualProtagonistCharacter.generated.h"

class UAnimSequence;
class UBlendSpace;
class UCameraComponent;
class UBloodRitualInteractionComponent;
class UBloodRitualInventoryComponent;
class USpringArmComponent;
class UStaticMeshComponent;

/**
 * Stand-in player pawn: a capsule carrying a Seminole man of around 1900 (a MakeHuman body in a
 * project-made big shirt, sash, kerchief and turban; see ASSETS_LICENSES.md), a third-person
 * spring-arm camera and WASD / mouse-look / jump controls.
 *
 * The body plays one asset at a time (single-node animation, no Animation Blueprint): the
 * BS_Locomotion blend space, fed the ground speed each tick (idle, walk, jog, sprint), or the
 * jump loop while falling (Quaternius clips retargeted to his skeleton). If the assets are missing
 * it shows a cylinder instead.
 *
 * Input uses the legacy axis and action mappings in Config/DefaultInput.ini (MoveForward,
 * MoveRight, Turn, LookUp, Jump, Interact), bound in SetupPlayerInputComponent. The real player
 * character, with Enhanced Input and animation, is a later ticket under Characters/; it keeps
 * the two vertical-slice components added here (inventory and interaction).
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

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualInventoryComponent* GetInventory() const { return Inventory; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualInteractionComponent* GetInteraction() const { return Interaction; }

private:
	void MoveForward(float Value);
	void MoveRight(float Value);
	void Interact();

	/** Plays the locomotion blend space at the current ground speed, or the jump loop while falling. */
	void UpdateAnimation();

	/** Idle / walk / jog / sprint over ground speed (cm/s). */
	UPROPERTY()
	TObjectPtr<UBlendSpace> LocomotionBlendSpace;

	UPROPERTY()
	TObjectPtr<UAnimSequence> JumpLoop;

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
};
