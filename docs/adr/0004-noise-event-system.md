# 0004. Noise event system

Status: Accepted

## Context

Noise is the central tension of Seminole: scavenging quietly by day and
holding the camp at night both depend on what the infected hear. Footsteps,
gunshots, melee, paddling, doors, dropped items and camp work all make
noise. If each system reported noise its own way, the AI, audio and UI would
drift apart and tuning would be scattered.

## Decision

* Noise is **one shared gameplay event** handled by a single world subsystem
  (`Source/Seminole/World/`), with an API of the form
  `ReportNoise(Location, Loudness, Instigator, Tag)`.
* Every noise source calls this one entry point; nothing talks to AI
  Perception's hearing sense directly.
* The subsystem forwards the event to AI Perception hearing and broadcasts a
  delegate so audio, UI (noise indicator) and missions react to the same
  event.
* Loudness is a world-space radius; attenuation rules belong to the
  implementing ticket.
* Noise is authoritative on the host (see ADR 0005).

## Consequences

* One place to tune, log and visualise noise; one place to replicate it.
* AI, audio and UI agree on what happened, by construction.
* Every gameplay ticket that adds a noisy action depends on this subsystem
  and must call it; the stub README in `Source/Seminole/World/` records this.
