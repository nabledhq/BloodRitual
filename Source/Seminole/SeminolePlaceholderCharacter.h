// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SeminolePlaceholderCharacter.generated.h"

class UCameraComponent;
class USeminoleInteractionComponent;
class USeminoleInventoryComponent;
class USpringArmComponent;
class UStaticMeshComponent;

/**
 * Stand-in player pawn used to prove the project boots: a capsule with a visible cylinder,
 * a third-person spring-arm camera and WASD / mouse-look / jump / interact controls.
 *
 * Carries the vertical slice's USeminoleInventoryComponent and USeminoleInteractionComponent
 * so containers and the hub stockpile can be used; the real player character inherits those
 * two components, not this class.
 *
 * Input uses the legacy axis and action mappings in Config/DefaultInput.ini (MoveForward,
 * MoveRight, Turn, LookUp, Jump, Interact), bound in SetupPlayerInputComponent. The real
 * player character, with Enhanced Input and animation, is a later ticket under Characters/.
 */
UCLASS()
class SEMINOLE_API ASeminolePlaceholderCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ASeminolePlaceholderCharacter();

	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	USeminoleInventoryComponent* GetInventory() const { return Inventory; }
	USeminoleInteractionComponent* GetInteraction() const { return Interaction; }

private:
	void MoveForward(float Value);
	void MoveRight(float Value);
	void Interact();

	/** Visible body: /Engine/BasicShapes/Cylinder scaled to fit the capsule. No collision; the capsule handles that. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> BodyMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UCameraComponent> FollowCamera;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USeminoleInventoryComponent> Inventory;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USeminoleInteractionComponent> Interaction;
};
