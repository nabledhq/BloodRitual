// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "World/SeminoleNoiseListenerPlaceholder.h"

#include "Seminole.h"
#include "SeminolePlaceholderVisuals.h"
#include "World/SeminoleNoiseSubsystem.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"

ASeminoleNoiseListenerPlaceholder::ASeminoleNoiseListenerPlaceholder()
{
	PrimaryActorTick.bCanEverTick = false;

	// A plain scene root keeps the actor location on the floor while the mesh sits above it.
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(RootComponent);
	Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Mesh->SetCanEverAffectNavigation(false);
	ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	if (SphereFinder.Succeeded())
	{
		Mesh->SetStaticMesh(SphereFinder.Object);
	}
	// The engine sphere is 1 m across; raise it so it rests on the floor.
	Mesh->SetRelativeLocation(FVector(0.0f, 0.0f, 50.0f));
}

void ASeminoleNoiseListenerPlaceholder::BeginPlay()
{
	Super::BeginPlay();

	SeminoleTintPlaceholderMesh(Mesh, FLinearColor(0.1f, 0.1f, 0.6f));

	if (USeminoleNoiseSubsystem* NoiseSubsystem = GetWorld()->GetSubsystem<USeminoleNoiseSubsystem>())
	{
		NoiseSubsystem->RegisterListener(this);
	}
}

void ASeminoleNoiseListenerPlaceholder::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UWorld* World = GetWorld())
	{
		if (USeminoleNoiseSubsystem* NoiseSubsystem = World->GetSubsystem<USeminoleNoiseSubsystem>())
		{
			NoiseSubsystem->UnregisterListener(this);
		}
	}

	Super::EndPlay(EndPlayReason);
}

FVector ASeminoleNoiseListenerPlaceholder::GetNoiseListenerLocation() const
{
	return GetActorLocation();
}

void ASeminoleNoiseListenerPlaceholder::OnNoiseHeard(const FSeminoleNoiseEvent& Noise)
{
	LastHeardNoise = Noise;
	++HeardNoiseCount;

	SeminoleTintPlaceholderMesh(Mesh, FLinearColor(0.8f, 0.05f, 0.05f));
	UE_LOG(LogSeminole, Log, TEXT("%s heard noise #%d from %s at %s (radius %.0f)."), *GetName(), HeardNoiseCount,
		Noise.Instigator ? *Noise.Instigator->GetName() : TEXT("(none)"), *Noise.Location.ToString(), Noise.Radius);
}
