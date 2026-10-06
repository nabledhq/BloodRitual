// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "World/SeminoleNoiseListenerPlaceholder.h"

#include "Seminole.h"
#include "SeminolePlaceholderVisuals.h"
#include "World/SeminoleNoiseSubsystem.h"
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

ASeminoleNoiseListenerPlaceholder::ASeminoleNoiseListenerPlaceholder()
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

void ASeminoleNoiseListenerPlaceholder::BeginPlay()
{
	Super::BeginPlay();

	SeminolePlaceholderVisuals::SetColor(Mesh, IdleColor);
	if (USeminoleNoiseSubsystem* Noise = USeminoleNoiseSubsystem::Get(this))
	{
		Noise->RegisterListener(this);
	}
}

void ASeminoleNoiseListenerPlaceholder::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (USeminoleNoiseSubsystem* Noise = USeminoleNoiseSubsystem::Get(this))
	{
		Noise->UnregisterListener(this);
	}
	Super::EndPlay(EndPlayReason);
}

FVector ASeminoleNoiseListenerPlaceholder::GetNoiseListenerLocation() const
{
	return GetActorLocation();
}

void ASeminoleNoiseListenerPlaceholder::OnNoiseHeard(const FSeminoleNoiseEvent& Noise)
{
	++HeardNoiseCount;
	LastNoise = Noise;

	UE_LOG(LogSeminole, Log, TEXT("%s heard noise #%d from %s at %s (radius %.0f, distance %.0f)."),
		*GetName(), HeardNoiseCount,
		Noise.Instigator != nullptr ? *Noise.Instigator->GetName() : TEXT("<none>"),
		*Noise.Location.ToString(), Noise.Radius, FVector::Dist(Noise.Location, GetActorLocation()));

	SeminolePlaceholderVisuals::SetColor(Mesh, HeardColor);
	if (GetWorld() != nullptr)
	{
		GetWorldTimerManager().SetTimer(FlashTimerHandle, this, &ASeminoleNoiseListenerPlaceholder::RestoreIdleColor, FlashSeconds, false);
	}
}

void ASeminoleNoiseListenerPlaceholder::RestoreIdleColor()
{
	SeminolePlaceholderVisuals::SetColor(Mesh, IdleColor);
}
