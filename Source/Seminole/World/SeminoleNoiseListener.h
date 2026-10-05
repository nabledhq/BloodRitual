// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "SeminoleNoiseListener.generated.h"

class AActor;

/** One noise, as delivered to listeners and broadcast by USeminoleNoiseSubsystem. */
USTRUCT(BlueprintType)
struct SEMINOLE_API FSeminoleNoiseEvent
{
	GENERATED_BODY()

	/** Where the noise was made. */
	UPROPERTY(BlueprintReadOnly, Category = "Seminole")
	FVector Location = FVector::ZeroVector;

	/** How far it carries, in unreal units. Listeners farther than this never hear it. */
	UPROPERTY(BlueprintReadOnly, Category = "Seminole")
	float Radius = 0.0f;

	/** Who made it. May be null (environmental noise). */
	UPROPERTY(BlueprintReadOnly, Category = "Seminole")
	TObjectPtr<AActor> Instigator = nullptr;
};

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class USeminoleNoiseListener : public UInterface
{
	GENERATED_BODY()
};

/**
 * Something that hears noise. Register with USeminoleNoiseSubsystem to receive
 * OnNoiseHeard for every noise emitted within its radius of GetNoiseListenerLocation().
 *
 * Native-only on purpose: part 2's infected implement it in C++ and forward to their
 * StateTree / AI Perception; Blueprint content reacts through the subsystem's delegate.
 */
class SEMINOLE_API ISeminoleNoiseListener
{
	GENERATED_BODY()

public:
	/** World position used for the radius test. */
	virtual FVector GetNoiseListenerLocation() const = 0;

	/** Called for each noise whose radius reaches this listener. */
	virtual void OnNoiseHeard(const FSeminoleNoiseEvent& Noise) = 0;
};
