# Projects: Eva and her tasks have separate models

- Eva always runs on the model and account picked in her chat's composer, also when she wakes on her own (`coordinatorWakeDelivery.ts`). Before, a wake ran on the project's model.
- The project's model row now reads "Tasks" (web and phone): it sets the model and account the project's tasks run on (`runSettings.ts`, unchanged).
- A new Eva chat still starts on the project's model; after that it keeps its own pick.
- Filters and labels on the Tasks list moved to v4 in the orchestrator plan.
