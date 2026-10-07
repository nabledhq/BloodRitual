// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "World/BloodRitualNoiseSubsystem.h"

#include "BloodRitual.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

UBloodRitualNoiseSubsystem* UBloodRitualNoiseSubsystem::Get(const UObject* WorldContextObject)
{
	if (WorldContextObject == nullptr)
	{
		return nullptr;
	}
	const UWorld* World = WorldContextObject->GetWorld();
	return World != nullptr ? World->GetSubsystem<UBloodRitualNoiseSubsystem>() : nullptr;
}

void UBloodRitualNoiseSubsystem::EmitNoise(const FVector& Location, float Radius, AActor* Instigator)
{
	FBloodRitualNoiseEvent Noise;
	Noise.Location = Location;
	Noise.Radius = Radius;
	Noise.Instigator = Instigator;

	const float RadiusSquared = FMath::Square(FMath::Max(Radius, 0.0f));
	int32 HeardBy = 0;

	// Iterate a copy so a listener may register or unregister from inside OnNoiseHeard.
	const TArray<TWeakObjectPtr<UObject>> Snapshot = Listeners;
	for (const TWeakObjectPtr<UObject>& WeakListener : Snapshot)
	{
		UObject* ListenerObject = WeakListener.Get();
		if (ListenerObject == nullptr)
		{
			continue;
		}
		IBloodRitualNoiseListener* Listener = Cast<IBloodRitualNoiseListener>(ListenerObject);
		if (Listener == nullptr)
		{
			continue;
		}
		if (FVector::DistSquared(Listener->GetNoiseListenerLocation(), Location) <= RadiusSquared)
		{
			Listener->OnNoiseHeard(Noise);
			++HeardBy;
		}
	}

	// Drop listeners that were destroyed without unregistering.
	Listeners.RemoveAll([](const TWeakObjectPtr<UObject>& WeakListener) { return !WeakListener.IsValid(); });

	UE_LOG(LogBloodRitual, Verbose, TEXT("BloodRitualNoise: %s emitted noise at %s, radius %.0f, heard by %d of %d listeners."),
		Instigator != nullptr ? *Instigator->GetName() : TEXT("<none>"), *Location.ToString(), Radius, HeardBy, Listeners.Num());

	OnNoiseEmitted.Broadcast(Noise);
}

void UBloodRitualNoiseSubsystem::RegisterListener(UObject* Listener)
{
	if (Listener == nullptr || Cast<IBloodRitualNoiseListener>(Listener) == nullptr)
	{
		UE_LOG(LogBloodRitual, Warning, TEXT("BloodRitualNoise: %s does not implement IBloodRitualNoiseListener and was not registered."),
			Listener != nullptr ? *Listener->GetName() : TEXT("<null>"));
		return;
	}
	Listeners.AddUnique(TWeakObjectPtr<UObject>(Listener));
}

void UBloodRitualNoiseSubsystem::UnregisterListener(UObject* Listener)
{
	Listeners.Remove(TWeakObjectPtr<UObject>(Listener));
}
