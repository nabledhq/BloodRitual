// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleGameState.h"

#include "Seminole.h"

void ASeminoleGameState::DepositSupplies(const FSeminoleSupplyBundle& Bundle)
{
	if (Bundle.IsEmpty())
	{
		return;
	}
	Stockpile.Add(Bundle);
	UE_LOG(LogSeminole, Log, TEXT("SeminoleGameState: deposited %s; stockpile is now %s."), *Bundle.ToString(), *Stockpile.ToString());
	OnStockpileChanged.Broadcast(Stockpile);
}

bool ASeminoleGameState::TrySpend(ESeminoleSupplyType Type, int32 Amount)
{
	if (Amount < 0)
	{
		return false;
	}
	int32& Count = Stockpile.GetRef(Type);
	if (Count < Amount)
	{
		return false;
	}
	Count -= Amount;
	OnStockpileChanged.Broadcast(Stockpile);
	return true;
}
