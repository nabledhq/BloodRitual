// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "World/BloodRitualDayLightingComponent.h"

#include "BloodRitual.h"
#include "BloodRitualGameState.h"
#include "BloodRitualSettings.h"
#include "Survival/BloodRitualDayClockComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"

namespace
{
	/** Component-wise blend using FLinearColor's own operators; FMath::Lerp needs float * color. */
	FLinearColor BlendColor(const FLinearColor& A, const FLinearColor& B, float Alpha)
	{
		return A * (1.0f - Alpha) + B * Alpha;
	}
}

UBloodRitualDayLightingComponent::UBloodRitualDayLightingComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

void UBloodRitualDayLightingComponent::BeginPlay()
{
	Super::BeginPlay();

	FindLights();
	ApplyLighting();
}

void UBloodRitualDayLightingComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	ApplyLighting();
}

void UBloodRitualDayLightingComponent::ApplyLighting()
{
	const UWorld* World = GetWorld();
	const ABloodRitualGameState* GameState = World != nullptr ? World->GetGameState<ABloodRitualGameState>() : nullptr;
	const UBloodRitualDayClockComponent* Clock = GameState != nullptr ? GameState->GetDayClock() : nullptr;
	if (Clock == nullptr)
	{
		return;
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	const float Progress = Clock->GetPhaseProgress();

	float SunIntensity = Settings->NightSunIntensity;
	float SkyIntensity = Settings->NightSkyLightIntensity;
	FLinearColor SunColor = Settings->NightSunColor;

	switch (Clock->GetPhase())
	{
	case EBloodRitualDayPhase::Day:
		SunIntensity = FMath::Lerp(Settings->DaySunIntensity, Settings->DuskSunIntensity, Progress);
		SkyIntensity = FMath::Lerp(Settings->DaySkyLightIntensity, Settings->DuskSkyLightIntensity, Progress);
		SunColor = BlendColor(Settings->DaySunColor, Settings->DuskSunColor, Progress);
		break;
	case EBloodRitualDayPhase::Dusk:
		SunIntensity = FMath::Lerp(Settings->DuskSunIntensity, Settings->NightSunIntensity, Progress);
		SkyIntensity = FMath::Lerp(Settings->DuskSkyLightIntensity, Settings->NightSkyLightIntensity, Progress);
		SunColor = BlendColor(Settings->DuskSunColor, Settings->NightSunColor, Progress);
		break;
	case EBloodRitualDayPhase::Night:
	default:
		break;
	}

	if (Sun != nullptr)
	{
		Sun->SetIntensity(SunIntensity);
		Sun->SetLightColor(SunColor);
	}
	if (Sky != nullptr)
	{
		Sky->SetIntensity(SkyIntensity);
	}
}

void UBloodRitualDayLightingComponent::FindLights()
{
	Sun = nullptr;
	Sky = nullptr;

	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		if (Sun == nullptr)
		{
			Sun = It->FindComponentByClass<UDirectionalLightComponent>();
		}
		if (Sky == nullptr)
		{
			Sky = It->FindComponentByClass<USkyLightComponent>();
		}
		if (Sun != nullptr && Sky != nullptr)
		{
			break;
		}
	}

	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualDayLighting: driving %s and %s."),
		Sun != nullptr ? TEXT("a directional light") : TEXT("no directional light"),
		Sky != nullptr ? TEXT("a sky light") : TEXT("no sky light"));
}
