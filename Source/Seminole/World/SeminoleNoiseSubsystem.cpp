// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "World/SeminoleNoiseSubsystem.h"

#include "Seminole.h"
#include "GameFramework/Actor.h"

int32 USeminoleNoiseSubsystem::EmitNoise(const FVector& Location, float Radius, AActor* Instigator)
{
	FSeminoleNoiseEvent Noise;
	Noise.Location = Location;
	Noise.Radius = FMath::Max(Radius, 0.0f);
	Noise.Instigator = Instigator;

	// Collect first, then notify: a listener may unregister itself (or others) while handling the event.
	TArray<ISeminoleNoiseListener*> Hearers;
	const float RadiusSquared = Noise.Radius * Noise.Radius;
	for (int32 Index = Listeners.Num() - 1; Index >= 0; --Index)
	{
		UObject* ListenerObject = Listeners[Index].Get();
		ISeminoleNoiseListener* Listener = Cast<ISeminoleNoiseListener>(ListenerObject);
		if (Listener == nullptr)
		{
			Listeners.RemoveAtSwap(Index);
			continue;
		}

		if (FVector::DistSquared(Listener->GetNoiseListenerLocation(), Noise.Location) <= RadiusSquared)
		{
			Hearers.Add(Listener);
		}
	}

	for (ISeminoleNoiseListener* Listener : Hearers)
	{
		Listener->OnNoiseHeard(Noise);
	}

	UE_LOG(LogSeminole, Verbose, TEXT("SeminoleNoise: %s emitted noise at %s, radius %.0f; %d of %d listeners heard it."),
		Instigator ? *Instigator->GetName() : TEXT("(none)"), *Location.ToString(), Noise.Radius, Hearers.Num(), Listeners.Num());

	OnNoiseEmitted.Broadcast(Noise);
	return Hearers.Num();
}

void USeminoleNoiseSubsystem::RegisterListener(UObject* ListenerObject)
{
	if (ListenerObject == nullptr)
	{
		return;
	}
	if (Cast<ISeminoleNoiseListener>(ListenerObject) == nullptr)
	{
		UE_LOG(LogSeminole, Warning, TEXT("SeminoleNoise: %s does not implement ISeminoleNoiseListener and was not registered."), *ListenerObject->GetName());
		return;
	}
	Listeners.AddUnique(TWeakObjectPtr<UObject>(ListenerObject));
}

void USeminoleNoiseSubsystem::UnregisterListener(UObject* ListenerObject)
{
	if (ListenerObject != nullptr)
	{
		Listeners.RemoveSwap(TWeakObjectPtr<UObject>(ListenerObject));
	}
}

bool USeminoleNoiseSubsystem::IsListenerRegistered(const UObject* ListenerObject) const
{
	return ListenerObject != nullptr && Listeners.Contains(TWeakObjectPtr<UObject>(const_cast<UObject*>(ListenerObject)));
}
