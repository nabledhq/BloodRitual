// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "UI/BloodRitualHUD.h"

#include "BloodRitualGameState.h"
#include "Community/BloodRitualStockpile.h"
#include "Interaction/BloodRitualInteractionComponent.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Inventory/BloodRitualSupplyContainer.h"
#include "Survival/BloodRitualDayClockComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"

namespace
{
	constexpr float Margin = 20.0f;
	constexpr float LineHeight = 22.0f;
	const FLinearColor TextColor(0.95f, 0.95f, 0.95f);
	const FLinearColor DimColor(0.7f, 0.7f, 0.7f);
	const FLinearColor DuskColor(1.0f, 0.6f, 0.1f);
	const FLinearColor NightColor(0.9f, 0.2f, 0.2f);
	const FLinearColor PanelColor(0.0f, 0.0f, 0.0f, 0.5f);
	const FLinearColor BarColor(0.9f, 0.8f, 0.3f);

	FString FormatSeconds(float Seconds)
	{
		const int32 Whole = FMath::Max(0, FMath::CeilToInt(Seconds));
		return FString::Printf(TEXT("%d:%02d"), Whole / 60, Whole % 60);
	}
}

void ABloodRitualHUD::DrawHUD()
{
	Super::DrawHUD();

	if (Canvas == nullptr || GEngine == nullptr)
	{
		return;
	}

	float Y = Margin;
	DrawClock(GetDayClock(), Y);
	DrawSupplies(Y);
	DrawInteraction();
}

UBloodRitualDayClockComponent* ABloodRitualHUD::GetDayClock() const
{
	const UWorld* World = GetWorld();
	const ABloodRitualGameState* GameState = World != nullptr ? World->GetGameState<ABloodRitualGameState>() : nullptr;
	return GameState != nullptr ? GameState->GetDayClock() : nullptr;
}

ABloodRitualStockpile* ABloodRitualHUD::GetStockpile()
{
	if (!CachedStockpile.IsValid())
	{
		for (TActorIterator<ABloodRitualStockpile> It(GetWorld()); It; ++It)
		{
			CachedStockpile = *It;
			break;
		}
	}
	return CachedStockpile.Get();
}

void ABloodRitualHUD::DrawClock(const UBloodRitualDayClockComponent* Clock, float& Y)
{
	UFont* LargeFont = GEngine->GetLargeFont();
	UFont* MediumFont = GEngine->GetMediumFont();

	if (Clock == nullptr)
	{
		DrawText(TEXT("Day clock: not running (no BloodRitualGameState)"), DimColor, Margin, Y, MediumFont);
		Y += LineHeight;
		return;
	}

	const EBloodRitualDayPhase Phase = Clock->GetPhase();
	FString Line = BloodRitualDayPhaseToString(Phase);
	if (Phase != EBloodRitualDayPhase::Night)
	{
		Line += TEXT("  ") + FormatSeconds(Clock->GetPhaseTimeRemaining());
	}

	const FLinearColor Color = Phase == EBloodRitualDayPhase::Day ? TextColor : (Phase == EBloodRitualDayPhase::Dusk ? DuskColor : NightColor);
	DrawText(Line, Color, Margin, Y, LargeFont);
	Y += LineHeight * 1.6f;

	if (Phase == EBloodRitualDayPhase::Day)
	{
		return;
	}

	// Dusk warning (and the night notice), centred near the top of the screen.
	const FString Warning = Phase == EBloodRitualDayPhase::Dusk
		? FString::Printf(TEXT("DUSK - night falls in %s. Return to the hub!"), *FormatSeconds(Clock->GetPhaseTimeRemaining()))
		: FString(TEXT("NIGHT - the camp is on its own until dawn."));
	float TextWidth = 0.0f;
	float TextHeight = 0.0f;
	GetTextSize(Warning, TextWidth, TextHeight, LargeFont);

	const float BoxX = (Canvas->SizeX - TextWidth) * 0.5f - Margin;
	const float BoxY = Margin * 3.0f;
	DrawRect(PanelColor, BoxX, BoxY, TextWidth + Margin * 2.0f, TextHeight + Margin);
	DrawText(Warning, Color, BoxX + Margin, BoxY + Margin * 0.5f, LargeFont);
}

void ABloodRitualHUD::DrawSupplies(float& Y)
{
	UFont* MediumFont = GEngine->GetMediumFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const UBloodRitualInventoryComponent* Inventory = Pawn != nullptr ? Pawn->FindComponentByClass<UBloodRitualInventoryComponent>() : nullptr;

	const FString Carried = Inventory != nullptr ? Inventory->GetSupplies().ToString() : TEXT("(no inventory)");
	DrawText(TEXT("Carried:   ") + Carried, TextColor, Margin, Y, MediumFont);
	Y += LineHeight;

	const ABloodRitualStockpile* Stockpile = GetStockpile();
	const FString Stored = Stockpile != nullptr ? Stockpile->GetSupplies().ToString() : TEXT("(no stockpile)");
	DrawText(TEXT("Stockpile: ") + Stored, TextColor, Margin, Y, MediumFont);
	Y += LineHeight;
}

void ABloodRitualHUD::DrawInteraction()
{
	UFont* MediumFont = GEngine->GetMediumFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const UBloodRitualInteractionComponent* Interaction = Pawn != nullptr ? Pawn->FindComponentByClass<UBloodRitualInteractionComponent>() : nullptr;
	const AActor* Focused = Interaction != nullptr ? Interaction->GetFocusedInteractable() : nullptr;
	if (Focused == nullptr)
	{
		return;
	}

	const FString Prompt = TEXT("[E] ") + Interaction->GetFocusedPrompt().ToString();
	float TextWidth = 0.0f;
	float TextHeight = 0.0f;
	GetTextSize(Prompt, TextWidth, TextHeight, MediumFont);

	const float X = (Canvas->SizeX - TextWidth) * 0.5f;
	const float Y = Canvas->SizeY * 0.75f;
	DrawText(Prompt, TextColor, X, Y, MediumFont);

	// Search progress bar under the prompt while a container is being searched.
	const ABloodRitualSupplyContainer* Container = Cast<ABloodRitualSupplyContainer>(Focused);
	if (Container != nullptr && Container->IsBeingSearched())
	{
		const float BarWidth = 200.0f;
		const float BarHeight = 10.0f;
		const float BarX = (Canvas->SizeX - BarWidth) * 0.5f;
		const float BarY = Y + TextHeight + 6.0f;
		DrawRect(PanelColor, BarX, BarY, BarWidth, BarHeight);
		DrawRect(BarColor, BarX, BarY, BarWidth * Container->GetSearchProgress(), BarHeight);
	}
}
