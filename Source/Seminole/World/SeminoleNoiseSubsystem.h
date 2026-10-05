// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "World/SeminoleNoiseListener.h"
#include "SeminoleNoiseSubsystem.generated.h"

/** Broadcast for every noise, regardless of who heard it (audio cues, UI, missions). */
DECLARE_MULTICAST_DELEGATE_OneParam(FSeminoleNoiseEmittedNative, const FSeminoleNoiseEvent& /*Noise*/);

/**
 * The shared noise event (ADR 0004). Everything that makes noise calls EmitNoise(); every
 * ISeminoleNoiseListener that registered and lies within the radius hears it.
 *
 * Part 1 delivers to explicitly registered listeners only. Part 2 adds the infected as
 * listeners and may forward each event to AI Perception hearing from the same place.
 * Authoritative on the host: only server-side code should call EmitNoise().
 */
UCLASS()
class SEMINOLE_API USeminoleNoiseSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	/**
	 * Delivers a noise at Location to every registered listener within Radius (3D distance).
	 * Instigator may be null. Returns how many listeners heard it.
	 */
	int32 EmitNoise(const FVector& Location, float Radius, AActor* Instigator);

	/** Adds a listener. ListenerObject must implement ISeminoleNoiseListener; registering twice is harmless. */
	void RegisterListener(UObject* ListenerObject);

	/** Removes a listener. Safe to call for objects that never registered. */
	void UnregisterListener(UObject* ListenerObject);

	/** True when the object is currently registered. */
	bool IsListenerRegistered(const UObject* ListenerObject) const;

	int32 GetListenerCount() const { return Listeners.Num(); }

	/** Fired after every EmitNoise(), whether or not anyone heard it. */
	FSeminoleNoiseEmittedNative OnNoiseEmitted;

private:
	/** Weak so a destroyed listener that forgot to unregister is skipped, not dereferenced. */
	TArray<TWeakObjectPtr<UObject>> Listeners;
};
