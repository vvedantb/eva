# Automations can run on a teammate's shared account

- The automation Model setting now has an account picker, like the chat composer.
- It lists the automation creator's own accounts and the accounts teammates have shared with them.
- Runs bill to the picked account; with no pick they use the team credential, as before.
- Teammates who edit an automation pick from the creator's accounts, because runs use the creator's credentials.
- A picked account that no longer fits the model, or is no longer shared, falls back to the creator's own default.
