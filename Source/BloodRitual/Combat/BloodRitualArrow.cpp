// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Combat/BloodRitualArrow.h"

#include "BloodRitualSettings.h"
#include "Combat/BloodRitualWeaponComponent.h"
#include "Combat/BloodRitualWeaponTypes.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/DamageType.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"

namespace BloodRitualArrowTuning
{
	constexpr float TipRadius = 3.0f;
	constexpr float GravityScale = 0.5f;
	constexpr float LifeSeconds = 20.0f;
}

ABloodRitualArrow::ABloodRitualArrow()
{
	PrimaryActorTick.bCanEverTick = false;
	InitialLifeSpan = BloodRitualArrowTuning::LifeSeconds;

	Tip = CreateDefaultSubobject<USphereComponent>(TEXT("Tip"));
	Tip->InitSphereRadius(BloodRitualArrowTuning::TipRadius);
	// Blocked by the world and by character capsules; ignores cameras and other arrows' traces.
	Tip->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Tip->SetCollisionObjectType(ECC_WorldDynamic);
	Tip->SetCollisionResponseToAllChannels(ECR_Ignore);
	Tip->SetCollisionResponseToChannel(ECC_WorldStatic, ECR_Block);
	Tip->SetCollisionResponseToChannel(ECC_WorldDynamic, ECR_Block);
	Tip->SetCollisionResponseToChannel(ECC_Pawn, ECR_Block);
	Tip->SetCanEverAffectNavigation(false);
	RootComponent = Tip;

	// SM_Arrow points along +X with its tip at its origin.
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Tip);
	Mesh->SetCollisionProfileName(UCollisionProfile::NoCollision_ProfileName);
	Mesh->SetCanEverAffectNavigation(false);
	ConstructorHelpers::FObjectFinder<UStaticMesh> ArrowFinder(TEXT("/Game/Weapons/SM_Arrow.SM_Arrow"));
	if (ArrowFinder.Succeeded())
	{
		Mesh->SetStaticMesh(ArrowFinder.Object);
	}

	Movement = CreateDefaultSubobject<UProjectileMovementComponent>(TEXT("Movement"));
	Movement->UpdatedComponent = Tip;
	Movement->bRotationFollowsVelocity = true;
	Movement->bShouldBounce = false;
	Movement->ProjectileGravityScale = BloodRitualArrowTuning::GravityScale;
	Movement->bAutoActivate = false;
}

void ABloodRitualArrow::Launch(const FVector& Velocity, float InDamage, UBloodRitualWeaponComponent* InShooter)
{
	Damage = InDamage;
	Shooter = InShooter;
	if (AActor* ShooterActor = GetOwner())
	{
		Tip->IgnoreActorWhenMoving(ShooterActor, true);
	}
	Movement->OnProjectileStop.AddUniqueDynamic(this, &ABloodRitualArrow::HandleStop);
	Movement->Velocity = Velocity;
	Movement->InitialSpeed = Velocity.Size();
	Movement->MaxSpeed = Velocity.Size();
	Movement->Activate(true);
}

void ABloodRitualArrow::HandleStop(const FHitResult& Hit)
{
	AActor* Target = Hit.GetActor();
	const UBloodRitualHealthComponent* TargetHealth = Target != nullptr ? Target->FindComponentByClass<UBloodRitualHealthComponent>() : nullptr;
	if (TargetHealth != nullptr && !TargetHealth->IsDead())
	{
		const float Multiplier = BloodRitualWeapons::IsHeadshot(Target, Hit.ImpactPoint) ? GetDefault<UBloodRitualSettings>()->HeadshotMultiplier : 1.0f;
		AActor* ShooterActor = GetOwner();
		UGameplayStatics::ApplyDamage(Target, Damage * Multiplier, GetInstigatorController(), ShooterActor != nullptr ? ShooterActor : this, UDamageType::StaticClass());
		if (UBloodRitualWeaponComponent* Weapons = Shooter.Get())
		{
			Weapons->NotifyHit();
		}
	}

	// Stick where it struck.
	Tip->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (USceneComponent* Struck = Hit.GetComponent())
	{
		AttachToComponent(Struck, FAttachmentTransformRules::KeepWorldTransform);
	}
}
