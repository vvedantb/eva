# Automation event triggers are switches

- An event automation now shows one switch per event: PR opened, commit pushed, PR merged and issue labelled.
- Any switched-on event starts a run, so one automation can cover several events.
- The combined "PR opened or a commit is pushed" option is gone; switch on both events instead.
- The last switch that is on cannot be turned off, because an event automation needs at least one event.
- Existing automations keep their event; a one-time migration moves them to the new format.
