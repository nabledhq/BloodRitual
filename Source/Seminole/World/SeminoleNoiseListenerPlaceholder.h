// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "World/SeminoleNoiseListener.h"
#include "SeminoleNoiseListenerPlaceholder.generated.h"

class UStaticMeshComponent;

/**
 * Placeholder noise listener: a sphere that registers with USeminoleNoiseSubsystem, turns
 * red and logs when it hears a noise, and records what it heard so tests can check delivery.
 *
 * Stands in for the infected of part 2, which implement ISeminoleNoiseListener themselves.
 */
UCLASS()
class SEMINOLE_API ASeminoleNoiseListenerPlaceholder : public AActor, public ISeminoleNoiseListener
{
	GENERATED_BODY()

public:
	ASeminoleNoiseListenerPlaceholder();

	// ISeminoleNoiseListener
	virtual FVector GetNoiseListenerLocation() const override;
	virtual void OnNoiseHeard(const FSeminoleNoiseEvent& Noise) override;

	int32 GetHeardNoiseCount() const { return HeardNoiseCount; }
	const FSeminoleNoiseEvent& GetLastHeardNoise() const { return LastHeardNoise; }

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	UPROPERTY(VisibleAnywhere, Category = "Seminole")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(Transient)
	FSeminoleNoiseEvent LastHeardNoise;

	int32 HeardNoiseCount = 0;
};
