// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "SeminoleDayLightingComponent.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;

/**
 * Drives the world's directional light and sky light from the day clock: Day interpolates
 * from the Day to the Dusk values, Dusk from the Dusk to the Night values, and Night holds
 * the Night values (all in USeminoleSettings). Lives on ASeminoleTestEnvironment, which also
 * spawns the lights; a real map's lighting (sky atmosphere, time-of-day sun path) replaces it.
 *
 * The first directional light and sky light found in the world are used, so a hand-made map's
 * own lights are driven too.
 */
UCLASS(ClassGroup = (Seminole), meta = (BlueprintSpawnableComponent))
class SEMINOLE_API USeminoleDayLightingComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USeminoleDayLightingComponent();

	//~ UActorComponent
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Applies the lighting for the current clock state now; TickComponent calls this each frame. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Lighting")
	void ApplyLighting();

private:
	void FindLights();

	UPROPERTY()
	TObjectPtr<UDirectionalLightComponent> Sun;

	UPROPERTY()
	TObjectPtr<USkyLightComponent> Sky;
};
