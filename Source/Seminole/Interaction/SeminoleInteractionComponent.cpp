// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Interaction/SeminoleInteractionComponent.h"

#include "SeminoleSettings.h"
#include "Interaction/SeminoleInteractable.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"

USeminoleInteractionComponent::USeminoleInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

void USeminoleInteractionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	FindBestInteractable();
}

FText USeminoleInteractionComponent::GetFocusedPrompt() const
{
	const ISeminoleInteractable* Interactable = Cast<ISeminoleInteractable>(FocusedInteractable.Get());
	return Interactable != nullptr ? Interactable->GetInteractionPrompt(GetOwner()) : FText::GetEmpty();
}

bool USeminoleInteractionComponent::TryInteract()
{
	AActor* Target = FindBestInteractable();
	ISeminoleInteractable* Interactable = Cast<ISeminoleInteractable>(Target);
	if (Interactable == nullptr || !Interactable->CanInteract(GetOwner()))
	{
		return false;
	}
	Interactable->Interact(GetOwner());
	return true;
}

AActor* USeminoleInteractionComponent::FindBestInteractable()
{
	FocusedInteractable = nullptr;

	const AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (Owner == nullptr || World == nullptr)
	{
		return nullptr;
	}

	const FVector OwnerLocation = Owner->GetActorLocation();
	float BestDistanceSquared = FMath::Square(GetDefault<USeminoleSettings>()->InteractionRange);
	AActor* Best = nullptr;

	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Candidate = *It;
		if (Candidate == Owner || Cast<ISeminoleInteractable>(Candidate) == nullptr)
		{
			continue;
		}
		const float DistanceSquared = FVector::DistSquared(OwnerLocation, Candidate->GetActorLocation());
		if (DistanceSquared <= BestDistanceSquared)
		{
			BestDistanceSquared = DistanceSquared;
			Best = Candidate;
		}
	}

	FocusedInteractable = Best;
	return Best;
}
