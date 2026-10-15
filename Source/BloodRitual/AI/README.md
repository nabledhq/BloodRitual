# AI

Infected AI. The planned design: StateTree assets' C++ tasks, conditions and evaluators, AI Perception setup (sight and hearing) and NavMesh movement. The state flow is Idle -> Wander -> Hear Noise -> Investigate -> Detect Player -> Chase -> Attack -> Lose Player -> Search -> Wander.

Implemented (ADR 0012): `ABloodRitualInfected`, the first enemy's body (health, hearing through `IBloodRitualNoiseListener`, the blow, hit reactions, death), and `ABloodRitualInfectedController`, its brain: the state flow above as a small C++ state machine (Wander, Investigate, Chase with Attack, Search) with sight, proximity, noise and being hurt as senses, steering straight at its goal because the runtime-spawned slice map has no NavMesh. Moving to StateTree, AI Perception and NavMesh is still the AI ticket.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).
