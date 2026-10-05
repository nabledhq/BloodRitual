// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Interaction/SeminoleInteractionComponent.h"

#include "SeminoleSettings.h"
#include "Interaction/SeminoleInteractable.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"

USeminoleInteractionComponent::USeminoleInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

AActor* USeminoleInteractionComponent::FindFocusedInteractable() const
{
	AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (Owner == nullptr || World == nullptr)
	{
		return nullptr;
	}

	const float Range = GetDefault<USeminoleSettings>()->InteractionRange;
	const FVector OwnerLocation = Owner->GetActorLocation();

	AActor* Best = nullptr;
	float BestDistanceSquared = Range * Range;
	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Candidate = *It;
		if (Candidate == Owner || !Candidate->GetClass()->ImplementsInterface(USeminoleInteractable::StaticClass()))
		{
			continue;
		}

		const float DistanceSquared = FVector::DistSquared(OwnerLocation, Candidate->GetActorLocation());
		if (DistanceSquared > BestDistanceSquared)
		{
			continue;
		}

		const ISeminoleInteractable* Interactable = Cast<ISeminoleInteractable>(Candidate);
		if (Interactable != nullptr && Interactable->CanInteract(Owner))
		{
			Best = Candidate;
			BestDistanceSquared = DistanceSquared;
		}
	}
	return Best;
}

bool USeminoleInteractionComponent::TryInteract()
{
	AActor* Target = FindFocusedInteractable();
	if (Target == nullptr)
	{
		return false;
	}

	if (ISeminoleInteractable* Interactable = Cast<ISeminoleInteractable>(Target))
	{
		Interactable->Interact(GetOwner());
		return true;
	}
	return false;
}
