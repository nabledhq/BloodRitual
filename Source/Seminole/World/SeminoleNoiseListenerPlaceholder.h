// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TimerManager.h"
#include "World/SeminoleNoiseListener.h"
#include "SeminoleNoiseListenerPlaceholder.generated.h"

class UStaticMeshComponent;

/**
 * A sphere that hears noise: the part-1 stand-in for the infected of part 2. It registers with
 * USeminoleNoiseSubsystem on BeginPlay, counts the noises it hears, logs them and flashes
 * yellow for a second so delivery is visible in Play In Editor. The automation tests use it as
 * the listener test double.
 */
UCLASS()
class SEMINOLE_API ASeminoleNoiseListenerPlaceholder : public AActor, public ISeminoleNoiseListener
{
	GENERATED_BODY()

public:
	ASeminoleNoiseListenerPlaceholder();

	//~ AActor
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	//~ ISeminoleNoiseListener
	virtual FVector GetNoiseListenerLocation() const override;
	virtual void OnNoiseHeard(const FSeminoleNoiseEvent& Noise) override;

	UFUNCTION(BlueprintPure, Category = "Seminole|Noise")
	int32 GetHeardNoiseCount() const { return HeardNoiseCount; }

	const FSeminoleNoiseEvent& GetLastNoise() const { return LastNoise; }

private:
	void RestoreIdleColor();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Noise")
	int32 HeardNoiseCount = 0;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Noise")
	FSeminoleNoiseEvent LastNoise;

	FTimerHandle FlashTimerHandle;
};
