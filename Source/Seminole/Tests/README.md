# Tests

Automation tests (`IMPLEMENT_SIMPLE_AUTOMATION_TEST`) for the game module, compiled only with `WITH_DEV_AUTOMATION_TESTS`.

Run them from the editor: **Tools > Session Frontend > Automation**, filter `Seminole`, Start Tests. From a terminal:

    "<UE_ROOT>\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" "<repo>\Seminole.uproject" -ExecCmds="Automation RunTests Seminole; Quit" -unattended -nopause -nullrhi -log

Helpers: `FSeminoleTestWorld` creates a throwaway game world (no game mode, so `BeginPlay` does not run) and `USeminolePhaseRecorder` records day-clock phases from the dynamic delegate.

| Test | Covers |
| --- | --- |
| `Seminole.Survival.DayClock.Transitions` | Day -> Dusk -> Night at the configured durations, time remaining, stop at Night, `ResetToDay` |
| `Seminole.Survival.DayClock.LargeStepCrossesPhasesInOrder` | one large `Advance` broadcasts Dusk then Night in order |
| `Seminole.World.Noise.RadiusFiltering` | listeners inside the radius hear (3D distance), outside and unregistered do not; event payload |
| `Seminole.Inventory.LootFlow` | container search grants once, second search grants nothing, deposit empties the inventory, `TrySpend` |
