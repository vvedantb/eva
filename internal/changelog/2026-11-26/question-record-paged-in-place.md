# Answered questions: placed where asked, paged one at a time

- Web: an answered AskUserQuestion record sits in the step timeline where the agent asked it, not under the whole trace (`splitStepsAtQuestions` in `@eva/shared`, `ActivityTimeline` in `StreamingActivityDisplay`).
- A settled folded turn keeps one "Worked for" fold; while closed, the questions show under it.
- A prompt with several questions shows one at a time with an "n/total" count and back / next arrows at the right end of the "Question" header row (`AssistantQuestionRecord`, through the new `headerAction` slot of `ActivityQuestionCard` in `@vvedantb/ui` 0.64.0).
- The coordinator bubble and simple view have no timeline, so they still list the records under the reply.
- Phone not changed yet: `splitStepsAtQuestions` is ready for `AssistantMessage`.
