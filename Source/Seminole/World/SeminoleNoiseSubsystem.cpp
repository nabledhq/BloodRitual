// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "World/SeminoleNoiseSubsystem.h"

#include "Seminole.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

USeminoleNoiseSubsystem* USeminoleNoiseSubsystem::Get(const UObject* WorldContextObject)
{
	if (WorldContextObject == nullptr)
	{
		return nullptr;
	}
	const UWorld* World = WorldContextObject->GetWorld();
	return World != nullptr ? World->GetSubsystem<USeminoleNoiseSubsystem>() : nullptr;
}

void USeminoleNoiseSubsystem::EmitNoise(const FVector& Location, float Radius, AActor* Instigator)
{
	FSeminoleNoiseEvent Noise;
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
		ISeminoleNoiseListener* Listener = Cast<ISeminoleNoiseListener>(ListenerObject);
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

	UE_LOG(LogSeminole, Verbose, TEXT("SeminoleNoise: %s emitted noise at %s, radius %.0f, heard by %d of %d listeners."),
		Instigator != nullptr ? *Instigator->GetName() : TEXT("<none>"), *Location.ToString(), Radius, HeardBy, Listeners.Num());

	OnNoiseEmitted.Broadcast(Noise);
}

void USeminoleNoiseSubsystem::RegisterListener(UObject* Listener)
{
	if (Listener == nullptr || Cast<ISeminoleNoiseListener>(Listener) == nullptr)
	{
		UE_LOG(LogSeminole, Warning, TEXT("SeminoleNoise: %s does not implement ISeminoleNoiseListener and was not registered."),
			Listener != nullptr ? *Listener->GetName() : TEXT("<null>"));
		return;
	}
	Listeners.AddUnique(Listener);
}

void USeminoleNoiseSubsystem::UnregisterListener(UObject* Listener)
{
	Listeners.Remove(Listener);
}
