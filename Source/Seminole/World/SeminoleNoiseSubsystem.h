// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "World/SeminoleNoiseListener.h"
#include "SeminoleNoiseSubsystem.generated.h"

DECLARE_MULTICAST_DELEGATE_OneParam(FSeminoleNoiseEmitted, const FSeminoleNoiseEvent&);

/**
 * The one shared noise event of the game (ADR 0004). Everything that makes noise calls
 * EmitNoise; every registered ISeminoleNoiseListener within the radius hears it.
 *
 * Delivery is a plain 3D distance test against each listener's location. AI Perception
 * forwarding, attenuation and tags are deferred to the infected ticket (part 2), which also
 * registers the infected as listeners. Audio and UI can bind OnNoiseEmitted, which fires for
 * every noise regardless of listeners.
 */
UCLASS()
class SEMINOLE_API USeminoleNoiseSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	/** Convenience accessor; returns null without a world. */
	static USeminoleNoiseSubsystem* Get(const UObject* WorldContextObject);

	/** Delivers the noise to every registered listener within Radius of Location. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Noise")
	void EmitNoise(const FVector& Location, float Radius, AActor* Instigator);

	/** Listener must implement ISeminoleNoiseListener; registering twice has no extra effect. */
	void RegisterListener(UObject* Listener);
	void UnregisterListener(UObject* Listener);

	int32 GetListenerCount() const { return Listeners.Num(); }

	/** Broadcast after listener delivery for every emitted noise. */
	FSeminoleNoiseEmitted OnNoiseEmitted;

private:
	/** Weak so a destroyed listener that forgot to unregister is skipped and dropped. */
	TArray<TWeakObjectPtr<UObject>> Listeners;
};
