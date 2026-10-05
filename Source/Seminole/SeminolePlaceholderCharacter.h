// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SeminolePlaceholderCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UStaticMeshComponent;

/**
 * Stand-in player pawn used to prove the project boots: a capsule with a visible cylinder,
 * a third-person spring-arm camera and WASD / mouse-look / jump controls.
 *
 * Input uses the legacy axis and action mappings in Config/DefaultInput.ini (MoveForward,
 * MoveRight, Turn, LookUp, Jump), bound in SetupPlayerInputComponent. The real player
 * character, with Enhanced Input and animation, is a later ticket under Characters/.
 */
UCLASS()
class SEMINOLE_API ASeminolePlaceholderCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ASeminolePlaceholderCharacter();

	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

private:
	void MoveForward(float Value);
	void MoveRight(float Value);

	/** Visible body: /Engine/BasicShapes/Cylinder scaled to fit the capsule. No collision; the capsule handles that. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> BodyMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UCameraComponent> FollowCamera;
};
