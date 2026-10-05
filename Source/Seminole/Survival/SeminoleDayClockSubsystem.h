// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "SeminoleDayClockSubsystem.generated.h"

/** The three phases of a slice day. The clock stops at Night; part 3 ends the night. */
UENUM(BlueprintType)
enum class ESeminoleDayPhase : uint8
{
	Day,
	Dusk,
	Night
};

/** Native delegate for C++ listeners (lighting, HUD, part 3 night defense). */
DECLARE_MULTICAST_DELEGATE_OneParam(FSeminoleDayPhaseChangedNative, ESeminoleDayPhase /*NewPhase*/);

/** Dynamic delegate so Blueprint content can react to the same transition. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FSeminoleDayPhaseChanged, ESeminoleDayPhase, NewPhase);

/**
 * The day/dusk/night clock. Owned by the world so it is authoritative on the host and can
 * later be mirrored to clients through the GameState.
 *
 * Starts in Day when the world begins play, runs Day -> Dusk -> Night and stops at Night.
 * Phase lengths come from USeminoleSettings. Every transition fires OnPhaseChanged (native)
 * and OnPhaseChangedDynamic (Blueprint). ResetToDay() restarts the cycle; part 3 calls it
 * when a night is survived.
 *
 * Time is advanced through AdvanceTime(), which Tick() feeds with real delta time. Tests
 * call AdvanceTime() directly to step the clock deterministically.
 */
UCLASS()
class SEMINOLE_API USeminoleDayClockSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	// USubsystem / UWorldSubsystem
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

	// FTickableGameObject
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	/** Fired after the phase changed, with the new phase. */
	FSeminoleDayPhaseChangedNative OnPhaseChanged;

	/** Blueprint-assignable twin of OnPhaseChanged. */
	UPROPERTY(BlueprintAssignable, Category = "Seminole|Day Clock")
	FSeminoleDayPhaseChanged OnPhaseChangedDynamic;

	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	ESeminoleDayPhase GetPhase() const { return Phase; }

	/** Seconds left in the current phase. 0 during Night, which has no end. */
	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	float GetTimeRemainingInPhase() const { return TimeRemaining; }

	/** Configured length of a phase in seconds; 0 for Night. */
	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	float GetPhaseDuration(ESeminoleDayPhase InPhase) const;

	/** 0 at the start of the current phase, 1 at its end (always 1 during Night). */
	UFUNCTION(BlueprintPure, Category = "Seminole|Day Clock")
	float GetPhaseProgress() const;

	/** Returns to Day with the full Day duration and broadcasts the change. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Day Clock")
	void ResetToDay();

	/** Advances the clock by Seconds, crossing as many phase boundaries as that covers. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Day Clock")
	void AdvanceTime(float Seconds);

private:
	void SetPhase(ESeminoleDayPhase NewPhase);

	ESeminoleDayPhase Phase = ESeminoleDayPhase::Day;
	float TimeRemaining = 0.0f;
};

/** "Day", "Dusk" or "Night", for logs and the placeholder HUD. */
SEMINOLE_API FString SeminoleDayPhaseToString(ESeminoleDayPhase Phase);
