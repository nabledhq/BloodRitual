// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "BloodRitualNoiseListener.generated.h"

class AActor;

/** One noise event as delivered to listeners by UBloodRitualNoiseSubsystem. */
USTRUCT(BlueprintType)
struct BLOODRITUAL_API FBloodRitualNoiseEvent
{
	GENERATED_BODY()

	/** Where the noise happened. */
	UPROPERTY(BlueprintReadOnly, Category = "BloodRitual|Noise")
	FVector Location = FVector::ZeroVector;

	/** How far (world units) the noise carries. Only listeners within this distance hear it. */
	UPROPERTY(BlueprintReadOnly, Category = "BloodRitual|Noise")
	float Radius = 0.0f;

	/** Who made the noise; may be null for noises without a source actor. */
	UPROPERTY(BlueprintReadOnly, Category = "BloodRitual|Noise")
	TObjectPtr<AActor> Instigator = nullptr;
};

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class UBloodRitualNoiseListener : public UInterface
{
	GENERATED_BODY()
};

/**
 * Implemented in C++ by anything that wants to hear noise: the infected (part 2), and the
 * placeholder ABloodRitualNoiseListenerPlaceholder in part 1. Implementers register with
 * UBloodRitualNoiseSubsystem::RegisterListener (typically in BeginPlay) and unregister in EndPlay.
 */
class BLOODRITUAL_API IBloodRitualNoiseListener
{
	GENERATED_BODY()

public:
	/** The point the subsystem measures the noise radius against. */
	virtual FVector GetNoiseListenerLocation() const = 0;

	/** Called only for noises whose radius reaches GetNoiseListenerLocation(). */
	virtual void OnNoiseHeard(const FBloodRitualNoiseEvent& Noise) = 0;
};
