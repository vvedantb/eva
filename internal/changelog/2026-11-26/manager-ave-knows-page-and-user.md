# Manager Ave knows the page and the user

- Every message to Manager Ave now carries the page the user has open (path with search, page title) and their time zone (`ave.send` `pageContext`, read at send time in `useAveChat`). It is stored on the user row (`aveMessages.pageContext`).
- The run puts that page in front of each user turn (`_ave/context.ts`), so "this session" or "this repo" resolves from the path instead of a follow-up question.
- Ave's instructions now name the user (name and admin flag; email is left out, as Ave has no use for it) and explain how to read the page line (`_ave/prompt.ts`).
- `pageContext` is required on `ave.send`; no compat shim. Only the web app calls it.
