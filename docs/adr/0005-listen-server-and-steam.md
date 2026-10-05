# 0005. Listen server and Steam

Status: Accepted

## Context

Seminole is co-op for 1–4 players, sold on Steam. Options are a listen
server (one player's game hosts), dedicated servers (hosted by us or by
players) or peer-to-peer. Dedicated servers need infrastructure and
operations the project does not want; the player count is small and sessions
are friend groups.

## Decision

* **Listen server**: the hosting player's game is the authority. Single
  player is a listen server with no clients.
* **Steam** (`OnlineSubsystemSteam`) provides sessions, invites and
  friends-join. The Steam AppID and Steamworks configuration are added by
  the Steam ticket, not now.
* Authority on the host for AI, noise, damage, inventory mutations, loot and
  the day/night clock. Clients predict only their own movement.
* Code in `Source/Seminole/Multiplayer/`.

## Consequences

* No server infrastructure to run or pay for; sessions live and die with the
  host.
* Host advantage (zero latency) is accepted for a co-op game.
* Replication is designed from the start: every gameplay system ticket
  states what replicates and what is host-only.
* Dedicated servers, MMO-style worlds and backend orchestration are out of
  scope.
