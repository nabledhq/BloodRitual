// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Interaction/BloodRitualInteractionComponent.h"

#include "BloodRitualSettings.h"
#include "Interaction/BloodRitualInteractable.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"

UBloodRitualInteractionComponent::UBloodRitualInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

void UBloodRitualInteractionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	FindBestInteractable();
}

FText UBloodRitualInteractionComponent::GetFocusedPrompt() const
{
	const IBloodRitualInteractable* Interactable = Cast<IBloodRitualInteractable>(FocusedInteractable.Get());
	return Interactable != nullptr ? Interactable->GetInteractionPrompt(GetOwner()) : FText::GetEmpty();
}

bool UBloodRitualInteractionComponent::TryInteract()
{
	AActor* Target = FindBestInteractable();
	IBloodRitualInteractable* Interactable = Cast<IBloodRitualInteractable>(Target);
	if (Interactable == nullptr || !Interactable->CanInteract(GetOwner()))
	{
		return false;
	}
	Interactable->Interact(GetOwner());
	return true;
}

AActor* UBloodRitualInteractionComponent::FindBestInteractable()
{
	FocusedInteractable = nullptr;

	const AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (Owner == nullptr || World == nullptr)
	{
		return nullptr;
	}

	const FVector OwnerLocation = Owner->GetActorLocation();
	float BestDistanceSquared = FMath::Square(GetDefault<UBloodRitualSettings>()->InteractionRange);
	AActor* Best = nullptr;

	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Candidate = *It;
		if (Candidate == Owner || Cast<IBloodRitualInteractable>(Candidate) == nullptr)
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
