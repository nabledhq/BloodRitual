// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "SeminoleDayLightingComponent.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;
enum class ESeminoleDayPhase : uint8;

/**
 * Drives the scene's directional light and sky light from USeminoleDayClockSubsystem.
 *
 * Day: intensities interpolate from the Day to the Dusk values over the phase.
 * Dusk: from the Dusk to the Night values, reaching Night exactly at the transition.
 * Night: held at the Night values. All values come from USeminoleSettings.
 *
 * Finds the first directional light and sky light in the world (the ones
 * ASeminoleTestEnvironment spawns, or a map's own) and ticks while the clock runs.
 */
UCLASS(ClassGroup = (Seminole), meta = (BlueprintSpawnableComponent))
class SEMINOLE_API USeminoleDayLightingComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USeminoleDayLightingComponent();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Sun intensity (lux) for a phase at Progress (0..1) through it. */
	static float ComputeSunIntensity(ESeminoleDayPhase Phase, float Progress);

	/** Sky light intensity for a phase at Progress (0..1) through it. */
	static float ComputeSkyLightIntensity(ESeminoleDayPhase Phase, float Progress);

private:
	void FindLights();

	TWeakObjectPtr<UDirectionalLightComponent> Sun;
	TWeakObjectPtr<USkyLightComponent> SkyLight;
};
