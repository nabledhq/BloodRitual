// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "BloodRitualWeaponTypes.generated.h"

class AActor;

/** The weapons of the vertical slice. */
UENUM(BlueprintType)
enum class EBloodRitualWeapon : uint8
{
	None,
	Tomahawk,
	RockSledge,
	Bow,
	Rifle
};

/** How a weapon is held, which picks the animations. */
UENUM(BlueprintType)
enum class EBloodRitualWeaponHold : uint8
{
	Unarmed,
	Melee,
	Ranged
};

/** What an attack request did. */
UENUM(BlueprintType)
enum class EBloodRitualAttackResult : uint8
{
	/** Nothing: no weapon, or busy (swinging, cooling down, reloading). */
	None,
	/** A melee swing started; it lands BloodRitualWeapons::SwingContactSeconds into the swing. */
	Swing,
	/** A rifle round or an arrow left. */
	Shot,
	/** A ranged weapon without ammunition (rifle: empty magazine; bow: no Ammo carried). */
	DryFire
};

namespace BloodRitualWeapons
{
	/**
	 * The melee swing clip (Quaternius "Sword_Attack") lasts 1.53 s and the weapon is furthest
	 * forward 0.43 s in, measured from the clip; scaled by each weapon's swing rate.
	 */
	constexpr float SwingClipSeconds = 1.53f;
	constexpr float SwingContactSeconds = 0.43f;

	/** Heads are the top 28 cm of a target's collision capsule. */
	constexpr float HeadHeight = 28.0f;

	BLOODRITUAL_API EBloodRitualWeaponHold GetHold(EBloodRitualWeapon Weapon);
	BLOODRITUAL_API FText GetDisplayName(EBloodRitualWeapon Weapon);

	/** True when Point lies in the head of Target (the top of its root collision). */
	BLOODRITUAL_API bool IsHeadshot(const AActor* Target, const FVector& Point);
}
