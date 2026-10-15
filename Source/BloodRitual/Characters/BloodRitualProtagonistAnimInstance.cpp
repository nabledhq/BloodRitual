// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Characters/BloodRitualProtagonistAnimInstance.h"

#include "BloodRitualProtagonistCharacter.h"
#include "Combat/BloodRitualWeaponComponent.h"
#include "GameFramework/CharacterMovementComponent.h"

namespace BloodRitualProtagonistAnimTuning
{
	// Raising the weapon takes about a tenth of a second, lowering it a little longer.
	constexpr float AimEaseSpeed = 12.0f;
}

void UBloodRitualProtagonistAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
	Super::NativeUpdateAnimation(DeltaSeconds);

	const ABloodRitualProtagonistCharacter* Character = Cast<ABloodRitualProtagonistCharacter>(TryGetPawnOwner());
	if (Character == nullptr)
	{
		return;
	}

	GroundSpeed = Character->GetVelocity().Size2D();
	bFalling = Character->GetCharacterMovement()->IsFalling();
	bCrouched = Character->bIsCrouched;
	bDead = Character->IsDead();

	const UBloodRitualWeaponComponent* Weapons = Character->GetWeapons();
	const EBloodRitualWeaponHold Hold = Weapons != nullptr ? Weapons->GetHold() : EBloodRitualWeaponHold::Unarmed;
	bArmed = Hold != EBloodRitualWeaponHold::Unarmed;
	bRanged = Hold == EBloodRitualWeaponHold::Ranged;

	const float WantedAim = Character->IsAiming() && !bDead ? 1.0f : 0.0f;
	AimWeight = FMath::FInterpTo(AimWeight, WantedAim, DeltaSeconds, BloodRitualProtagonistAnimTuning::AimEaseSpeed);
}
