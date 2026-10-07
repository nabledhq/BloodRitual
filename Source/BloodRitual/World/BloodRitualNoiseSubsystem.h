// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "World/BloodRitualNoiseListener.h"
#include "BloodRitualNoiseSubsystem.generated.h"

DECLARE_MULTICAST_DELEGATE_OneParam(FBloodRitualNoiseEmitted, const FBloodRitualNoiseEvent&);

/**
 * The one shared noise event of the game (ADR 0004). Everything that makes noise calls
 * EmitNoise; every registered IBloodRitualNoiseListener within the radius hears it.
 *
 * Delivery is a plain 3D distance test against each listener's location. AI Perception
 * forwarding, attenuation and tags are deferred to the infected ticket (part 2), which also
 * registers the infected as listeners. Audio and UI can bind OnNoiseEmitted, which fires for
 * every noise regardless of listeners.
 */
UCLASS()
class BLOODRITUAL_API UBloodRitualNoiseSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	/** Convenience accessor; returns null without a world. */
	static UBloodRitualNoiseSubsystem* Get(const UObject* WorldContextObject);

	/** Delivers the noise to every registered listener within Radius of Location. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Noise")
	void EmitNoise(const FVector& Location, float Radius, AActor* Instigator);

	/** Listener must implement IBloodRitualNoiseListener; registering twice has no extra effect. */
	void RegisterListener(UObject* Listener);
	void UnregisterListener(UObject* Listener);

	int32 GetListenerCount() const { return Listeners.Num(); }

	/** Broadcast after listener delivery for every emitted noise. */
	FBloodRitualNoiseEmitted OnNoiseEmitted;

private:
	/** Weak so a destroyed listener that forgot to unregister is skipped and dropped. */
	TArray<TWeakObjectPtr<UObject>> Listeners;
};
