# Tests

Automation tests (`IMPLEMENT_SIMPLE_AUTOMATION_TEST`) for the game module, compiled only with `WITH_DEV_AUTOMATION_TESTS`.

Run them from the editor: **Tools > Session Frontend > Automation**, filter `BloodRitual`, Start Tests. From a terminal:

    "<UE_ROOT>\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" "<repo>\BloodRitual.uproject" -ExecCmds="Automation RunTests BloodRitual; Quit" -unattended -nopause -nullrhi -log

Helpers: `FBloodRitualTestWorld` creates a throwaway game world (no game mode, so `BeginPlay` does not run) and `UBloodRitualPhaseRecorder` records day-clock phases from the dynamic delegate.

| Test | Covers |
| --- | --- |
| `BloodRitual.Survival.DayClock.Transitions` | Day -> Dusk -> Night at the configured durations, time remaining, stop at Night, `ResetToDay` |
| `BloodRitual.Survival.DayClock.LargeStepCrossesPhasesInOrder` | one large `Advance` broadcasts Dusk then Night in order |
| `BloodRitual.World.Noise.RadiusFiltering` | listeners inside the radius hear (3D distance), outside and unregistered do not; event payload |
| `BloodRitual.Inventory.LootFlow` | container search grants once, second search grants nothing, deposit empties the inventory, `TrySpend` |
