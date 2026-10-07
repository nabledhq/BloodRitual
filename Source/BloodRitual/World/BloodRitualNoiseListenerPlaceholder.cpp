// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "World/BloodRitualNoiseListenerPlaceholder.h"

#include "BloodRitual.h"
#include "BloodRitualPlaceholderVisuals.h"
#include "World/BloodRitualNoiseSubsystem.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	const FLinearColor IdleColor(0.8f, 0.1f, 0.1f);
	const FLinearColor HeardColor(1.0f, 0.9f, 0.2f);
	constexpr float FlashSeconds = 1.0f;
}

ABloodRitualNoiseListenerPlaceholder::ABloodRitualNoiseListenerPlaceholder()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetMobility(EComponentMobility::Movable);
	Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Mesh->SetCanEverAffectNavigation(false);
	ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	if (SphereFinder.Succeeded())
	{
		Mesh->SetStaticMesh(SphereFinder.Object);
	}
}

void ABloodRitualNoiseListenerPlaceholder::BeginPlay()
{
	Super::BeginPlay();

	BloodRitualPlaceholderVisuals::SetColor(Mesh, IdleColor);
	if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
	{
		Noise->RegisterListener(this);
	}
}

void ABloodRitualNoiseListenerPlaceholder::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
	{
		Noise->UnregisterListener(this);
	}
	Super::EndPlay(EndPlayReason);
}

FVector ABloodRitualNoiseListenerPlaceholder::GetNoiseListenerLocation() const
{
	return GetActorLocation();
}

void ABloodRitualNoiseListenerPlaceholder::OnNoiseHeard(const FBloodRitualNoiseEvent& Noise)
{
	++HeardNoiseCount;
	LastNoise = Noise;

	UE_LOG(LogBloodRitual, Log, TEXT("%s heard noise #%d from %s at %s (radius %.0f, distance %.0f)."),
		*GetName(), HeardNoiseCount,
		Noise.Instigator != nullptr ? *Noise.Instigator->GetName() : TEXT("<none>"),
		*Noise.Location.ToString(), Noise.Radius, FVector::Dist(Noise.Location, GetActorLocation()));

	BloodRitualPlaceholderVisuals::SetColor(Mesh, HeardColor);
	if (GetWorld() != nullptr)
	{
		GetWorldTimerManager().SetTimer(FlashTimerHandle, this, &ABloodRitualNoiseListenerPlaceholder::RestoreIdleColor, FlashSeconds, false);
	}
}

void ABloodRitualNoiseListenerPlaceholder::RestoreIdleColor()
{
	BloodRitualPlaceholderVisuals::SetColor(Mesh, IdleColor);
}
