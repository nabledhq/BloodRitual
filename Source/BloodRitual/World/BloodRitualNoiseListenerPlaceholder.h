// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TimerManager.h"
#include "World/BloodRitualNoiseListener.h"
#include "BloodRitualNoiseListenerPlaceholder.generated.h"

class UStaticMeshComponent;

/**
 * A sphere that hears noise: the part-1 stand-in for the infected of part 2. It registers with
 * UBloodRitualNoiseSubsystem on BeginPlay, counts the noises it hears, logs them and flashes
 * yellow for a second so delivery is visible in Play In Editor. The automation tests use it as
 * the listener test double.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualNoiseListenerPlaceholder : public AActor, public IBloodRitualNoiseListener
{
	GENERATED_BODY()

public:
	ABloodRitualNoiseListenerPlaceholder();

	//~ AActor
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	//~ IBloodRitualNoiseListener
	virtual FVector GetNoiseListenerLocation() const override;
	virtual void OnNoiseHeard(const FBloodRitualNoiseEvent& Noise) override;

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Noise")
	int32 GetHeardNoiseCount() const { return HeardNoiseCount; }

	const FBloodRitualNoiseEvent& GetLastNoise() const { return LastNoise; }

private:
	void RestoreIdleColor();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Noise")
	int32 HeardNoiseCount = 0;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Noise")
	FBloodRitualNoiseEvent LastNoise;

	FTimerHandle FlashTimerHandle;
};
