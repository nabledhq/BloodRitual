// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Combat/BloodRitualWeaponTypes.h"

#include "Components/CapsuleComponent.h"
#include "GameFramework/Actor.h"

EBloodRitualWeaponHold BloodRitualWeapons::GetHold(EBloodRitualWeapon Weapon)
{
	switch (Weapon)
	{
	case EBloodRitualWeapon::Tomahawk:
	case EBloodRitualWeapon::RockSledge:
		return EBloodRitualWeaponHold::Melee;
	case EBloodRitualWeapon::Bow:
	case EBloodRitualWeapon::Rifle:
		return EBloodRitualWeaponHold::Ranged;
	default:
		return EBloodRitualWeaponHold::Unarmed;
	}
}

FText BloodRitualWeapons::GetDisplayName(EBloodRitualWeapon Weapon)
{
	switch (Weapon)
	{
	case EBloodRitualWeapon::Tomahawk:
		return NSLOCTEXT("BloodRitual", "WeaponTomahawk", "Tomahawk");
	case EBloodRitualWeapon::RockSledge:
		return NSLOCTEXT("BloodRitual", "WeaponRockSledge", "Rock sledgehammer");
	case EBloodRitualWeapon::Bow:
		return NSLOCTEXT("BloodRitual", "WeaponBow", "Bow");
	case EBloodRitualWeapon::Rifle:
		return NSLOCTEXT("BloodRitual", "WeaponRifle", "Rifle");
	default:
		return NSLOCTEXT("BloodRitual", "WeaponNone", "Unarmed");
	}
}

bool BloodRitualWeapons::IsHeadshot(const AActor* Target, const FVector& Point)
{
	const UCapsuleComponent* Capsule = Target != nullptr ? Cast<UCapsuleComponent>(Target->GetRootComponent()) : nullptr;
	if (Capsule == nullptr)
	{
		return false;
	}
	const float Top = Capsule->GetComponentLocation().Z + Capsule->GetScaledCapsuleHalfHeight();
	return Point.Z >= Top - HeadHeight;
}
