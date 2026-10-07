// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualProtagonistCharacter.h"

#include "Interaction/BloodRitualInteractionComponent.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Animation/BlendSpace.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Controller.h"
#include "GameFramework/SpringArmComponent.h"
#include "UObject/ConstructorHelpers.h"

ABloodRitualProtagonistCharacter::ABloodRitualProtagonistCharacter()
{
	// Ticks only to drive the body's animation.
	PrimaryActorTick.bCanEverTick = true;

	// Default capsule: radius 34, half height 88 (176 cm tall).
	GetCapsuleComponent()->InitCapsuleSize(34.0f, 88.0f);

	// The controller rotates the camera boom, not the pawn; the pawn turns to face its movement.
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.0f, 540.0f, 0.0f);
	Movement->JumpZVelocity = 600.0f;
	Movement->AirControl = 0.2f;

	BodyMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BodyMesh"));
	BodyMesh->SetupAttachment(GetCapsuleComponent());
	BodyMesh->SetCollisionProfileName(UCollisionProfile::NoCollision_ProfileName);
	BodyMesh->SetGenerateOverlapEvents(false);
	BodyMesh->SetCanEverAffectNavigation(false);

	// Resolved here so the class default object hard-references the assets and the cooker packages them.
	// The Seminole man (scripts/blender/build_protagonist.py) with the Quaternius clips retargeted
	// onto his skeleton (scripts/editor/import_protagonist.py).
	ConstructorHelpers::FObjectFinder<USkeletalMesh> BodyFinder(TEXT("/Game/Characters/Protagonist/SKM_Protagonist.SKM_Protagonist"));
	ConstructorHelpers::FObjectFinder<UBlendSpace> LocomotionFinder(TEXT("/Game/Characters/Protagonist/Animations/BS_Locomotion.BS_Locomotion"));
	ConstructorHelpers::FObjectFinder<UAnimSequence> JumpFinder(TEXT("/Game/Characters/Protagonist/Animations/A_Jump_Loop.A_Jump_Loop"));
	if (BodyFinder.Succeeded())
	{
		// The mesh (1.69 m) has its feet at its origin and faces +Y; the capsule's origin is its
		// centre and the pawn faces +X.
		GetMesh()->SetSkeletalMeshAsset(BodyFinder.Object);
		GetMesh()->SetRelativeLocationAndRotation(FVector(0.0f, 0.0f, -88.0f), FRotator(0.0f, -90.0f, 0.0f));
		GetMesh()->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		LocomotionBlendSpace = LocomotionFinder.Object;
		JumpLoop = JumpFinder.Object;
	}
	else
	{
		ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
		if (CylinderFinder.Succeeded())
		{
			BodyMesh->SetStaticMesh(CylinderFinder.Object);
		}
		// The engine cylinder is 100 cm wide and 100 cm tall; fit it inside the capsule.
		BodyMesh->SetRelativeScale3D(FVector(0.68f, 0.68f, 1.76f));
	}

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = 400.0f;
	CameraBoom->SocketOffset = FVector(0.0f, 0.0f, 60.0f);
	CameraBoom->bUsePawnControlRotation = true;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;

	Inventory = CreateDefaultSubobject<UBloodRitualInventoryComponent>(TEXT("Inventory"));
	Interaction = CreateDefaultSubobject<UBloodRitualInteractionComponent>(TEXT("Interaction"));
}

void ABloodRitualProtagonistCharacter::BeginPlay()
{
	Super::BeginPlay();

	UpdateAnimation();
}

void ABloodRitualProtagonistCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	UpdateAnimation();
}

void ABloodRitualProtagonistCharacter::UpdateAnimation()
{
	if (LocomotionBlendSpace == nullptr)
	{
		return;
	}

	USkeletalMeshComponent* Body = GetMesh();
	UAnimationAsset* Wanted = (JumpLoop != nullptr && GetCharacterMovement()->IsFalling())
		? static_cast<UAnimationAsset*>(JumpLoop)
		: static_cast<UAnimationAsset*>(LocomotionBlendSpace);

	UAnimSingleNodeInstance* Node = Body->GetSingleNodeInstance();
	if (Node == nullptr || Node->GetAnimationAsset() != Wanted)
	{
		Body->PlayAnimation(Wanted, /*bLooping*/ true);
		Node = Body->GetSingleNodeInstance();
	}
	if (Node != nullptr && Wanted == LocomotionBlendSpace)
	{
		Node->SetBlendSpacePosition(FVector(GetVelocity().Size2D(), 0.0f, 0.0f));
	}
}

void ABloodRitualProtagonistCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	check(PlayerInputComponent);

	// Names match the AxisMappings / ActionMappings in Config/DefaultInput.ini.
	PlayerInputComponent->BindAxis(TEXT("MoveForward"), this, &ABloodRitualProtagonistCharacter::MoveForward);
	PlayerInputComponent->BindAxis(TEXT("MoveRight"), this, &ABloodRitualProtagonistCharacter::MoveRight);
	PlayerInputComponent->BindAxis(TEXT("Turn"), this, &APawn::AddControllerYawInput);
	PlayerInputComponent->BindAxis(TEXT("LookUp"), this, &APawn::AddControllerPitchInput);

	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Pressed, this, &ACharacter::Jump);
	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
	PlayerInputComponent->BindAction(TEXT("Interact"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::Interact);
}

void ABloodRitualProtagonistCharacter::MoveForward(float Value)
{
	if (Controller != nullptr && Value != 0.0f)
	{
		// Move along the camera's yaw, ignoring its pitch, so looking down does not slow the pawn.
		const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
		AddMovementInput(Direction, Value);
	}
}

void ABloodRitualProtagonistCharacter::MoveRight(float Value)
{
	if (Controller != nullptr && Value != 0.0f)
	{
		const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);
		AddMovementInput(Direction, Value);
	}
}

void ABloodRitualProtagonistCharacter::Interact()
{
	Interaction->TryInteract();
}
