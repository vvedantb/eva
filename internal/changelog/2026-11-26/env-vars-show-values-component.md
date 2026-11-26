# Env vars: shared reveal and copy component, with a "Show values" switch

- New `EnvironmentVariables` component (after AI Elements): one store for revealed values, reveal and copy buttons, and a masked or revealed value.
- Repo and team env var settings get a "Show values" switch that reveals or hides every variable and API key at once.
- `EnvVarsTable` and `EnvVarProviderSlots` share that store, so their copied reveal and copy code is gone.
- Web only: the phone app has no env var settings.
