// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "SeminoleSettings.h"
#include "Survival/SeminoleDayClockComponent.h"
#include "Tests/SeminolePhaseRecorder.h"

// Compares phases by name so a failure reads "Expected 'X' to be Dusk, but it was Day".
#define TEST_PHASE(What, Actual, Expected) \
	TestEqual(TEXT(What), SeminoleDayPhaseToString(Actual), SeminoleDayPhaseToString(Expected))

/**
 * Day -> Dusk -> Night fire in order at the configured durations, time is queryable, the
 * clock stops at Night, and ResetToDay() restores a full Day. Time is advanced through
 * Advance(), never real time.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleDayClockTransitionsTest, "Seminole.Survival.DayClock.Transitions",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FSeminoleDayClockTransitionsTest::RunTest(const FString& Parameters)
{
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	const float DayLength = Settings->DayDurationSeconds;
	const float DuskLength = Settings->DuskDurationSeconds;

	USeminoleDayClockComponent* Clock = NewObject<USeminoleDayClockComponent>();
	USeminolePhaseRecorder* Recorder = NewObject<USeminolePhaseRecorder>();
	Recorder->BindTo(Clock);

	// Before the clock starts, Advance is a no-op and nothing is broadcast.
	Clock->Advance(DayLength * 2.0f);
	TEST_PHASE("Phase before start is Day", Clock->GetPhase(), ESeminoleDayPhase::Day);
	TestEqual(TEXT("No broadcast before start"), Recorder->Phases.Num(), 0);

	Clock->ResetToDay();
	TEST_PHASE("Starts in Day", Clock->GetPhase(), ESeminoleDayPhase::Day);
	TestEqual(TEXT("Day has the configured duration"), Clock->GetPhaseDuration(), DayLength);
	TestEqual(TEXT("Full Day remaining at start"), Clock->GetPhaseTimeRemaining(), DayLength);
	TestEqual(TEXT("ResetToDay broadcast Day"), Recorder->Phases.Num(), 1);
	TestEqual(TEXT("Progress is 0 at start"), Clock->GetPhaseProgress(), 0.0f);

	// Just short of the boundary: still Day with the remainder queryable.
	Clock->Advance(DayLength - 1.0f);
	TEST_PHASE("Still Day one second before dusk", Clock->GetPhase(), ESeminoleDayPhase::Day);
	TestEqual(TEXT("One second of Day remains"), Clock->GetPhaseTimeRemaining(), 1.0f);
	TestEqual(TEXT("No new broadcast inside Day"), Recorder->Phases.Num(), 1);

	// Exactly on the boundary: Dusk begins with its full duration.
	Clock->Advance(1.0f);
	TEST_PHASE("Dusk after the Day duration", Clock->GetPhase(), ESeminoleDayPhase::Dusk);
	TestEqual(TEXT("Dusk has the configured duration"), Clock->GetPhaseDuration(), DuskLength);
	TestEqual(TEXT("Full Dusk remaining"), Clock->GetPhaseTimeRemaining(), DuskLength);
	TestEqual(TEXT("Dusk broadcast"), Recorder->Phases.Num(), 2);
	TEST_PHASE("Second phase is Dusk", Recorder->Phases[1], ESeminoleDayPhase::Dusk);

	Clock->Advance(DuskLength * 0.5f);
	TEST_PHASE("Still Dusk halfway", Clock->GetPhase(), ESeminoleDayPhase::Dusk);
	TestEqual(TEXT("Half of Dusk remains"), Clock->GetPhaseTimeRemaining(), DuskLength * 0.5f);
	TestEqual(TEXT("Progress is 0.5 halfway through Dusk"), Clock->GetPhaseProgress(), 0.5f);

	Clock->Advance(DuskLength * 0.5f);
	TEST_PHASE("Night after the Dusk duration", Clock->GetPhase(), ESeminoleDayPhase::Night);
	TestEqual(TEXT("Night has no time remaining"), Clock->GetPhaseTimeRemaining(), 0.0f);
	TestEqual(TEXT("Night broadcast"), Recorder->Phases.Num(), 3);
	TEST_PHASE("Third phase is Night", Recorder->Phases[2], ESeminoleDayPhase::Night);

	// The clock stops at Night.
	Clock->Advance(DayLength * 10.0f);
	TEST_PHASE("Stays Night", Clock->GetPhase(), ESeminoleDayPhase::Night);
	TestEqual(TEXT("No broadcast while Night"), Recorder->Phases.Num(), 3);

	// Reset restores Day with the full duration.
	Clock->ResetToDay();
	TEST_PHASE("Reset returns to Day", Clock->GetPhase(), ESeminoleDayPhase::Day);
	TestEqual(TEXT("Reset restores the full Day"), Clock->GetPhaseTimeRemaining(), DayLength);
	TestEqual(TEXT("Reset broadcast Day"), Recorder->Phases.Num(), 4);
	TEST_PHASE("Fourth phase is Day", Recorder->Phases[3], ESeminoleDayPhase::Day);

	return true;
}

/** One large step crosses both boundaries, broadcasting Dusk then Night in order. */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleDayClockLargeStepTest, "Seminole.Survival.DayClock.LargeStepCrossesPhasesInOrder",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FSeminoleDayClockLargeStepTest::RunTest(const FString& Parameters)
{
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();

	USeminoleDayClockComponent* Clock = NewObject<USeminoleDayClockComponent>();
	USeminolePhaseRecorder* Recorder = NewObject<USeminolePhaseRecorder>();
	Recorder->BindTo(Clock);

	Clock->ResetToDay();
	Clock->Advance(Settings->DayDurationSeconds + Settings->DuskDurationSeconds + 1.0f);

	TEST_PHASE("Ends at Night", Clock->GetPhase(), ESeminoleDayPhase::Night);
	if (TestEqual(TEXT("Three phases broadcast"), Recorder->Phases.Num(), 3))
	{
		TEST_PHASE("First is Day", Recorder->Phases[0], ESeminoleDayPhase::Day);
		TEST_PHASE("Second is Dusk", Recorder->Phases[1], ESeminoleDayPhase::Dusk);
		TEST_PHASE("Third is Night", Recorder->Phases[2], ESeminoleDayPhase::Night);
	}

	return true;
}

#undef TEST_PHASE

#endif // WITH_DEV_AUTOMATION_TESTS
