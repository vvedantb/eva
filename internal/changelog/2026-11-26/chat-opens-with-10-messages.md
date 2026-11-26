# Chats open with the newest 10 messages, not 30

- Paging was already in place: a chat opens from a tail, follows it live, and loads older history on scroll in pages that double. The cost of switching was the tail itself: each assistant row carries an activity log.
- `TRANSCRIPT_TAIL_MESSAGES` drops from 30 to 10 in `@eva/shared`, so the web and the phone both open with less.
- Load test (`--only messages.listByParent.tail`, 20 samples, medians), before → after: 34 → 14 documents read, 507.5 → 234.8 KB read, 283.0 → 129.4 KB returned, at 10× and 100×. A chat open sends the tail and then the live list over the same rows, so about 566 → 259 KB per open.
- Server time did not change in a clear way on the local backend (10×: 54 → 46 ms; 100×: 218 → 227 ms). The README explains why: the local backend's large index ranges are slow whatever they return.
- The load test's tail case now uses `transcriptTailArgs`, so it always measures what the apps ask for (new `@eva/shared/chatTranscript` subpath, because plain Node cannot load the barrel).
