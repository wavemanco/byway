# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: configurations.spec.ts >> C5 Ad Video Chain: problem to deliverable, every turn answered in the app
- Location: e2e\configurations.spec.ts:106:3

# Error details

```
Error: Nothing happened in 120 s after answering d136dede-0cb8-493d-8c88-85daed238e54/cp4-vo-script.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - note [ref=e3]:
    - paragraph [ref=e4]:
      - text: Demo mode — sample outputs, no AI calls.
      - link "Set up providers" [ref=e5] [cursor=pointer]:
        - /url: /settings#providers
  - status [ref=e6]
  - banner [ref=e7]:
    - generic [ref=e8]:
      - link "byway, start" [ref=e9] [cursor=pointer]:
        - /url: /
        - generic [ref=e12]: byway
      - navigation "Main" [ref=e13]:
        - link "Start" [ref=e14] [cursor=pointer]:
          - /url: /
        - link "Library" [ref=e15] [cursor=pointer]:
          - /url: /library
        - link "History 1 run is waiting for you" [ref=e16] [cursor=pointer]:
          - /url: /history
          - text: History
          - generic [ref=e17]:
            - text: "1"
            - generic [ref=e18]: run is waiting for you
        - link "Settings" [ref=e19] [cursor=pointer]:
          - /url: /settings
  - main [ref=e20]:
    - generic [ref=e21]:
      - generic [ref=e22]:
        - generic [ref=e23]:
          - paragraph [ref=e24]:
            - text: Ad Video Chain
            - generic [ref=e25]: Untested — not yet studied
          - heading "A 30-second video ad for a neighbourhood bakery" [level=1] [ref=e27]
        - generic [ref=e28]:
          - generic [ref=e29]:
            - paragraph [ref=e30]:
              - text: $0.00
              - generic [ref=e31]: of $1.00
            - meter "Spent of this run’s budget" [ref=e32]
          - generic [ref=e33]: Your turn
          - generic [ref=e34]:
            - button "Pause" [ref=e35] [cursor=pointer]
            - button "Cancel" [ref=e36] [cursor=pointer]
      - list "Progress through the recipe" [ref=e38]:
        - listitem [ref=e39]:
          - generic [ref=e40]:
            - text: Explore
            - generic [ref=e41]: ", done"
          - list [ref=e42]:
            - 'listitem "Random spark: Eight separate sessions, each with its own random spark, propose a creative territory." [ref=e43]':
              - generic [ref=e45]: Random spark
              - generic [ref=e46]: ", AI"
            - 'listitem "Merge near-duplicates: The AI merges territories that say the same thing into one." [ref=e47]':
              - generic [ref=e49]: Merge near-duplicates
              - generic [ref=e50]: ", AI"
            - 'listitem "Obvious-answer check: Territories that plain sessions with no spark also come up with are flagged." [ref=e51]':
              - generic [ref=e53]: Obvious-answer check
              - generic [ref=e54]: ", AI"
            - 'listitem "Shortlist: Your turn: shortlist up to three territories." [ref=e55]':
              - generic [ref=e57]: Shortlist
              - generic [ref=e58]: ", You"
            - 'listitem "Your direction: Your turn: as creative director, give the brief, the shot list and the style you want." [ref=e59]':
              - generic [ref=e61]: Your direction
              - generic [ref=e62]: ", You"
            - 'listitem "Concepts: The AI builds a concept for each shortlisted territory, under your direction." [ref=e63]':
              - generic [ref=e65]: Concepts
              - generic [ref=e66]: ", AI"
            - 'listitem "Pick a concept: Your turn: choose the concept to produce." [ref=e67]':
              - generic [ref=e69]: Pick a concept
              - generic [ref=e70]: ", You"
            - 'listitem "Your words: the script: Your turn: write the voice-over script and every spoken claim. From here on it is locked, and nothing changes it." [ref=e71]':
              - generic [ref=e73]: "Your words: the script"
              - generic [ref=e74]: ", You"
        - listitem [ref=e75]:
          - generic [ref=e76]:
            - text: Refine
            - generic [ref=e77]: ", done"
          - list [ref=e78]:
            - 'listitem "Custom imagery: The AI makes the key frames, product shots and style frames the shots will start from." [ref=e79]':
              - generic [ref=e81]: Custom imagery
              - generic [ref=e82]: ", AI"
            - 'listitem "Motion: Shot by shot, each clip starts from the last frame of the one before. Each clip’s last frame is checked for visible defects against the frame it started from, and the clip is remade when needed; the motion between them is not checked. Without a video provider set up, the run stops at the storyboard and images, and nothing is checked." [ref=e83]':
              - generic [ref=e85]: Motion
              - generic [ref=e86]: ", AI"
            - 'listitem "Composite: The AI makes one more clip of the last shot, starting where the chain ended. Placing the product into each scene and cutting it out is not available in this version, so that part is skipped." [ref=e87]':
              - generic [ref=e89]: Composite
              - generic [ref=e90]: ", AI"
            - 'listitem "Voice-over audio: Not available in this version: no voice-over audio is made, and your locked script stays with the storyboard." [ref=e91]':
              - generic [ref=e93]: Voice-over audio
              - generic [ref=e94]: ", AI"
        - listitem [ref=e95]:
          - generic [ref=e96]:
            - text: Finish
            - generic [ref=e97]: ", in progress"
          - list [ref=e98]:
            - 'listitem "Trim: Your turn: cut the ad down to one message; the AI removes what you list from the shots. The voice-over stays as you locked it." [ref=e99]':
              - generic [ref=e101]: Trim
              - generic [ref=e102]: ", You"
            - 'listitem "Cliché sweep: A fresh reviewer lists the stock visual habits it finds, each with an alternative; you choose which ones, if any, the AI swaps." [ref=e103]':
              - generic [ref=e105]: Cliché sweep
              - generic [ref=e106]: ", AI"
            - 'listitem "Keep or revert: Your turn: compare the version before the swaps with the one after, and keep whichever you prefer." [ref=e107]':
              - generic [ref=e109]: Keep or revert
              - generic [ref=e110]: ", You"
            - 'listitem "Your words: Your turn: write the headline, the tagline and each shot''s caption. The voice-over stays as you locked it." [ref=e111]':
              - generic [ref=e113]: Your words
              - generic [ref=e114]: ", You"
            - 'listitem "Outside critique: launch check: The ad is judged from its storyboard (its frames as they were generated, or its shots written out) and ranked against strong ads in its category. If it lands below the middle, production runs once more on its own; then you decide." [ref=e115]':
              - generic [ref=e117]: "Outside critique: launch check"
              - generic [ref=e118]: ", AI"
      - paragraph [ref=e119]: "Your turn: What should go? List what to remove, one item per line."
      - generic [ref=e120]:
        - region [ref=e122]:
          - generic [ref=e123]:
            - paragraph [ref=e124]:
              - generic [ref=e125]: Your turn
              - generic [ref=e126]: Trim
            - heading "What should go? List what to remove, one item per line." [level=2] [ref=e127]
          - generic [ref=e128]:
            - generic [ref=e129]:
              - list [ref=e130]:
                - listitem [ref=e131]:
                  - generic [aria-hidden] [ref=e132]: "1"
                  - textbox "Item 1" [active] [ref=e133]:
                    - /placeholder: Something to remove
                  - button "Remove item 1" [ref=e134] [cursor=pointer]
              - button "Add an item" [ref=e137] [cursor=pointer]
              - paragraph [ref=e138]: Enter adds an item. Only what you list is removed.
            - region "For reference" [ref=e139]:
              - heading "For reference" [level=3] [ref=e140]
              - list [ref=e141]:
                - listitem [ref=e142]:
                  - generic [ref=e143]:
                    - paragraph [ref=e144]: "Headline: The slow part, gone. Tagline: Built to get out of your way."
                    - paragraph [ref=e145]: "Shot 1 (3s): Open on a small, everyday frustration. On screen: Again? Shot 2 (6s): Introduce warmer and plainer, please: lead with what people get, and keep it short in use, without explanation. On screen: Meet the shortcut. Shot 3 (3s): Show the moment it saves time. On screen: Done before the kettle boils. Shot 4 (4s): Cut to the person enjoying the time they got back. On screen: This is the time you got back. Shot 5 (3s): Close on the name and one line. On screen: Warmer and plainer, please: lead with what people get, and keep it short"
                    - paragraph [ref=e146]: "Voice-over: Some things should take less time. With warmer and plainer, please: lead with what people get, and keep it short, they do. Spend it on something better."
                  - link "Open Reference 1 in a new tab" [ref=e147] [cursor=pointer]:
                    - /url: /view/sha256%3A3c33641efd7cc2546b89f73b8f68074ebbe7737080fba6bb362f83c6be39816c
                    - text: Open
                    - generic [ref=e148]: Reference 1 in a new tab
                - listitem [ref=e149]:
                  - img "Reference 2" [ref=e150]
                  - link "Open Reference 2 in a new tab" [ref=e151] [cursor=pointer]:
                    - /url: /view/sha256%3Adb9582df1978c63f536775933b783675d89459412cdff1b664181d2518f205f4
                    - text: Open
                    - generic [ref=e152]: Reference 2 in a new tab
                - listitem [ref=e153]:
                  - img "Reference 3" [ref=e154]
                  - link "Open Reference 3 in a new tab" [ref=e155] [cursor=pointer]:
                    - /url: /view/sha256%3Ad5a4cfdd744980eb2120672d52b62e1ca09c2ca29748f793a368d8698742d636
                    - text: Open
                    - generic [ref=e156]: Reference 3 in a new tab
                - listitem [ref=e157]:
                  - img "Reference 4" [ref=e158]
                  - link "Open Reference 4 in a new tab" [ref=e159] [cursor=pointer]:
                    - /url: /view/sha256%3Ad3091d17857f56805d5199e7b92d8dde444bbf950c830925302173d086779a9c
                    - text: Open
                    - generic [ref=e160]: Reference 4 in a new tab
                - listitem [ref=e161]:
                  - img "Reference 5" [ref=e162]
                  - link "Open Reference 5 in a new tab" [ref=e163] [cursor=pointer]:
                    - /url: /view/sha256%3Afd255c73fad0efe2711114ade92d795f03c2e31f996814448f33566e8e5863bb
                    - text: Open
                    - generic [ref=e164]: Reference 5 in a new tab
                - listitem [ref=e165]:
                  - img "Reference 6" [ref=e166]
                  - link "Open Reference 6 in a new tab" [ref=e167] [cursor=pointer]:
                    - /url: /view/sha256%3Aabd74fbacf7d564fa44c381418ddb41dedeb6919bcd283b53812f3eb24a423c1
                    - text: Open
                    - generic [ref=e168]: Reference 6 in a new tab
                - listitem [ref=e169]:
                  - paragraph [ref=e171]: No defects.
                  - link "Open Reference 7 in a new tab" [ref=e172] [cursor=pointer]:
                    - /url: /view/sha256%3Ad05b43518860bdba5014f25b5db82c561486bbb49b71fdaff51f982e84fc951e
                    - text: Open
                    - generic [ref=e173]: Reference 7 in a new tab
          - status [ref=e174]
          - generic [ref=e175]:
            - generic [ref=e176]:
              - paragraph [ref=e177]: 0 to remove
              - list "Keyboard shortcuts" [ref=e178]:
                - listitem [ref=e179]:
                  - generic [ref=e180]: Ctrl+Enter
                  - text: send
            - button "Send the list" [disabled] [ref=e181]
        - complementary "Steps" [ref=e182]:
          - generic [ref=e183]:
            - region "Explore" [ref=e184]:
              - heading "Explore" [level=2] [ref=e185]
              - list [ref=e186]:
                - listitem [ref=e187]:
                  - generic [ref=e188]: "Done:"
                  - generic [ref=e192]:
                    - button "Random spark" [ref=e194] [cursor=pointer]
                    - paragraph [ref=e195]: AI, 8 drafts
                    - paragraph [ref=e197]: "8 cards: Random spark, Random spark, Random spark, Random spark, Random spark, Random spark, Random spark, Random spark"
                - listitem [ref=e198]:
                  - generic [ref=e199]: "Done:"
                  - generic [ref=e203]:
                    - button "Merge near-duplicates" [ref=e205] [cursor=pointer]
                    - paragraph [ref=e206]: AI
                    - paragraph [ref=e208]: "6 cards: Storyboard as read, Storyboard as read, Storyboard as read, Storyboard as read, Storyboard as read, Storyboard as read"
                - listitem [ref=e209]:
                  - generic [ref=e210]: "Done:"
                  - generic [ref=e214]:
                    - button "Obvious-answer check" [ref=e216] [cursor=pointer]
                    - paragraph [ref=e217]: AI, 3 drafts
                    - paragraph [ref=e219]: "4 cards: Obvious-answer check, Obvious-answer check, Obvious-answer check, Obvious-answer check: Overlap flags"
                - listitem [ref=e220]:
                  - generic [ref=e221]: "Done:"
                  - generic [ref=e225]:
                    - button "Shortlist" [ref=e227] [cursor=pointer]
                    - paragraph [ref=e228]: You
                - listitem [ref=e229]:
                  - generic [ref=e230]: "Done:"
                  - generic [ref=e234]:
                    - button "Your direction" [ref=e236] [cursor=pointer]
                    - paragraph [ref=e237]: You
                - listitem [ref=e238]:
                  - generic [ref=e239]: "Done:"
                  - generic [ref=e243]:
                    - button "Concepts" [ref=e245] [cursor=pointer]
                    - paragraph [ref=e246]: AI, 3 drafts
                    - paragraph [ref=e248]: "3 cards: Concepts, Concepts, Concepts"
                - listitem [ref=e249]:
                  - generic [ref=e250]: "Done:"
                  - generic [ref=e254]:
                    - button "Pick a concept" [ref=e256] [cursor=pointer]
                    - paragraph [ref=e257]: You
                - listitem [ref=e258]:
                  - generic [ref=e259]: "Done:"
                  - generic [ref=e263]:
                    - 'button "Your words: the script" [ref=e265] [cursor=pointer]'
                    - paragraph [ref=e266]: You
            - region "Refine" [ref=e267]:
              - heading "Refine" [level=2] [ref=e268]
              - list [ref=e269]:
                - listitem [ref=e270]:
                  - generic [ref=e271]: "Done:"
                  - generic [ref=e275]:
                    - button "Custom imagery" [ref=e277] [cursor=pointer]
                    - paragraph [ref=e278]: AI
                    - generic [ref=e279]:
                      - list "5 outputs" [ref=e280]:
                        - listitem [ref=e281]:
                          - 'img "Image: Open on a small, everyday frustration." [ref=e282]'
                        - listitem [ref=e283]:
                          - 'img "Image: Introduce warmer and plainer, please: lead with what people get, and keep it sho" [ref=e284]'
                        - listitem [ref=e285]:
                          - 'img "Image: Show the moment it saves time." [ref=e286]'
                        - listitem [ref=e287]:
                          - 'img "Image: Cut to the person enjoying the time they got back." [ref=e288]'
                        - listitem [ref=e289]: "+1"
                      - paragraph [ref=e290]: "{ \"storyboard\": [ { \"shot\": 1, \"description\": \"Open on a small, everyday frustration.\", \"imagePrompt\": \"Close-up of…"
                - listitem [ref=e291]:
                  - generic [ref=e292]: "Done:"
                  - generic [ref=e296]:
                    - button "Motion" [ref=e298] [cursor=pointer]
                    - paragraph [ref=e299]: AI
                    - generic [ref=e300]:
                      - list "8 outputs" [ref=e301]:
                        - listitem [ref=e302]:
                          - img "Clip for shot 1" [ref=e303]
                        - listitem [ref=e304]:
                          - img "Last frame of shot 1" [ref=e305]
                        - listitem [ref=e306]:
                          - img "Clip for shot 2" [ref=e307]
                        - listitem [ref=e308]:
                          - img "Last frame of shot 2" [ref=e309]
                        - listitem [ref=e310]: "+4"
                      - paragraph [ref=e311]: "12 cards: Storyboard with the clip for shot 1, Shot 1 as read, Motion: Defects, Storyboard with the clip for shot 2, Shot 2 as read, Motion: Defects, Storyboard with the clip for shot 3, Shot 3 as read, Motion: Defects, Storyboard with the clip for shot 4, Shot 4 as read, Motion: Defects"
                - listitem [ref=e312]:
                  - generic [ref=e316]:
                    - button "Composite" [ref=e318] [cursor=pointer]
                    - paragraph [ref=e319]: AI, Part skipped
                    - paragraph [ref=e320]: Compositing is not available in byway yet
                    - generic [ref=e321]:
                      - list "2 outputs" [ref=e322]:
                        - listitem [ref=e323]:
                          - img "Clip for shot 5" [ref=e324]
                        - listitem [ref=e325]:
                          - img "Last frame of shot 5" [ref=e326]
                      - paragraph [ref=e327]: "{ \"storyboard\": [ { \"shot\": 1, \"description\": \"Open on a small, everyday frustration.\", \"imagePrompt\": \"Close-up of…"
                - listitem [ref=e328]:
                  - generic [ref=e331]:
                    - button "Voice-over audio" [ref=e333] [cursor=pointer]
                    - paragraph [ref=e334]: Skipped
                    - paragraph [ref=e335]: No voice-over audio provider is configured
            - region "Finish" [ref=e336]:
              - heading "Finish" [level=2] [ref=e337]
              - list [ref=e338]:
                - listitem [ref=e339]:
                  - generic [ref=e340]: "Your turn:"
                  - generic [ref=e344]:
                    - button "Trim" [ref=e346] [cursor=pointer]
                    - paragraph [ref=e347]: Your turn
                    - paragraph [ref=e349]: "Headline: The slow part, gone. Tagline: Built to get out of your way. Shot 1 (3s): Open on a small, everyday…"
  - alert [ref=e350]: A 30-second video ad for a neighbourhood bakery
```

# Test source

```ts
  1   | /**
  2   |  * What a person does in byway, as steps the specs share: describe the problem on Start, start the recommended recipe,
  3   |  * answer every "Your turn" through its panel, and reach the Result. Plus a watch on every request and response for
  4   |  * the stand-in provider keys (e2e/keys.ts).
  5   |  */
  6   | import { expect, type Locator, type Page } from '@playwright/test';
  7   | import type { CheckpointKind } from '@byway/contracts';
  8   | import { E2E_KEYS, SENTINEL } from './keys.ts';
  9   | 
  10  | const TEXTUAL = /^(text\/|application\/(json|javascript|x-component)|image\/svg\+xml)/;
  11  | 
  12  | export interface KeyWatchOptions {
  13  |   /**
  14  |    * The path of the one POST whose body is the person pasting a stand-in key on purpose (the refusal test, ADR-0088), or
  15  |    * a test of the path, for a path that holds an id the test learns later (a run's checkpoint). Only that first
  16  |    * request's body is exempt; its URL and headers, every response and every other request are checked.
  17  |    */
  18  |   pastedTo?: string | ((pathname: string) => boolean);
  19  | }
  20  | 
  21  | /** Records every place a stand-in key appeared: request URLs, headers and bodies; response headers and bodies. */
  22  | export function watchForKeys(page: Page, opts: KeyWatchOptions = {}): { leaks: string[]; checked(): number; pastes(): number } {
  23  |   const leaks: string[] = [];
  24  |   let responses = 0;
  25  |   let pastes = 0;
  26  |   const scan = (where: string, text: string | null | undefined) => {
  27  |     if (!text || !text.includes(SENTINEL)) return;
  28  |     for (const [name, value] of Object.entries(E2E_KEYS)) if (text.includes(value)) leaks.push(`${name} in ${where}`);
  29  |   };
  30  |   const target = opts.pastedTo;
  31  |   const isTarget = (pathname: string) => (typeof target === 'string' ? pathname === target : target !== undefined && target(pathname));
  32  |   const pasted = (url: string, method: string) => method === 'POST' && isTarget(new URL(url).pathname) && pastes++ === 0;
  33  |   page.on('request', (req) => {
  34  |     scan(`request URL ${req.url()}`, req.url());
  35  |     scan(`request headers ${req.url()}`, JSON.stringify(req.headers()));
  36  |     if (!pasted(req.url(), req.method())) scan(`request body ${req.url()}`, req.postData());
  37  |   });
  38  |   page.on('response', async (res) => {
  39  |     scan(`response headers ${res.url()}`, JSON.stringify(res.headers()));
  40  |     const type = res.headers()['content-type'] ?? '';
  41  |     if (!TEXTUAL.test(type)) return;
  42  |     try {
  43  |       scan(`response body ${res.url()}`, await res.text());
  44  |       responses++;
  45  |     } catch {
  46  |       // Redirects and aborted navigations have no body.
  47  |     }
  48  |   });
  49  |   return { leaks, checked: () => responses, pastes: () => pastes };
  50  | }
  51  | 
  52  | /** Start: type the problem and ask for a recommendation. */
  53  | export async function describeProblem(page: Page, problem: string): Promise<void> {
  54  |   await page.goto('/');
  55  |   await page.getByLabel('What are you working on?').fill(problem);
  56  |   await page.getByRole('button', { name: /Get a recommendation/ }).click();
  57  |   await expect(page).toHaveURL(/\/recommend\//, { timeout: 60_000 });
  58  | }
  59  | 
  60  | /** Recommendation: check what byway recommends, then start it with the suggested budget. Returns the run id. */
  61  | export async function startRecommended(page: Page, recipeName: string): Promise<string> {
  62  |   await expect(page.locator('#proposal-title')).toHaveText(recipeName, { timeout: 60_000 });
  63  |   await expect(page.locator('.facts')).toContainText('Untested');
  64  |   await page.getByRole('button', { name: /^Start/ }).click();
  65  |   await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/, { timeout: 60_000 });
  66  |   return new URL(page.url()).pathname.split('/').pop() as string;
  67  | }
  68  | 
  69  | export interface Answered {
  70  |   kind: CheckpointKind;
  71  |   prompt: string;
  72  | }
  73  | 
  74  | /** A turn: its panel, pinned to its checkpoint id (a later panel is another locator), with the id and kind it showed. */
  75  | export type Outcome = { turn: Locator; id: string; kind: CheckpointKind } | { done: true } | { failed: string };
  76  | 
  77  | /** How long reading a panel may wait: a panel that is not there now has gone (the run moved on, or finished). */
  78  | const READ = { timeout: 1000 };
  79  | 
  80  | /**
  81  |  * Waits for a "Your turn" other than `after`, the run being done, or the run failing. A panel can go at any moment,
  82  |  * the last one as the run finishes, so everything about it is read without waiting; one that went is looked for again,
  83  |  * which also finds the run done.
  84  |  */
  85  | export async function nextTurn(page: Page, after: string | undefined, timeoutMs: number): Promise<Outcome> {
  86  |   const deadline = Date.now() + timeoutMs;
  87  |   const turn = page.locator('section.turn');
  88  |   while (Date.now() < deadline) {
  89  |     if (await page.locator('.state-done').isVisible()) return { done: true };
  90  |     const failed = page.getByRole('heading', { name: 'This run stopped with a problem' });
  91  |     if (await failed.isVisible()) return { failed: (await page.locator('.notice-danger').first().textContent()) ?? 'no reason' };
  92  |     const id = (await turn.count()) > 0 ? await turn.first().getAttribute('data-checkpoint', READ).catch(() => null) : null;
  93  |     if (id !== null && id !== after) {
  94  |       const pinned = page.locator(`section.turn[data-checkpoint="${id}"]`);
  95  |       const kind = await pinned.getAttribute('data-kind', READ).catch(() => null);
  96  |       if (kind !== null) return { turn: pinned, id, kind: kind as CheckpointKind };
  97  |     }
  98  |     await page.waitForTimeout(250);
  99  |   }
> 100 |   throw new Error(`Nothing happened in ${timeoutMs / 1000} s after ${after ? `answering ${after}` : 'starting'}.`);
      |         ^ Error: Nothing happened in 120 s after answering d136dede-0cb8-493d-8c88-85daed238e54/cp4-vo-script.
  101 | }
  102 | 
  103 | /** A "Your turn" a spec is answering: its panel (pinned to its checkpoint id), its id and its kind. */
  104 | export interface Turn {
  105 |   turn: Locator;
  106 |   id: string;
  107 |   kind: CheckpointKind;
  108 | }
  109 | 
  110 | /** The next "Your turn" other than `after`; fails if the run ends first. */
  111 | export async function turnAfter(page: Page, after?: string): Promise<Turn> {
  112 |   const outcome = await nextTurn(page, after, 120_000);
  113 |   if ('done' in outcome) throw new Error(`The run ended before another question${after ? ` after ${after}` : ''}.`);
  114 |   if ('failed' in outcome) throw new Error(`The run failed: ${outcome.failed}`);
  115 |   return { turn: outcome.turn, id: outcome.id, kind: outcome.kind };
  116 | }
  117 | 
  118 | /** Answers questions as they come until one of `kinds` is open. */
  119 | export async function untilTurn(page: Page, kinds: readonly CheckpointKind[], after?: string): Promise<Turn> {
  120 |   let last = after;
  121 |   for (let i = 0; i < 30; i++) {
  122 |     const t = await turnAfter(page, last);
  123 |     if (kinds.includes(t.kind)) return t;
  124 |     await answerTurn(page, t.turn, t.kind);
  125 |     last = t.id;
  126 |   }
  127 |   throw new Error(`No ${kinds.join(' or ')} question came.`);
  128 | }
  129 | 
  130 | /** The text field a text question is answered in: the editor, the reaction field, or the list's first item. */
  131 | export function answerField(t: Turn): Locator {
  132 |   return t.kind === 'directive' ? t.turn.getByRole('textbox', { name: 'Item 1', exact: true }) : t.turn.locator('textarea, .onscreen-copy input').first();
  133 | }
  134 | 
  135 | /** Text answers that read like a person's. */
  136 | const WORDS = {
  137 |   react: 'Warmer and plainer, please: lead with what people get, and keep it short.',
  138 |   directive: 'Remove the second paragraph.',
  139 |   write: 'This is my own draft, in my own words. It says plainly what I mean and stops.',
  140 | };
  141 | 
  142 | /** Answers one "Your turn" through its panel, the way a person would. */
  143 | export async function answerTurn(page: Page, turn: Locator, kind: CheckpointKind): Promise<void> {
  144 |   const primary = turn.locator('.turn-foot button.button-primary');
  145 |   switch (kind) {
  146 |     case 'pick': {
  147 |       const inputs = turn.locator('input.sheet-input');
  148 |       const type = await inputs.first().getAttribute('type');
  149 |       const status = (await turn.locator('.turn-status').textContent()) ?? '';
  150 |       const k = type === 'radio' ? 1 : Number(/of (\d+) chosen/.exec(status)?.[1] ?? 1);
  151 |       for (let i = 0; i < k; i++) await inputs.nth(i).check();
  152 |       await primary.click();
  153 |       return;
  154 |     }
  155 |     case 'select':
  156 |       // Any subset is an answer; a person who wants every swap ticks them all.
  157 |       for (const box of await turn.locator('input[type="checkbox"]').all()) await box.check();
  158 |       await primary.click();
  159 |       return;
  160 |     case 'choose':
  161 |       await turn.locator('input[type="radio"]').first().check();
  162 |       await primary.click();
  163 |       return;
  164 |     case 'compare':
  165 |       await turn.getByRole('button', { name: /^Keep this/ }).first().click();
  166 |       return;
  167 |     case 'confirm':
  168 |       await turn.getByRole('button', { name: 'Yes', exact: true }).click();
  169 |       return;
  170 |     case 'react':
  171 |       await turn.locator('textarea').fill(WORDS.react);
  172 |       await primary.click();
  173 |       return;
  174 |     case 'write': {
  175 |       const field = turn.locator('textarea');
  176 |       // On-screen copy (C4) comes as labelled fields, already filled; anything else is one text field.
  177 |       if ((await field.count()) > 0 && !(await field.inputValue()).trim()) await field.fill(WORDS.write);
  178 |       await primary.click();
  179 |       return;
  180 |     }
  181 |     case 'directive':
  182 |       await turn.getByRole('textbox', { name: 'Item 1', exact: true }).fill(WORDS.directive);
  183 |       await primary.click();
  184 |       return;
  185 |   }
  186 | }
  187 | 
  188 | /**
  189 |  * Run: answer every "Your turn" as it comes until the run is done. Fails with the run's own message if it stops with a
  190 |  * problem. Returns what was asked, in order.
  191 |  */
  192 | export async function answerUntilDone(
  193 |   page: Page,
  194 |   opts: { stepTimeoutMs?: number; maxTurns?: number; /** A checkpoint the test answered itself, so its fading panel is not answered again. */ after?: string } = {},
  195 | ): Promise<Answered[]> {
  196 |   const answered: Answered[] = [];
  197 |   let last: string | undefined = opts.after;
  198 |   for (let i = 0; i < (opts.maxTurns ?? 60); i++) {
  199 |     const outcome = await nextTurn(page, last, opts.stepTimeoutMs ?? 120_000);
  200 |     if ('done' in outcome) return answered;
```