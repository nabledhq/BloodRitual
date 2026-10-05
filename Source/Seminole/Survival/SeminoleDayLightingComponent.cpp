// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Survival/SeminoleDayLightingComponent.h"

#include "SeminoleSettings.h"
#include "Survival/SeminoleDayClockSubsystem.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"

namespace
{
	float LerpForPhase(ESeminoleDayPhase Phase, float Progress, float DayValue, float DuskValue, float NightValue)
	{
		const float Alpha = FMath::Clamp(Progress, 0.0f, 1.0f);
		switch (Phase)
		{
		case ESeminoleDayPhase::Day:
			return FMath::Lerp(DayValue, DuskValue, Alpha);
		case ESeminoleDayPhase::Dusk:
			return FMath::Lerp(DuskValue, NightValue, Alpha);
		case ESeminoleDayPhase::Night:
		default:
			return NightValue;
		}
	}
}

USeminoleDayLightingComponent::USeminoleDayLightingComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

float USeminoleDayLightingComponent::ComputeSunIntensity(ESeminoleDayPhase Phase, float Progress)
{
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	return LerpForPhase(Phase, Progress, Settings->DaySunIntensity, Settings->DuskSunIntensity, Settings->NightSunIntensity);
}

float USeminoleDayLightingComponent::ComputeSkyLightIntensity(ESeminoleDayPhase Phase, float Progress)
{
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	return LerpForPhase(Phase, Progress, Settings->DaySkyLightIntensity, Settings->DuskSkyLightIntensity, Settings->NightSkyLightIntensity);
}

void USeminoleDayLightingComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	UWorld* World = GetWorld();
	const USeminoleDayClockSubsystem* Clock = World ? World->GetSubsystem<USeminoleDayClockSubsystem>() : nullptr;
	if (Clock == nullptr)
	{
		return;
	}

	if (!Sun.IsValid() || !SkyLight.IsValid())
	{
		FindLights();
	}

	const ESeminoleDayPhase Phase = Clock->GetPhase();
	const float Progress = Clock->GetPhaseProgress();
	if (UDirectionalLightComponent* SunComponent = Sun.Get())
	{
		SunComponent->SetIntensity(ComputeSunIntensity(Phase, Progress));
	}
	if (USkyLightComponent* SkyComponent = SkyLight.Get())
	{
		SkyComponent->SetIntensity(ComputeSkyLightIntensity(Phase, Progress));
	}
}

void USeminoleDayLightingComponent::FindLights()
{
	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		if (!Sun.IsValid())
		{
			Sun = It->FindComponentByClass<UDirectionalLightComponent>();
		}
		if (!SkyLight.IsValid())
		{
			SkyLight = It->FindComponentByClass<USkyLightComponent>();
		}
		if (Sun.IsValid() && SkyLight.IsValid())
		{
			break;
		}
	}
}
