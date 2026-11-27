# Thumbs on chat recaps

- The recap card has thumbs up and down, with the same comment box as a turn. The title of an away recap also says when the user left ("Since you left 3 hours ago").
- `feedback.rateRecap` writes into the existing `feedback` table with a new optional `recapId`, so ratings show on the Feedback page with a "Recap" label. No new table.
- The recap row is deleted on Dismiss, so the feedback row keeps its own `recapId` and outlives it.
- `useChatRecap` (`@eva/shared`) returns `rating` and `rate`, so web and phone share the logic. The web card reuses the new `ThumbsRating`, which `TurnFeedbackActions` now also wraps. The phone card has thumbs without a comment box, as its turn thumbs.
