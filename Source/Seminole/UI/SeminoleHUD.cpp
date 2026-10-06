// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "UI/SeminoleHUD.h"

#include "SeminoleGameState.h"
#include "Community/SeminoleStockpile.h"
#include "Interaction/SeminoleInteractionComponent.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "Inventory/SeminoleSupplyContainer.h"
#include "Survival/SeminoleDayClockComponent.h"
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

void ASeminoleHUD::DrawHUD()
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

USeminoleDayClockComponent* ASeminoleHUD::GetDayClock() const
{
	const UWorld* World = GetWorld();
	const ASeminoleGameState* GameState = World != nullptr ? World->GetGameState<ASeminoleGameState>() : nullptr;
	return GameState != nullptr ? GameState->GetDayClock() : nullptr;
}

ASeminoleStockpile* ASeminoleHUD::GetStockpile()
{
	if (!CachedStockpile.IsValid())
	{
		for (TActorIterator<ASeminoleStockpile> It(GetWorld()); It; ++It)
		{
			CachedStockpile = *It;
			break;
		}
	}
	return CachedStockpile.Get();
}

void ASeminoleHUD::DrawClock(const USeminoleDayClockComponent* Clock, float& Y)
{
	UFont* LargeFont = GEngine->GetLargeFont();
	UFont* MediumFont = GEngine->GetMediumFont();

	if (Clock == nullptr)
	{
		DrawText(TEXT("Day clock: not running (no SeminoleGameState)"), DimColor, Margin, Y, MediumFont);
		Y += LineHeight;
		return;
	}

	const ESeminoleDayPhase Phase = Clock->GetPhase();
	FString Line = SeminoleDayPhaseToString(Phase);
	if (Phase != ESeminoleDayPhase::Night)
	{
		Line += TEXT("  ") + FormatSeconds(Clock->GetPhaseTimeRemaining());
	}

	const FLinearColor Color = Phase == ESeminoleDayPhase::Day ? TextColor : (Phase == ESeminoleDayPhase::Dusk ? DuskColor : NightColor);
	DrawText(Line, Color, Margin, Y, LargeFont);
	Y += LineHeight * 1.6f;

	if (Phase == ESeminoleDayPhase::Day)
	{
		return;
	}

	// Dusk warning (and the night notice), centred near the top of the screen.
	const FString Warning = Phase == ESeminoleDayPhase::Dusk
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

void ASeminoleHUD::DrawSupplies(float& Y)
{
	UFont* MediumFont = GEngine->GetMediumFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const USeminoleInventoryComponent* Inventory = Pawn != nullptr ? Pawn->FindComponentByClass<USeminoleInventoryComponent>() : nullptr;

	const FString Carried = Inventory != nullptr ? Inventory->GetSupplies().ToString() : TEXT("(no inventory)");
	DrawText(TEXT("Carried:   ") + Carried, TextColor, Margin, Y, MediumFont);
	Y += LineHeight;

	const ASeminoleStockpile* Stockpile = GetStockpile();
	const FString Stored = Stockpile != nullptr ? Stockpile->GetSupplies().ToString() : TEXT("(no stockpile)");
	DrawText(TEXT("Stockpile: ") + Stored, TextColor, Margin, Y, MediumFont);
	Y += LineHeight;
}

void ASeminoleHUD::DrawInteraction()
{
	UFont* MediumFont = GEngine->GetMediumFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const USeminoleInteractionComponent* Interaction = Pawn != nullptr ? Pawn->FindComponentByClass<USeminoleInteractionComponent>() : nullptr;
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
	const ASeminoleSupplyContainer* Container = Cast<ASeminoleSupplyContainer>(Focused);
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
