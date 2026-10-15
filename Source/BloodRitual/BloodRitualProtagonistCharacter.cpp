// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualProtagonistCharacter.h"

#include "BloodRitualSettings.h"
#include "Characters/BloodRitualProtagonistAnimInstance.h"
#include "Combat/BloodRitualWeaponComponent.h"
#include "Community/BloodRitualStockpile.h"
#include "Interaction/BloodRitualInteractionComponent.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Inventory/BloodRitualSupplyContainer.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimSequence.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Controller.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/SpringArmComponent.h"
#include "TimerManager.h"
#include "UObject/ConstructorHelpers.h"

namespace BloodRitualProtagonistTuning
{
	// Crouched: a 120 cm capsule, moving at the speed BS_Crouch plays its crouched walk at
	// (scripts/editor/import_protagonist.py, CROUCH_SAMPLES).
	constexpr float CrouchedHalfHeight = 60.0f;
	constexpr float MaxWalkSpeedCrouched = 130.0f;

	// The roll clip lasts 1.47 s; played a little faster, it travels for the first 0.8 s and the
	// rest is getting up, which movement input may cut short.
	constexpr float RollPlayRate = 1.2f;
	constexpr float RollMoveSeconds = 0.8f;
	constexpr float RollSpeed = 400.0f;

	// The take-off clip starts with a 0.1 s wind-up (then tucks the legs); the jump leaves the
	// ground at once.
	constexpr float JumpStartSkipSeconds = 0.1f;

	// The landing clip plays only when landing almost still; running on through it would slide.
	constexpr float JumpLandPlayRate = 1.4f;
	constexpr float JumpLandMaxGroundSpeed = 200.0f;

	// Fighting plays on the upper body, so swings, shots and reloads do not root him.
	constexpr float ShootPlayRate = 1.2f;

	// Montage blends: full-body actions ease in and out a little more than upper-body ones.
	constexpr float FullBodyBlendSeconds = 0.15f;
	constexpr float UpperBodyBlendSeconds = 0.1f;

	// Aiming: a walk, and the camera pulled in over his right shoulder.
	constexpr float AimWalkSpeed = 200.0f;
	constexpr float CameraArmLength = 400.0f;
	constexpr float AimArmLength = 170.0f;
	const FVector CameraSocketOffset(0.0f, 0.0f, 60.0f);
	const FVector AimSocketOffset(0.0f, 55.0f, 70.0f);
	constexpr float CameraEaseSpeed = 10.0f;
}

ABloodRitualProtagonistCharacter::ABloodRitualProtagonistCharacter()
{
	// Ticks to drive the body's animation and the aiming camera.
	PrimaryActorTick.bCanEverTick = true;

	// Default capsule: radius 34, half height 88 (176 cm tall).
	GetCapsuleComponent()->InitCapsuleSize(34.0f, 88.0f);

	// The controller rotates the camera boom, not the pawn; the pawn turns to face its movement
	// (or, while aiming, the camera).
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.0f, 540.0f, 0.0f);
	Movement->JumpZVelocity = 600.0f;
	Movement->AirControl = 0.2f;
	Movement->GetNavAgentPropertiesRef().bCanCrouch = true;
	Movement->SetCrouchedHalfHeight(BloodRitualProtagonistTuning::CrouchedHalfHeight);
	Movement->MaxWalkSpeedCrouched = BloodRitualProtagonistTuning::MaxWalkSpeedCrouched;

	BodyMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("BodyMesh"));
	BodyMesh->SetupAttachment(GetCapsuleComponent());
	BodyMesh->SetCollisionProfileName(UCollisionProfile::NoCollision_ProfileName);
	BodyMesh->SetGenerateOverlapEvents(false);
	BodyMesh->SetCanEverAffectNavigation(false);

	// Resolved here so the class default object hard-references the assets and the cooker packages them.
	// The Protagonist (scripts/blender/build_protagonist.py) with the Quaternius clips retargeted
	// onto his skeleton (scripts/editor/import_protagonist.py).
	const TCHAR* Animations = TEXT("/Game/Characters/Protagonist/Animations/");
	auto Clip = [Animations](const TCHAR* Name)
	{
		const FString Path = FString::Printf(TEXT("%s%s.%s"), Animations, Name, Name);
		ConstructorHelpers::FObjectFinder<UAnimSequence> Finder(*Path);
		return Finder.Object;
	};
	ConstructorHelpers::FObjectFinder<USkeletalMesh> BodyFinder(TEXT("/Game/Characters/Protagonist/SKM_Protagonist.SKM_Protagonist"));
	if (BodyFinder.Succeeded())
	{
		// The mesh (1.69 m) has its feet at its origin and faces +Y; the capsule's origin is its
		// centre and the pawn faces +X.
		GetMesh()->SetSkeletalMeshAsset(BodyFinder.Object);
		GetMesh()->SetRelativeLocationAndRotation(FVector(0.0f, 0.0f, -88.0f), FRotator(0.0f, -90.0f, 0.0f));

		// The Animation Blueprint (scripts/editor/build_anim_blueprint.py) holds the blend spaces,
		// the jump loop, the aiming pose and the death clip; the clips below play as montages.
		ConstructorHelpers::FClassFinder<UAnimInstance> AnimFinder(TEXT("/Game/Characters/Protagonist/ABP_Protagonist"));
		if (AnimFinder.Succeeded())
		{
			GetMesh()->SetAnimationMode(EAnimationMode::AnimationBlueprint);
			GetMesh()->SetAnimInstanceClass(AnimFinder.Class);
		}
		JumpStart = Clip(TEXT("A_Jump_Start"));
		JumpLand = Clip(TEXT("A_Jump_Land"));
		RollClip = Clip(TEXT("A_Roll"));
		SearchClip = Clip(TEXT("A_Interact"));
		DepositClip = Clip(TEXT("A_PickUp_Table"));
		SwingClip = Clip(TEXT("A_Sword_Attack"));
		ShootClip = Clip(TEXT("A_Pistol_Shoot"));
		ReloadClip = Clip(TEXT("A_Pistol_Reload"));
		HitClip = Clip(TEXT("A_Hit_Chest"));
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
	CameraBoom->TargetArmLength = BloodRitualProtagonistTuning::CameraArmLength;
	CameraBoom->SocketOffset = BloodRitualProtagonistTuning::CameraSocketOffset;
	CameraBoom->bUsePawnControlRotation = true;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;

	Inventory = CreateDefaultSubobject<UBloodRitualInventoryComponent>(TEXT("Inventory"));
	Interaction = CreateDefaultSubobject<UBloodRitualInteractionComponent>(TEXT("Interaction"));
	Health = CreateDefaultSubobject<UBloodRitualHealthComponent>(TEXT("Health"));
	Weapons = CreateDefaultSubobject<UBloodRitualWeaponComponent>(TEXT("Weapons"));
}

void ABloodRitualProtagonistCharacter::BeginPlay()
{
	Super::BeginPlay();

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	DefaultMaxWalkSpeed = GetCharacterMovement()->MaxWalkSpeed;
	Health->SetMaxHealth(Settings->PlayerMaxHealth);
	Health->OnDamaged.AddUniqueDynamic(this, &ABloodRitualProtagonistCharacter::HandleDamaged);
	Health->OnDied.AddUniqueDynamic(this, &ABloodRitualProtagonistCharacter::HandleDied);
	if (Settings->StartingAmmo > 0)
	{
		Inventory->AddSupply(EBloodRitualSupplyType::Ammo, Settings->StartingAmmo);
	}
}

void ABloodRitualProtagonistCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	AdvanceAction(DeltaSeconds);
	UpdateAimCamera(DeltaSeconds);
}

bool ABloodRitualProtagonistCharacter::IsDead() const
{
	return Health != nullptr && Health->IsDead();
}

void ABloodRitualProtagonistCharacter::OnJumped_Implementation()
{
	Super::OnJumped_Implementation();

	PlayAction(JumpStart, 1.0f, BloodRitualProtagonistTuning::JumpStartSkipSeconds);
}

void ABloodRitualProtagonistCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);

	if (IsDead())
	{
		return;
	}
	if (ActionClip == JumpStart)
	{
		EndAction();
	}
	if (ActionClip == nullptr && GetVelocity().Size2D() < BloodRitualProtagonistTuning::JumpLandMaxGroundSpeed)
	{
		PlayAction(JumpLand, BloodRitualProtagonistTuning::JumpLandPlayRate);
	}
}

void ABloodRitualProtagonistCharacter::ToggleCrouch()
{
	if (IsDead() || bRolling || GetCharacterMovement()->IsFalling())
	{
		return;
	}
	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		EndAction();
		Crouch();
	}
}

void ABloodRitualProtagonistCharacter::Roll()
{
	UCharacterMovementComponent* Movement = GetCharacterMovement();
	if (IsDead() || RollClip == nullptr || bRolling || bIsCrouched || !Movement->IsMovingOnGround())
	{
		return;
	}

	FVector Direction = GetLastMovementInputVector().GetSafeNormal2D();
	if (Direction.IsNearlyZero())
	{
		Direction = GetActorForwardVector().GetSafeNormal2D();
	}

	Weapons->Interrupt();
	StopUpperBodyAction();
	PlayAction(RollClip, BloodRitualProtagonistTuning::RollPlayRate, 0.0f, BloodRitualProtagonistTuning::RollMoveSeconds);
	bRolling = true;
	RollDirection = Direction;
	SetActorRotation(RollDirection.Rotation());
	Movement->MaxWalkSpeed = BloodRitualProtagonistTuning::RollSpeed;
}

void ABloodRitualProtagonistCharacter::SelectWeapon(EBloodRitualWeapon Weapon)
{
	if (IsDead() || bRolling || ActionClip != nullptr && ActionLockSecondsLeft > 0.0f)
	{
		return;
	}
	const bool bWasReloading = Weapons->IsReloading();
	Weapons->SelectWeapon(Weapon);
	if (bWasReloading && !Weapons->IsReloading())
	{
		// Switching abandoned the reload.
		StopUpperBodyAction();
	}
	if (Weapons->GetHold() != EBloodRitualWeaponHold::Ranged)
	{
		SetAiming(false);
	}
}

void ABloodRitualProtagonistCharacter::Attack()
{
	if (IsDead() || bRolling || Controller == nullptr)
	{
		return;
	}

	FVector ViewLocation;
	FRotator ViewRotation;
	Controller->GetPlayerViewPoint(ViewLocation, ViewRotation);
	const bool bRanged = Weapons->GetHold() == EBloodRitualWeaponHold::Ranged;
	if (bRanged)
	{
		// Shots go where the camera looks; he turns to face it first.
		SetActorRotation(FRotator(0.0f, ViewRotation.Yaw, 0.0f));
	}

	switch (Weapons->Attack(ViewLocation, ViewRotation.Vector()))
	{
	case EBloodRitualAttackResult::Swing:
		PlayUpperBodyAction(SwingClip, Weapons->GetSwingRate());
		break;
	case EBloodRitualAttackResult::Shot:
		PlayUpperBodyAction(ShootClip, BloodRitualProtagonistTuning::ShootPlayRate);
		break;
	case EBloodRitualAttackResult::DryFire:
		// An empty rifle reloads by itself if he carries rounds.
		Reload();
		break;
	default:
		break;
	}
}

void ABloodRitualProtagonistCharacter::Reload()
{
	if (IsDead() || bRolling || !Weapons->StartReload())
	{
		return;
	}
	const float Seconds = GetDefault<UBloodRitualSettings>()->RifleReloadSeconds;
	if (ReloadClip != nullptr && Seconds > 0.0f)
	{
		PlayUpperBodyAction(ReloadClip, ReloadClip->GetPlayLength() / Seconds);
	}
}

void ABloodRitualProtagonistCharacter::SetAiming(bool bNewAiming)
{
	bAiming = bNewAiming && !IsDead() && Weapons->GetHold() == EBloodRitualWeaponHold::Ranged;
}

void ABloodRitualProtagonistCharacter::UpdateAimCamera(float DeltaSeconds)
{
	if (bAiming && Weapons->GetHold() != EBloodRitualWeaponHold::Ranged)
	{
		bAiming = false;
	}
	const bool bFaceCamera = bAiming && !bRolling;
	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = !bFaceCamera;
	bUseControllerRotationYaw = bFaceCamera;
	if (!bRolling)
	{
		Movement->MaxWalkSpeed = bAiming ? BloodRitualProtagonistTuning::AimWalkSpeed : DefaultMaxWalkSpeed;
	}

	const float Alpha = FMath::Clamp(DeltaSeconds * BloodRitualProtagonistTuning::CameraEaseSpeed, 0.0f, 1.0f);
	const float WantedLength = bAiming ? BloodRitualProtagonistTuning::AimArmLength : BloodRitualProtagonistTuning::CameraArmLength;
	const FVector WantedOffset = bAiming ? BloodRitualProtagonistTuning::AimSocketOffset : BloodRitualProtagonistTuning::CameraSocketOffset;
	CameraBoom->TargetArmLength = FMath::Lerp(CameraBoom->TargetArmLength, WantedLength, Alpha);
	CameraBoom->SocketOffset = FMath::Lerp(CameraBoom->SocketOffset, WantedOffset, Alpha);
}

void ABloodRitualProtagonistCharacter::HandleDamaged(UBloodRitualHealthComponent* DamagedHealth, float Amount, AActor* DamageCauser)
{
	if (bRolling)
	{
		return;
	}
	// A flinch cuts a search or deposit short and any swing or reload; he can keep moving.
	Weapons->Interrupt();
	EndAction();
	PlayUpperBodyAction(HitClip, 1.0f);
}

void ABloodRitualProtagonistCharacter::HandleDied(UBloodRitualHealthComponent* DeadHealth, AActor* Killer)
{
	// The Animation Blueprint blends to the death clip once IsDead().
	EndAction();
	StopUpperBodyAction();
	Weapons->Interrupt();
	bAiming = false;
	UnCrouch();
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();
	const float Delay = FMath::Max(GetDefault<UBloodRitualSettings>()->PlayerRespawnDelaySeconds, 0.1f);
	GetWorldTimerManager().SetTimer(RespawnTimer, this, &ABloodRitualProtagonistCharacter::Respawn, Delay, false);
}

void ABloodRitualProtagonistCharacter::Respawn()
{
	AController* OwningController = GetController();
	UWorld* World = GetWorld();
	AGameModeBase* GameMode = World != nullptr ? World->GetAuthGameMode() : nullptr;
	if (OwningController == nullptr || GameMode == nullptr)
	{
		return;
	}
	OwningController->UnPossess();
	Destroy();
	GameMode->RestartPlayer(OwningController);
}

void ABloodRitualProtagonistCharacter::PlayAction(UAnimSequence* Clip, float PlayRate, float StartSeconds, float LockSeconds)
{
	EndAction();
	if (Clip == nullptr || PlayRate <= 0.0f || IsDead())
	{
		return;
	}

	ActionClip = Clip;
	ActionSecondsLeft = FMath::Max(Clip->GetPlayLength() - StartSeconds, 0.0f) / PlayRate;
	ActionLockSecondsLeft = LockSeconds;

	if (UAnimInstance* Anim = GetMesh()->GetAnimInstance())
	{
		const float Blend = BloodRitualProtagonistTuning::FullBodyBlendSeconds;
		Anim->PlaySlotAnimationAsDynamicMontage(Clip, BloodRitualAnimSlots::FullBody, Blend, Blend, PlayRate,
			/*LoopCount*/ 1, /*BlendOutTriggerTime*/ -1.0f, StartSeconds);
	}
}

void ABloodRitualProtagonistCharacter::EndAction()
{
	if (ActionClip != nullptr)
	{
		if (UAnimInstance* Anim = GetMesh()->GetAnimInstance())
		{
			Anim->StopSlotAnimation(BloodRitualProtagonistTuning::FullBodyBlendSeconds, BloodRitualAnimSlots::FullBody);
		}
	}
	ActionClip = nullptr;
	ActionSecondsLeft = 0.0f;
	ActionLockSecondsLeft = 0.0f;
	if (bRolling)
	{
		bRolling = false;
		GetCharacterMovement()->MaxWalkSpeed = DefaultMaxWalkSpeed;
	}
}

void ABloodRitualProtagonistCharacter::AdvanceAction(float DeltaSeconds)
{
	if (ActionClip == nullptr)
	{
		return;
	}

	ActionSecondsLeft -= DeltaSeconds;
	ActionLockSecondsLeft -= DeltaSeconds;

	if (bRolling)
	{
		if (ActionLockSecondsLeft > 0.0f)
		{
			AddMovementInput(RollDirection, 1.0f);
		}
		else
		{
			// Travel is over; the rest of the clip is getting up at normal speed.
			bRolling = false;
			GetCharacterMovement()->MaxWalkSpeed = DefaultMaxWalkSpeed;
		}
	}

	// The take-off clip gives way to the loop at the top of the jump.
	const bool bTakeOffDone = ActionClip == JumpStart && GetVelocity().Z <= 0.0f;
	if (ActionSecondsLeft <= 0.0f || bTakeOffDone)
	{
		EndAction();
	}
}

bool ABloodRitualProtagonistCharacter::ConsumeMovementForAction()
{
	if (IsDead())
	{
		return true;
	}
	if (ActionClip == nullptr)
	{
		return false;
	}
	if (ActionLockSecondsLeft > 0.0f)
	{
		return true;
	}
	// Steering in the air keeps the take-off clip; on the ground, moving ends any action.
	if (!GetCharacterMovement()->IsFalling())
	{
		EndAction();
	}
	return false;
}

void ABloodRitualProtagonistCharacter::PlayUpperBodyAction(UAnimSequence* Clip, float PlayRate)
{
	UAnimInstance* Anim = GetMesh()->GetAnimInstance();
	if (Clip == nullptr || PlayRate <= 0.0f || IsDead() || Anim == nullptr)
	{
		return;
	}
	const float Blend = BloodRitualProtagonistTuning::UpperBodyBlendSeconds;
	Anim->PlaySlotAnimationAsDynamicMontage(Clip, BloodRitualAnimSlots::UpperBody, Blend, Blend, PlayRate);
}

void ABloodRitualProtagonistCharacter::StopUpperBodyAction()
{
	if (UAnimInstance* Anim = GetMesh()->GetAnimInstance())
	{
		Anim->StopSlotAnimation(BloodRitualProtagonistTuning::UpperBodyBlendSeconds, BloodRitualAnimSlots::UpperBody);
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

	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::StartJump);
	PlayerInputComponent->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
	PlayerInputComponent->BindAction(TEXT("Crouch"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::ToggleCrouch);
	PlayerInputComponent->BindAction(TEXT("Roll"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::Roll);
	PlayerInputComponent->BindAction(TEXT("Interact"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::Interact);
	PlayerInputComponent->BindAction(TEXT("Attack"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::Attack);
	PlayerInputComponent->BindAction(TEXT("Aim"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::StartAiming);
	PlayerInputComponent->BindAction(TEXT("Aim"), IE_Released, this, &ABloodRitualProtagonistCharacter::StopAiming);
	PlayerInputComponent->BindAction(TEXT("Reload"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::Reload);
	PlayerInputComponent->BindAction(TEXT("WeaponTomahawk"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::SelectTomahawk);
	PlayerInputComponent->BindAction(TEXT("WeaponRockSledge"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::SelectRockSledge);
	PlayerInputComponent->BindAction(TEXT("WeaponBow"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::SelectBow);
	PlayerInputComponent->BindAction(TEXT("WeaponRifle"), IE_Pressed, this, &ABloodRitualProtagonistCharacter::SelectRifle);
}

void ABloodRitualProtagonistCharacter::MoveForward(float Value)
{
	if (Controller != nullptr && Value != 0.0f && !ConsumeMovementForAction())
	{
		// Move along the camera's yaw, ignoring its pitch, so looking down does not slow the pawn.
		const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
		AddMovementInput(Direction, Value);
	}
}

void ABloodRitualProtagonistCharacter::MoveRight(float Value)
{
	if (Controller != nullptr && Value != 0.0f && !ConsumeMovementForAction())
	{
		const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
		const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);
		AddMovementInput(Direction, Value);
	}
}

void ABloodRitualProtagonistCharacter::StartJump()
{
	if (IsDead() || bRolling)
	{
		return;
	}
	// Jumping is not possible crouched; the key stands him up instead.
	if (bIsCrouched)
	{
		UnCrouch();
		return;
	}
	EndAction();
	Jump();
}

void ABloodRitualProtagonistCharacter::Interact()
{
	if (IsDead() || bRolling || !Interaction->TryInteract())
	{
		return;
	}

	AActor* Target = Interaction->GetFocusedInteractable();
	if (Target == nullptr)
	{
		return;
	}
	FVector ToTarget = Target->GetActorLocation() - GetActorLocation();
	ToTarget.Z = 0.0f;
	if (!ToTarget.IsNearlyZero())
	{
		SetActorRotation(ToTarget.Rotation());
	}

	if (Target->IsA<ABloodRitualStockpile>())
	{
		PlayAction(DepositClip, 1.0f);
	}
	else if (Target->IsA<ABloodRitualSupplyContainer>() && SearchClip != nullptr)
	{
		// Stretched over the search, so he rummages until the supplies are his.
		const float SearchSeconds = GetDefault<UBloodRitualSettings>()->ContainerSearchDurationSeconds;
		if (SearchSeconds > 0.0f)
		{
			PlayAction(SearchClip, SearchClip->GetPlayLength() / SearchSeconds);
		}
	}
}
