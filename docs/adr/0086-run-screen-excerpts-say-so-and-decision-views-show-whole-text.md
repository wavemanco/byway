# ADR-0086: Run-screen artifact info is an excerpt with its completeness stated; decision views show whole text; row facts come from whole bytes

| | |
|---|---|
| **Status** | Accepted |
| **Decided by** | Delegated: Claude implemented the verified recommendation from the 2026-10-08 external-review verification under the user's goal "complete implementation of all fixes that can be implemented independent of the four decisions"; not explicitly approved; reversible. |
| **Date (local, UTC−7)** | 2026-10-08 20:30 |
| **Track** | Product |

## Context

The external review's finding F13 (human half), confirmed by both verifiers, showed that the Run screen decided on partial evidence without saying so:

- The data the Run screen polls carried one representation of each text artifact: its first 16,000 bytes, under the name `text`, with no completeness flag or size. The bytes were cut before decoding, so a character split at the cut became U+FFFD.
- The excerpt was built for step rows and contact sheets (spec §5, "excerpts for text"). The large decision views showed it as if it were the artifact, with no notice: the before/after compare, the references beside write, react, directive, confirm and select questions, a step opened from the timeline, and the finished run's preview. A compare of two long memos that differ only in their closing paragraph, as a TELLS swap can, showed two identical columns.
- An option map or storyboard longer than 16 KB failed to parse from the excerpt and was shown as a raw fragment.
- The design review found a third kind of consumer. A step row counted a diff's files and lines from the excerpt and stated the result as fact: a 54 KB, 12-file diff read "4 files, +142 −142".
- Pick cards for text drafts had no way to the whole draft.

The model half of F13 (lineup cards) is [ADR-0087](0087-lineup-evidence-full-words-and-disclosed-card-budget.md).

## Decision

- **The contract says what it carries.** `ArtifactInfo.text` becomes `excerpt`, with `complete` and `bytes` beside it. Renaming the field made the compiler list every consumer, and each now chooses one of three things: a snippet, the whole text, or a server fact.
  - The excerpt is the opening of a text artifact, at most 16,000 bytes, cut on a character boundary (a streaming decode holds back a split character). It is the whole text only when `complete` is true.
  - The excerpt size is unchanged, and the polled data never carries whole texts.
- **Row facts are counted from the whole artifact, on the server.** `diffstat` (files, additions, deletions) comes from parsing the whole diff, and `titles` from the whole option map. A step row reads these, never the excerpt.
- **Views people decide in show the whole text.** A large preview whose excerpt is not complete loads the whole text once from the artifact's own address. The loader keeps one promise per content-addressed id for the page's lifetime and forgets a failed load, so the next view retries.
  - Until the text arrives, or if loading fails, the preview says "Showing the first 16 KB of 23 KB while the rest loads" (or "…; the rest could not be loaded here"), with a link to open the whole text in the viewer.
  - The loaded state starts empty and is set after mounting, so the server's HTML and the first render in the browser agree.
  - This covers the compare, references, a step's detail and the finished run's preview without changing those panels.
- **JSON is read only from whole text.** A large preview of a partial option map or storyboard shows the option titles (a server fact) or "Loading the whole text…", never a raw fragment.
- **Thumbnails and pick cards are snippets, with a one-click whole view.** They show the excerpt with no notice, as they always have; every pick card now has Open to the whole-artifact viewer ([ADR-0085](0085-generated-pages-inert-unless-a-frame-asks-with-consent.md)), which reads the artifact whole from the store. A diff snippet does not show the counts of its last, cut file.
- **Readers of the excerpt are reviewed.** A scan test lists the files allowed to read `.excerpt`, each with its reason: the artifact preview, a step row's snippet and a pick card's snippet. A new reader fails the test until it is reviewed.

This narrows spec §5: excerpts belong to step rows, cards and thumbnails; views people decide in show whole text.

## Alternatives considered

- **Ship the whole text in every poll.** No excerpt state at all, but every poll would carry the full text of every artifact on screen.
- **A notice and a link only, without loading the rest.** Small, but the compare would still show two identical columns and ask the person to choose between them, and row counts would stay false.
- **Richer metadata (source artifact, transformation policy) and a JSON text API.** These fields had no consumer, and the artifact's own address already serves the whole text to the app.

## Consequences

**Positive**

- A compare, a reference or a step's detail shows the whole text once it has loaded, and says when it does not.
- A step row's counts are true for the whole diff, and an option map's titles are all of them.
- No excerpt ends in a broken character.

**Negative**

- A large view of a long text costs one extra request per artifact per page load (shared by every view of it).
- The server decodes and parses a diff or an option map in full on every poll that includes it, with no cache. A poll includes an artifact when the event that made it is new to that poll (so every artifact, on a page's first poll), and includes the artifacts of open questions and the run's output on every poll. The store already read and checked each of those artifacts whole on every such poll before this change; the parse is the added cost. Remembering the facts by content-addressed id would remove it, if it shows up.
- Thumbnails and cards stay snippets by design. Their counts (a diff's per-file numbers) may be partial, apart from the cut file's, which is hidden.

## Evidence

- [External-review verification, 2026-10-08](../reviews/2026-10-08-external-review-verification.md): F13 and Cluster C, Change 2 (the verifiers' reproductions, the critic's diffstat reproduction, the final check's residuals). The original review is outside the repository, at `C:/Users/arvik/code/byway_review/byway-review.md` (read-only).
- Tests:
  - `apps/web/test/evidence.test.ts`:
    - a 19,561-byte memo is marked incomplete with its size;
    - 15,999 ASCII bytes and an emoji give no U+FFFD;
    - a 54 KB, 12-file diff gives 12 files, +480 −480;
    - a 36-option map gives every title.

    Run against the previous `artifactInfo`, these four failed. The same file also covers:
    - the step row's count;
    - the partial notice and its link;
    - the whole text rendered to its last words;
    - JSON read only from whole text;
    - the diff snippet's hidden counts;
    - the loader's cache and its retry after a failure;
    - the reviewed readers of `.excerpt`.
  - `apps/web/e2e/artifact-views.spec.ts`, on seeded runs:
    - a compare of two memos of about 17 KB that differ only in their endings shows both endings;
    - a 19.5 KB memo's last sentence shows in its step detail and in the viewer;
    - the 12-file diff's row reads "12 files, +480 −480".

    Before this change these cases failed: the row read "4 files, +120 −122".
