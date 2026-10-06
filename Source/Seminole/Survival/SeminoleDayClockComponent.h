// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "SeminoleDayClockComponent.generated.h"

/** The three phases of one in-game day. The clock stops at Night; part 3 ends the night. */
UENUM(BlueprintType)
enum class ESeminoleDayPhase : uint8
{
	Day,
	Dusk,
	Night
};

/** Returns "Day", "Dusk" or "Night". */
SEMINOLE_API FString SeminoleDayPhaseToString(ESeminoleDayPhase Phase);

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FSeminoleDayPhaseChanged, ESeminoleDayPhase, NewPhase);

/**
 * The day clock: Day -> Dusk -> Night, then it stops. Owned by ASeminoleGameState so the
 * phase is authoritative state that can be replicated later.
 *
 * The clock starts running on BeginPlay (ResetToDay). Durations come from USeminoleSettings.
 * All time keeping goes through Advance(), which TickComponent calls with the frame delta and
 * tests call directly with whatever they need; nothing here reads real time.
 *
 * Extension points: part 3 binds OnPhaseChanged to start the night defense at Night and calls
 * ResetToDay() when the night is survived.
 */
UCLASS(ClassGroup = (Seminole), meta = (BlueprintSpawnableComponent))
class SEMINOLE_API USeminoleDayClockComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USeminoleDayClockComponent();

	//~ UActorComponent
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Fired on every phase change, and by ResetToDay(). */
	UPROPERTY(BlueprintAssignable, Category = "Seminole|Day Clock")
	FSeminoleDayPhaseChanged OnPhaseChanged;

	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	ESeminoleDayPhase GetPhase() const { return Phase; }

	/** Seconds left in the current phase; 0 at Night, which has no end. */
	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	float GetPhaseTimeRemaining() const { return PhaseTimeRemaining; }

	/** Full length in seconds of the current phase; 0 at Night. */
	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	float GetPhaseDuration() const { return PhaseDuration; }

	/** 0 at the start of the current phase, 1 at its end; 1 at Night. Drives the lighting. */
	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	float GetPhaseProgress() const;

	/** Restarts the clock at Day with the full configured duration and broadcasts OnPhaseChanged(Day). */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Day Clock")
	void ResetToDay();

	/**
	 * Moves the clock forward by DeltaSeconds, crossing as many phase boundaries as needed
	 * (each one broadcasts OnPhaseChanged in order). Does nothing before ResetToDay() has run
	 * or once Night is reached.
	 */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Day Clock")
	void Advance(float DeltaSeconds);

private:
	void EnterPhase(ESeminoleDayPhase NewPhase);
	float GetConfiguredDuration(ESeminoleDayPhase ForPhase) const;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Day Clock")
	ESeminoleDayPhase Phase = ESeminoleDayPhase::Day;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Day Clock")
	float PhaseTimeRemaining = 0.0f;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Day Clock")
	float PhaseDuration = 0.0f;

	/** Set by ResetToDay(); Advance() is a no-op until then. */
	bool bStarted = false;
};
