// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "BloodRitualSettings.h"
#include "Survival/BloodRitualDayClockComponent.h"
#include "Tests/BloodRitualPhaseRecorder.h"

// Compares phases by name so a failure reads "Expected 'X' to be Dusk, but it was Day".
#define TEST_PHASE(What, Actual, Expected) \
	TestEqual(TEXT(What), BloodRitualDayPhaseToString(Actual), BloodRitualDayPhaseToString(Expected))

/**
 * Day -> Dusk -> Night fire in order at the configured durations, time is queryable, the
 * clock stops at Night, and ResetToDay() restores a full Day. Time is advanced through
 * Advance(), never real time.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FBloodRitualDayClockTransitionsTest, "BloodRitual.Survival.DayClock.Transitions",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FBloodRitualDayClockTransitionsTest::RunTest(const FString& Parameters)
{
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	const float DayLength = Settings->DayDurationSeconds;
	const float DuskLength = Settings->DuskDurationSeconds;

	UBloodRitualDayClockComponent* Clock = NewObject<UBloodRitualDayClockComponent>();
	UBloodRitualPhaseRecorder* Recorder = NewObject<UBloodRitualPhaseRecorder>();
	Recorder->BindTo(Clock);

	// Before the clock starts, Advance is a no-op and nothing is broadcast.
	Clock->Advance(DayLength * 2.0f);
	TEST_PHASE("Phase before start is Day", Clock->GetPhase(), EBloodRitualDayPhase::Day);
	TestEqual(TEXT("No broadcast before start"), Recorder->Phases.Num(), 0);

	Clock->ResetToDay();
	TEST_PHASE("Starts in Day", Clock->GetPhase(), EBloodRitualDayPhase::Day);
	TestEqual(TEXT("Day has the configured duration"), Clock->GetPhaseDuration(), DayLength);
	TestEqual(TEXT("Full Day remaining at start"), Clock->GetPhaseTimeRemaining(), DayLength);
	TestEqual(TEXT("ResetToDay broadcast Day"), Recorder->Phases.Num(), 1);
	TestEqual(TEXT("Progress is 0 at start"), Clock->GetPhaseProgress(), 0.0f);

	// Just short of the boundary: still Day with the remainder queryable.
	Clock->Advance(DayLength - 1.0f);
	TEST_PHASE("Still Day one second before dusk", Clock->GetPhase(), EBloodRitualDayPhase::Day);
	TestEqual(TEXT("One second of Day remains"), Clock->GetPhaseTimeRemaining(), 1.0f);
	TestEqual(TEXT("No new broadcast inside Day"), Recorder->Phases.Num(), 1);

	// Exactly on the boundary: Dusk begins with its full duration.
	Clock->Advance(1.0f);
	TEST_PHASE("Dusk after the Day duration", Clock->GetPhase(), EBloodRitualDayPhase::Dusk);
	TestEqual(TEXT("Dusk has the configured duration"), Clock->GetPhaseDuration(), DuskLength);
	TestEqual(TEXT("Full Dusk remaining"), Clock->GetPhaseTimeRemaining(), DuskLength);
	TestEqual(TEXT("Dusk broadcast"), Recorder->Phases.Num(), 2);
	TEST_PHASE("Second phase is Dusk", Recorder->Phases[1], EBloodRitualDayPhase::Dusk);

	Clock->Advance(DuskLength * 0.5f);
	TEST_PHASE("Still Dusk halfway", Clock->GetPhase(), EBloodRitualDayPhase::Dusk);
	TestEqual(TEXT("Half of Dusk remains"), Clock->GetPhaseTimeRemaining(), DuskLength * 0.5f);
	TestEqual(TEXT("Progress is 0.5 halfway through Dusk"), Clock->GetPhaseProgress(), 0.5f);

	Clock->Advance(DuskLength * 0.5f);
	TEST_PHASE("Night after the Dusk duration", Clock->GetPhase(), EBloodRitualDayPhase::Night);
	TestEqual(TEXT("Night has no time remaining"), Clock->GetPhaseTimeRemaining(), 0.0f);
	TestEqual(TEXT("Night broadcast"), Recorder->Phases.Num(), 3);
	TEST_PHASE("Third phase is Night", Recorder->Phases[2], EBloodRitualDayPhase::Night);

	// The clock stops at Night.
	Clock->Advance(DayLength * 10.0f);
	TEST_PHASE("Stays Night", Clock->GetPhase(), EBloodRitualDayPhase::Night);
	TestEqual(TEXT("No broadcast while Night"), Recorder->Phases.Num(), 3);

	// Reset restores Day with the full duration.
	Clock->ResetToDay();
	TEST_PHASE("Reset returns to Day", Clock->GetPhase(), EBloodRitualDayPhase::Day);
	TestEqual(TEXT("Reset restores the full Day"), Clock->GetPhaseTimeRemaining(), DayLength);
	TestEqual(TEXT("Reset broadcast Day"), Recorder->Phases.Num(), 4);
	TEST_PHASE("Fourth phase is Day", Recorder->Phases[3], EBloodRitualDayPhase::Day);

	return true;
}

/** One large step crosses both boundaries, broadcasting Dusk then Night in order. */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FBloodRitualDayClockLargeStepTest, "BloodRitual.Survival.DayClock.LargeStepCrossesPhasesInOrder",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FBloodRitualDayClockLargeStepTest::RunTest(const FString& Parameters)
{
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();

	UBloodRitualDayClockComponent* Clock = NewObject<UBloodRitualDayClockComponent>();
	UBloodRitualPhaseRecorder* Recorder = NewObject<UBloodRitualPhaseRecorder>();
	Recorder->BindTo(Clock);

	Clock->ResetToDay();
	Clock->Advance(Settings->DayDurationSeconds + Settings->DuskDurationSeconds + 1.0f);

	TEST_PHASE("Ends at Night", Clock->GetPhase(), EBloodRitualDayPhase::Night);
	if (TestEqual(TEXT("Three phases broadcast"), Recorder->Phases.Num(), 3))
	{
		TEST_PHASE("First is Day", Recorder->Phases[0], EBloodRitualDayPhase::Day);
		TEST_PHASE("Second is Dusk", Recorder->Phases[1], EBloodRitualDayPhase::Dusk);
		TEST_PHASE("Third is Night", Recorder->Phases[2], EBloodRitualDayPhase::Night);
	}

	return true;
}

#undef TEST_PHASE

#endif // WITH_DEV_AUTOMATION_TESTS
