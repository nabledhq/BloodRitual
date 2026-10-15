// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "AI/BloodRitualInfected.h"

#include "AI/BloodRitualInfectedController.h"
#include "BloodRitualSettings.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "World/BloodRitualNoiseSubsystem.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Animation/BlendSpace.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace BloodRitualInfectedTuning
{
	// The punch clip (Quaternius "Punch_Cross") is at full reach 0.27 s in.
	constexpr float PunchRate = 0.9f;
	constexpr float PunchContactSeconds = 0.27f / PunchRate;
	// A blow lands if the target is still this much beyond the attack range.
	constexpr float BlowReachSlack = 60.0f;
	constexpr float HitReactionRate = 1.0f;
	// Hears with its head; noise radii are measured to here.
	constexpr float EarHeight = 60.0f;
	const FName SkinSlot(TEXT("M_Infected_Skin"));
	// MI_Infected_Skin's tint (scripts/editor/import_protagonist.py), varied per infected.
	const FLinearColor SkinTint(1.15f, 1.3f, 1.05f);
}

ABloodRitualInfected::ABloodRitualInfected()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(34.0f, 88.0f);
	AIControllerClass = ABloodRitualInfectedController::StaticClass();
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;

	bUseControllerRotationYaw = false;
	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.0f, 360.0f, 0.0f);
	Movement->MaxWalkSpeed = GetDefault<UBloodRitualSettings>()->InfectedWalkSpeed;
	// Crowds part around each other instead of piling up.
	Movement->bUseRVOAvoidance = true;
	Movement->AvoidanceConsiderationRadius = 200.0f;

	Health = CreateDefaultSubobject<UBloodRitualHealthComponent>(TEXT("Health"));

	ConstructorHelpers::FObjectFinder<USkeletalMesh> BodyFinder(TEXT("/Game/Characters/Infected/SKM_Infected.SKM_Infected"));
	ConstructorHelpers::FObjectFinder<UBlendSpace> LocomotionFinder(TEXT("/Game/Characters/Protagonist/Animations/BS_Locomotion.BS_Locomotion"));
	ConstructorHelpers::FObjectFinder<UAnimSequence> PunchFinder(TEXT("/Game/Characters/Protagonist/Animations/A_Punch_Cross.A_Punch_Cross"));
	ConstructorHelpers::FObjectFinder<UAnimSequence> HitFinder(TEXT("/Game/Characters/Protagonist/Animations/A_Hit_Chest.A_Hit_Chest"));
	ConstructorHelpers::FObjectFinder<UAnimSequence> DeathFinder(TEXT("/Game/Characters/Protagonist/Animations/A_Death01.A_Death01"));
	if (BodyFinder.Succeeded())
	{
		// Same layout as the Protagonist: feet at the origin, facing +Y.
		GetMesh()->SetSkeletalMeshAsset(BodyFinder.Object);
		GetMesh()->SetRelativeLocationAndRotation(FVector(0.0f, 0.0f, -88.0f), FRotator(0.0f, -90.0f, 0.0f));
		GetMesh()->SetAnimationMode(EAnimationMode::AnimationSingleNode);
		LocomotionBlendSpace = LocomotionFinder.Object;
		PunchClip = PunchFinder.Object;
		HitClip = HitFinder.Object;
		DeathClip = DeathFinder.Object;
	}
}

void ABloodRitualInfected::BeginPlay()
{
	Super::BeginPlay();

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	Health->SetMaxHealth(Settings->InfectedMaxHealth);
	Health->OnDamaged.AddUniqueDynamic(this, &ABloodRitualInfected::HandleDamaged);
	Health->OnDied.AddUniqueDynamic(this, &ABloodRitualInfected::HandleDied);

	if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
	{
		Noise->RegisterListener(this);
		bListening = true;
	}

	// Each one a slightly different sickly shade.
	USkeletalMeshComponent* Body = GetMesh();
	const int32 SkinIndex = Body->GetMaterialIndex(BloodRitualInfectedTuning::SkinSlot);
	if (SkinIndex != INDEX_NONE)
	{
		if (UMaterialInstanceDynamic* Skin = Body->CreateDynamicMaterialInstance(SkinIndex))
		{
			const float Shade = FMath::FRandRange(0.85f, 1.1f);
			const FLinearColor& Base = BloodRitualInfectedTuning::SkinTint;
			Skin->SetVectorParameterValue(TEXT("Tint"), FLinearColor(Base.R * Shade, Base.G * Shade, Base.B * Shade * FMath::FRandRange(0.9f, 1.1f)));
		}
	}
	UpdateAnimation();
}

void ABloodRitualInfected::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (bListening)
	{
		if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
		{
			Noise->UnregisterListener(this);
		}
		bListening = false;
	}
	Super::EndPlay(EndPlayReason);
}

void ABloodRitualInfected::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (IsDead())
	{
		return;
	}
	if (BlowContactSecondsLeft >= 0.0f)
	{
		BlowContactSecondsLeft -= DeltaSeconds;
		if (BlowContactSecondsLeft < 0.0f)
		{
			LandBlow();
		}
	}
	if (ActionClip != nullptr)
	{
		ActionSecondsLeft -= DeltaSeconds;
		if (ActionSecondsLeft <= 0.0f)
		{
			ActionClip = nullptr;
		}
	}
	UpdateAnimation();
}

FVector ABloodRitualInfected::GetNoiseListenerLocation() const
{
	return GetActorLocation() + FVector(0.0f, 0.0f, BloodRitualInfectedTuning::EarHeight);
}

void ABloodRitualInfected::OnNoiseHeard(const FBloodRitualNoiseEvent& Noise)
{
	if (ABloodRitualInfectedController* Brain = Cast<ABloodRitualInfectedController>(GetController()))
	{
		Brain->HearNoise(Noise.Location, Noise.Instigator);
	}
}

bool ABloodRitualInfected::IsDead() const
{
	return Health != nullptr && Health->IsDead();
}

bool ABloodRitualInfected::Attack(AActor* Target)
{
	if (IsDead() || IsBusy() || Target == nullptr)
	{
		return false;
	}
	FVector ToTarget = Target->GetActorLocation() - GetActorLocation();
	ToTarget.Z = 0.0f;
	if (!ToTarget.IsNearlyZero())
	{
		SetActorRotation(ToTarget.Rotation());
	}
	BlowTarget = Target;
	BlowContactSecondsLeft = BloodRitualInfectedTuning::PunchContactSeconds;
	PlayAction(PunchClip, BloodRitualInfectedTuning::PunchRate);
	return true;
}

void ABloodRitualInfected::LandBlow()
{
	AActor* Target = BlowTarget.Get();
	BlowTarget = nullptr;
	if (Target == nullptr)
	{
		return;
	}
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	const FVector ToTarget = Target->GetActorLocation() - GetActorLocation();
	const bool bInReach = ToTarget.Size2D() <= Settings->InfectedAttackRange + BloodRitualInfectedTuning::BlowReachSlack;
	const bool bInFront = FVector::DotProduct(ToTarget.GetSafeNormal2D(), GetActorForwardVector()) > 0.3f;
	if (bInReach && bInFront)
	{
		UGameplayStatics::ApplyDamage(Target, Settings->InfectedAttackDamage, GetController(), this, UDamageType::StaticClass());
	}
}

void ABloodRitualInfected::HandleDamaged(UBloodRitualHealthComponent* DamagedHealth, float Amount, AActor* DamageCauser)
{
	// A flinch interrupts its blow.
	BlowContactSecondsLeft = -1.0f;
	BlowTarget = nullptr;
	PlayAction(HitClip, BloodRitualInfectedTuning::HitReactionRate);

	AActor* Attacker = DamageCauser != nullptr && DamageCauser->GetInstigator() != nullptr ? DamageCauser->GetInstigator() : DamageCauser;
	if (ABloodRitualInfectedController* Brain = Cast<ABloodRitualInfectedController>(GetController()))
	{
		Brain->NotifyAttacked(Attacker);
	}
}

void ABloodRitualInfected::HandleDied(UBloodRitualHealthComponent* DeadHealth, AActor* Killer)
{
	BlowContactSecondsLeft = -1.0f;
	ActionClip = nullptr;
	if (ABloodRitualInfectedController* Brain = Cast<ABloodRitualInfectedController>(GetController()))
	{
		Brain->NotifyDied();
	}
	if (bListening)
	{
		if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
		{
			Noise->UnregisterListener(this);
		}
		bListening = false;
	}

	// The body stays where it fell, out of everyone's way.
	GetCharacterMovement()->StopMovementImmediately();
	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (DeathClip != nullptr)
	{
		GetMesh()->PlayAnimation(DeathClip, /*bLooping*/ false);
	}
	SetLifeSpan(FMath::Max(GetDefault<UBloodRitualSettings>()->InfectedCorpseSeconds, 0.1f));
}

void ABloodRitualInfected::PlayAction(UAnimSequence* Clip, float PlayRate)
{
	if (Clip == nullptr || PlayRate <= 0.0f || IsDead())
	{
		return;
	}
	ActionClip = Clip;
	ActionSecondsLeft = Clip->GetPlayLength() / PlayRate;
	USkeletalMeshComponent* Body = GetMesh();
	Body->PlayAnimation(Clip, /*bLooping*/ false);
	if (UAnimSingleNodeInstance* Node = Body->GetSingleNodeInstance())
	{
		Node->SetPlayRate(PlayRate);
	}
}

void ABloodRitualInfected::UpdateAnimation()
{
	if (LocomotionBlendSpace == nullptr || IsDead() || ActionClip != nullptr)
	{
		return;
	}
	USkeletalMeshComponent* Body = GetMesh();
	UAnimSingleNodeInstance* Node = Body->GetSingleNodeInstance();
	if (Node == nullptr || Node->GetAnimationAsset() != LocomotionBlendSpace)
	{
		Body->PlayAnimation(LocomotionBlendSpace, /*bLooping*/ true);
		Node = Body->GetSingleNodeInstance();
	}
	if (Node != nullptr)
	{
		Node->SetPlayRate(1.0f);
		Node->SetBlendSpacePosition(FVector(GetVelocity().Size2D(), 0.0f, 0.0f));
	}
}
