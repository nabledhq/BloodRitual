# 0006. Host-owned save game

Status: Accepted

## Context

Progress (camp, world state, missions, characters) must survive between
sessions. With a listen server (ADR 0005) the host already owns the
authoritative state. Alternatives are per-player saves that must be merged,
or a cloud/backend store.

## Decision

* The save game is **owned by the host**: the hosting player's machine
  stores the camp, world state, mission progress and every participating
  player's character, keyed by their online identity.
* Save at phase boundaries (end of day, end of night) and on graceful exit,
  using `USaveGame` subclasses and the engine's save system.
* Clients receive state through replication on join; a returning client's
  character is restored from the host's save.
* Code in `Source/BloodRitual/Persistence/`.

## Consequences

* One consistent world per host; no merge of divergent saves.
* A player's progress in a given camp lives with that camp's host. Players
  who host their own camp have their own save. This is the accepted
  trade-off; portable per-player characters are a possible later feature.
* Steam Cloud sync of the host's save is a later, optional addition.
