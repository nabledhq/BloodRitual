// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "Tests/SeminoleTestWorld.h"
#include "World/SeminoleNoiseListenerPlaceholder.h"
#include "World/SeminoleNoiseSubsystem.h"
#include "GameFramework/Actor.h"

/**
 * EmitNoise reaches a registered listener inside the radius (with the location and the
 * instigator) and not one outside it. Distance is 3D, so a listener straight above the
 * noise counts too.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleNoiseFilteringTest, "Seminole.World.Noise.RadiusFiltering",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FSeminoleNoiseFilteringTest::RunTest(const FString& Parameters)
{
	FSeminoleTestWorld TestWorld;
	UWorld* World = TestWorld.GetWorld();
	if (!TestNotNull(TEXT("Test world"), World))
	{
		return false;
	}

	USeminoleNoiseSubsystem* Noise = World->GetSubsystem<USeminoleNoiseSubsystem>();
	if (!TestNotNull(TEXT("Noise subsystem exists in a game world"), Noise))
	{
		return false;
	}

	const FVector Origin(1000.0f, 0.0f, 0.0f);
	const float Radius = 500.0f;

	ASeminoleNoiseListenerPlaceholder* Near = TestWorld.SpawnActor<ASeminoleNoiseListenerPlaceholder>(Origin + FVector(300.0f, 0.0f, 0.0f));
	ASeminoleNoiseListenerPlaceholder* Above = TestWorld.SpawnActor<ASeminoleNoiseListenerPlaceholder>(Origin + FVector(0.0f, 0.0f, 450.0f));
	ASeminoleNoiseListenerPlaceholder* Far = TestWorld.SpawnActor<ASeminoleNoiseListenerPlaceholder>(Origin + FVector(600.0f, 0.0f, 0.0f));
	ASeminoleNoiseListenerPlaceholder* Diagonal = TestWorld.SpawnActor<ASeminoleNoiseListenerPlaceholder>(Origin + FVector(400.0f, 400.0f, 0.0f));
	ASeminoleNoiseListenerPlaceholder* Unregistered = TestWorld.SpawnActor<ASeminoleNoiseListenerPlaceholder>(Origin);
	AActor* Instigator = TestWorld.SpawnActor<AActor>(Origin);
	if (!TestNotNull(TEXT("Near listener"), Near) || !TestNotNull(TEXT("Above listener"), Above)
		|| !TestNotNull(TEXT("Far listener"), Far) || !TestNotNull(TEXT("Diagonal listener"), Diagonal)
		|| !TestNotNull(TEXT("Unregistered listener"), Unregistered) || !TestNotNull(TEXT("Instigator"), Instigator))
	{
		return false;
	}

	// No game mode in the test world, so BeginPlay (which registers) does not run; register by hand.
	Noise->RegisterListener(Near);
	Noise->RegisterListener(Above);
	Noise->RegisterListener(Far);
	Noise->RegisterListener(Diagonal);
	Noise->RegisterListener(Near); // Registering twice is harmless.
	TestEqual(TEXT("Four distinct listeners registered"), Noise->GetListenerCount(), 4);

	int32 BroadcastCount = 0;
	Noise->OnNoiseEmitted.AddLambda([&BroadcastCount](const FSeminoleNoiseEvent&) { ++BroadcastCount; });

	Noise->EmitNoise(Origin, Radius, Instigator);

	TestEqual(TEXT("Listener 300 uu away hears the noise"), Near->GetHeardNoiseCount(), 1);
	TestEqual(TEXT("Listener 450 uu straight above hears the noise (3D distance)"), Above->GetHeardNoiseCount(), 1);
	TestEqual(TEXT("Listener 600 uu away does not hear it"), Far->GetHeardNoiseCount(), 0);
	TestEqual(TEXT("Listener 566 uu away diagonally does not hear it"), Diagonal->GetHeardNoiseCount(), 0);
	TestEqual(TEXT("Unregistered listener at the origin does not hear it"), Unregistered->GetHeardNoiseCount(), 0);
	TestEqual(TEXT("OnNoiseEmitted fired once"), BroadcastCount, 1);

	TestEqual(TEXT("Event carries the location"), Near->GetLastNoise().Location, Origin);
	TestEqual(TEXT("Event carries the radius"), Near->GetLastNoise().Radius, Radius);
	TestTrue(TEXT("Event carries the instigator"), Near->GetLastNoise().Instigator == Instigator);

	// Unregistered listeners stop hearing.
	Noise->UnregisterListener(Near);
	Noise->EmitNoise(Origin, Radius, nullptr);
	TestEqual(TEXT("Unregistered Near listener hears nothing more"), Near->GetHeardNoiseCount(), 1);
	TestEqual(TEXT("Above listener hears the second noise"), Above->GetHeardNoiseCount(), 2);
	TestTrue(TEXT("Noise without an instigator is delivered"), Above->GetLastNoise().Instigator == nullptr);

	// A larger radius reaches the far listener.
	Noise->EmitNoise(Origin, 1000.0f, nullptr);
	TestEqual(TEXT("Far listener hears a 1000 uu noise"), Far->GetHeardNoiseCount(), 1);
	TestEqual(TEXT("Diagonal listener hears a 1000 uu noise"), Diagonal->GetHeardNoiseCount(), 1);

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
