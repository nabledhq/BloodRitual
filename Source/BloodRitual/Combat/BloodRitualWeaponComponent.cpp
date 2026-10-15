// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Combat/BloodRitualWeaponComponent.h"

#include "BloodRitualSettings.h"
#include "Combat/BloodRitualArrow.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "World/BloodRitualNoiseSubsystem.h"
#include "AnimationRuntime.h"
#include "Components/PointLightComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/OverlapResult.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Character.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"
#include "UObject/ConstructorHelpers.h"

namespace BloodRitualWeaponTuning
{
	const FName HandBone(TEXT("hand_r"));

	// Ranged shots start level with the owner, so nothing between the camera and him is hit.
	constexpr float ArrowAimRange = 6000.0f;

	// The rifle's muzzle, roughly, in front of his chest; the flash lights it for a moment.
	const FVector MuzzleOffset(110.0f, 0.0f, 45.0f);
	constexpr float FlashSeconds = 0.06f;
	constexpr float FlashIntensity = 30000.0f;

	// Arrows leave from his chest, a little in front of him.
	const FVector ArrowSpawnOffset(70.0f, 0.0f, 50.0f);
}

UBloodRitualWeaponComponent::UBloodRitualWeaponComponent()
{
	PrimaryComponentTick.bCanEverTick = true;

	// Resolved here so the class default object hard-references the meshes and the cooker
	// packages them (scripts/editor/import_weapons.py imports them).
	ConstructorHelpers::FObjectFinder<UStaticMesh> TomahawkFinder(TEXT("/Game/Weapons/SM_Tomahawk.SM_Tomahawk"));
	ConstructorHelpers::FObjectFinder<UStaticMesh> RockSledgeFinder(TEXT("/Game/Weapons/SM_RockSledge.SM_RockSledge"));
	ConstructorHelpers::FObjectFinder<UStaticMesh> BowFinder(TEXT("/Game/Weapons/SM_Bow.SM_Bow"));
	ConstructorHelpers::FObjectFinder<UStaticMesh> RifleFinder(TEXT("/Game/Weapons/SM_Rifle.SM_Rifle"));
	TomahawkMesh = TomahawkFinder.Object;
	RockSledgeMesh = RockSledgeFinder.Object;
	BowMesh = BowFinder.Object;
	RifleMesh = RifleFinder.Object;
}

void UBloodRitualWeaponComponent::BeginPlay()
{
	Super::BeginPlay();

	AActor* Owner = GetOwner();
	ACharacter* Character = Cast<ACharacter>(Owner);
	USkeletalMeshComponent* Body = Character != nullptr ? Character->GetMesh() : nullptr;
	if (Body == nullptr || Body->GetSkeletalMeshAsset() == nullptr)
	{
		return;
	}

	HeldMesh = NewObject<UStaticMeshComponent>(Owner, TEXT("HeldWeapon"));
	HeldMesh->SetCollisionProfileName(UCollisionProfile::NoCollision_ProfileName);
	HeldMesh->SetGenerateOverlapEvents(false);
	HeldMesh->SetCanEverAffectNavigation(false);
	HeldMesh->SetupAttachment(Body, BloodRitualWeaponTuning::HandBone);
	HeldMesh->RegisterComponent();

	// The weapon meshes sit in his hand at the rest pose, in mesh space; undo the hand's rest
	// transform so they follow the hand from there.
	const FReferenceSkeleton& RefSkeleton = Body->GetSkeletalMeshAsset()->GetRefSkeleton();
	const int32 HandIndex = RefSkeleton.FindBoneIndex(BloodRitualWeaponTuning::HandBone);
	if (HandIndex != INDEX_NONE)
	{
		const FTransform HandRest = FAnimationRuntime::GetComponentSpaceTransformRefPose(RefSkeleton, HandIndex);
		HeldMesh->SetRelativeTransform(HandRest.Inverse());
	}

	MuzzleFlash = NewObject<UPointLightComponent>(Owner, TEXT("MuzzleFlash"));
	MuzzleFlash->SetupAttachment(Owner->GetRootComponent());
	MuzzleFlash->SetRelativeLocation(BloodRitualWeaponTuning::MuzzleOffset);
	MuzzleFlash->SetIntensity(BloodRitualWeaponTuning::FlashIntensity);
	MuzzleFlash->SetLightColor(FLinearColor(1.0f, 0.75f, 0.4f));
	MuzzleFlash->SetAttenuationRadius(600.0f);
	MuzzleFlash->SetCastShadows(false);
	MuzzleFlash->SetVisibility(false);
	MuzzleFlash->RegisterComponent();

	UpdateHeldMesh();
}

void UBloodRitualWeaponComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	Advance(DeltaTime);
}

EBloodRitualWeapon UBloodRitualWeaponComponent::SelectWeapon(EBloodRitualWeapon Weapon)
{
	// Not mid-swing; switching abandons a reload. The cooldown carries over, so swapping back
	// and forth does not fire faster.
	if (SwingContactSecondsLeft >= 0.0f)
	{
		return CurrentWeapon;
	}
	ReloadSecondsLeft = 0.0f;
	CurrentWeapon = (Weapon == CurrentWeapon) ? EBloodRitualWeapon::None : Weapon;
	UpdateHeldMesh();
	return CurrentWeapon;
}

void UBloodRitualWeaponComponent::UpdateHeldMesh()
{
	if (HeldMesh == nullptr)
	{
		return;
	}
	UStaticMesh* Mesh = nullptr;
	switch (CurrentWeapon)
	{
	case EBloodRitualWeapon::Tomahawk: Mesh = TomahawkMesh; break;
	case EBloodRitualWeapon::RockSledge: Mesh = RockSledgeMesh; break;
	case EBloodRitualWeapon::Bow: Mesh = BowMesh; break;
	case EBloodRitualWeapon::Rifle: Mesh = RifleMesh; break;
	default: break;
	}
	HeldMesh->SetStaticMesh(Mesh);
	HeldMesh->SetVisibility(Mesh != nullptr);
}

EBloodRitualAttackResult UBloodRitualWeaponComponent::Attack(const FVector& ViewLocation, const FVector& ViewDirection)
{
	if (IsBusy() || CurrentWeapon == EBloodRitualWeapon::None)
	{
		return EBloodRitualAttackResult::None;
	}

	switch (BloodRitualWeapons::GetHold(CurrentWeapon))
	{
	case EBloodRitualWeaponHold::Melee:
	{
		const float Rate = GetSwingRate();
		SwingWeapon = CurrentWeapon;
		SwingContactSecondsLeft = BloodRitualWeapons::SwingContactSeconds / Rate;
		CooldownSecondsLeft = BloodRitualWeapons::SwingClipSeconds / Rate;
		return EBloodRitualAttackResult::Swing;
	}
	case EBloodRitualWeaponHold::Ranged:
		return CurrentWeapon == EBloodRitualWeapon::Rifle ? FireRifle(ViewLocation, ViewDirection) : FireBow(ViewLocation, ViewDirection);
	default:
		return EBloodRitualAttackResult::None;
	}
}

EBloodRitualAttackResult UBloodRitualWeaponComponent::FireRifle(const FVector& ViewLocation, const FVector& ViewDirection)
{
	if (LoadedRounds <= 0)
	{
		return EBloodRitualAttackResult::DryFire;
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	--LoadedRounds;
	CooldownSecondsLeft = Settings->RifleShotIntervalSeconds;
	Flash();
	ReportNoise(Settings->RifleNoiseRadius);

	FHitResult Hit;
	TraceView(ViewLocation, ViewDirection, Settings->RifleRange, Hit);
	AActor* Target = Hit.GetActor();
	const UBloodRitualHealthComponent* TargetHealth = Target != nullptr ? Target->FindComponentByClass<UBloodRitualHealthComponent>() : nullptr;
	if (TargetHealth != nullptr && !TargetHealth->IsDead())
	{
		const bool bHead = BloodRitualWeapons::IsHeadshot(Target, Hit.ImpactPoint);
		const float Damage = Settings->RifleDamage * (bHead ? Settings->HeadshotMultiplier : 1.0f);
		AActor* Owner = GetOwner();
		UGameplayStatics::ApplyDamage(Target, Damage, Owner->GetInstigatorController(), Owner, UDamageType::StaticClass());
		NotifyHit();
	}
	return EBloodRitualAttackResult::Shot;
}

EBloodRitualAttackResult UBloodRitualWeaponComponent::FireBow(const FVector& ViewLocation, const FVector& ViewDirection)
{
	UBloodRitualInventoryComponent* Inventory = GetInventory();
	if (Inventory == nullptr || !Inventory->RemoveSupply(EBloodRitualSupplyType::Ammo, 1))
	{
		return EBloodRitualAttackResult::DryFire;
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	CooldownSecondsLeft = Settings->BowShotIntervalSeconds;
	ReportNoise(Settings->BowNoiseRadius);

	AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (World == nullptr)
	{
		return EBloodRitualAttackResult::Shot;
	}
	FHitResult Hit;
	const FVector AimPoint = TraceView(ViewLocation, ViewDirection, BloodRitualWeaponTuning::ArrowAimRange, Hit);
	const FVector Start = Owner->GetActorTransform().TransformPosition(BloodRitualWeaponTuning::ArrowSpawnOffset);
	const FVector Direction = (AimPoint - Start).GetSafeNormal();

	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = Owner;
	SpawnParams.Instigator = Cast<APawn>(Owner);
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (ABloodRitualArrow* Arrow = World->SpawnActor<ABloodRitualArrow>(ABloodRitualArrow::StaticClass(), Start, Direction.Rotation(), SpawnParams))
	{
		Arrow->Launch(Direction * Settings->ArrowSpeed, Settings->ArrowDamage, this);
	}
	return EBloodRitualAttackResult::Shot;
}

bool UBloodRitualWeaponComponent::StartReload()
{
	const int32 MagazineSize = GetDefault<UBloodRitualSettings>()->RifleMagazineSize;
	if (CurrentWeapon != EBloodRitualWeapon::Rifle || IsBusy() || LoadedRounds >= MagazineSize || GetCarriedAmmo() <= 0)
	{
		return false;
	}
	ReloadSecondsLeft = FMath::Max(GetDefault<UBloodRitualSettings>()->RifleReloadSeconds, KINDA_SMALL_NUMBER);
	return true;
}

int32 UBloodRitualWeaponComponent::GetCarriedAmmo() const
{
	const UBloodRitualInventoryComponent* Inventory = GetInventory();
	return Inventory != nullptr ? Inventory->GetSupplyCount(EBloodRitualSupplyType::Ammo) : 0;
}

float UBloodRitualWeaponComponent::GetSwingRate() const
{
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	switch (CurrentWeapon)
	{
	case EBloodRitualWeapon::Tomahawk: return Settings->TomahawkSwingRate;
	case EBloodRitualWeapon::RockSledge: return Settings->RockSledgeSwingRate;
	default: return 1.0f;
	}
}

void UBloodRitualWeaponComponent::Interrupt()
{
	CooldownSecondsLeft = 0.0f;
	ReloadSecondsLeft = 0.0f;
	SwingContactSecondsLeft = -1.0f;
}

void UBloodRitualWeaponComponent::Advance(float DeltaSeconds)
{
	if (DeltaSeconds <= 0.0f)
	{
		return;
	}
	SecondsSinceHit += DeltaSeconds;
	CooldownSecondsLeft = FMath::Max(CooldownSecondsLeft - DeltaSeconds, 0.0f);

	if (SwingContactSecondsLeft >= 0.0f)
	{
		SwingContactSecondsLeft -= DeltaSeconds;
		if (SwingContactSecondsLeft < 0.0f)
		{
			LandSwing();
		}
	}

	if (ReloadSecondsLeft > 0.0f)
	{
		ReloadSecondsLeft -= DeltaSeconds;
		if (ReloadSecondsLeft <= 0.0f)
		{
			ReloadSecondsLeft = 0.0f;
			UBloodRitualInventoryComponent* Inventory = GetInventory();
			const int32 Wanted = GetDefault<UBloodRitualSettings>()->RifleMagazineSize - LoadedRounds;
			const int32 Taken = FMath::Min(Wanted, GetCarriedAmmo());
			if (Inventory != nullptr && Taken > 0 && Inventory->RemoveSupply(EBloodRitualSupplyType::Ammo, Taken))
			{
				LoadedRounds += Taken;
			}
		}
	}

	if (FlashSecondsLeft > 0.0f)
	{
		FlashSecondsLeft -= DeltaSeconds;
		if (FlashSecondsLeft <= 0.0f && MuzzleFlash != nullptr)
		{
			MuzzleFlash->SetVisibility(false);
		}
	}
}

void UBloodRitualWeaponComponent::LandSwing()
{
	AActor* Owner = GetOwner();
	UWorld* World = GetWorld();
	if (Owner == nullptr || World == nullptr)
	{
		return;
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	const bool bSledge = SwingWeapon == EBloodRitualWeapon::RockSledge;
	const float Reach = bSledge ? Settings->RockSledgeReach : Settings->TomahawkReach;
	const float Damage = bSledge ? Settings->RockSledgeDamage : Settings->TomahawkDamage;

	// Everything alive in a half disc in front of him, out to Reach.
	const FVector Origin = Owner->GetActorLocation();
	const FVector Forward = Owner->GetActorForwardVector().GetSafeNormal2D();
	TArray<FOverlapResult> Overlaps;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(BloodRitualMeleeSwing), false, Owner);
	World->OverlapMultiByObjectType(Overlaps, Origin + Forward * (Reach * 0.5f), FQuat::Identity,
		FCollisionObjectQueryParams(ECC_Pawn), FCollisionShape::MakeSphere(Reach * 0.6f), Params);

	TSet<AActor*> Struck;
	for (const FOverlapResult& Overlap : Overlaps)
	{
		AActor* Target = Overlap.GetActor();
		if (Target == nullptr || Target == Owner || Struck.Contains(Target))
		{
			continue;
		}
		const UBloodRitualHealthComponent* TargetHealth = Target->FindComponentByClass<UBloodRitualHealthComponent>();
		const FVector ToTarget = (Target->GetActorLocation() - Origin).GetSafeNormal2D();
		if (TargetHealth == nullptr || TargetHealth->IsDead() || FVector::DotProduct(ToTarget, Forward) < 0.2f)
		{
			continue;
		}
		Struck.Add(Target);
		UGameplayStatics::ApplyDamage(Target, Damage, Owner->GetInstigatorController(), Owner, UDamageType::StaticClass());
		if (bSledge)
		{
			if (ACharacter* Victim = Cast<ACharacter>(Target))
			{
				Victim->LaunchCharacter(ToTarget * Settings->RockSledgeKnockback + FVector(0.0f, 0.0f, 250.0f), true, true);
			}
		}
	}
	if (Struck.Num() > 0)
	{
		NotifyHit();
		ReportNoise(Settings->MeleeNoiseRadius);
	}
}

FVector UBloodRitualWeaponComponent::TraceView(const FVector& ViewLocation, const FVector& ViewDirection, float Range, FHitResult& OutHit) const
{
	const AActor* Owner = GetOwner();
	const FVector Direction = ViewDirection.GetSafeNormal();
	const float Behind = FMath::Max(FVector::DotProduct(Owner->GetActorLocation() - ViewLocation, Direction), 0.0f);
	const FVector Start = ViewLocation + Direction * Behind;
	const FVector End = Start + Direction * Range;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(BloodRitualWeaponTrace), false, Owner);
	// The Pawn channel: the ground and scenery block it, and so do character capsules.
	if (GetWorld() != nullptr && GetWorld()->LineTraceSingleByChannel(OutHit, Start, End, ECC_Pawn, Params))
	{
		return OutHit.ImpactPoint;
	}
	return End;
}

void UBloodRitualWeaponComponent::Flash()
{
	if (MuzzleFlash != nullptr)
	{
		MuzzleFlash->SetVisibility(true);
		FlashSecondsLeft = BloodRitualWeaponTuning::FlashSeconds;
	}
}

UBloodRitualInventoryComponent* UBloodRitualWeaponComponent::GetInventory() const
{
	const AActor* Owner = GetOwner();
	return Owner != nullptr ? Owner->FindComponentByClass<UBloodRitualInventoryComponent>() : nullptr;
}

void UBloodRitualWeaponComponent::ReportNoise(float Radius) const
{
	if (Radius <= 0.0f)
	{
		return;
	}
	if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
	{
		AActor* Owner = GetOwner();
		Noise->EmitNoise(Owner->GetActorLocation(), Radius, Owner);
	}
}
