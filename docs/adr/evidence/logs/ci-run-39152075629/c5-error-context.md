# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: configurations.spec.ts >> C5 Ad Video Chain: problem to deliverable, every turn answered in the app
- Location: e2e\configurations.spec.ts:106:3

# Error details

```
Error: Nothing happened in 120 s after answering 8d684d33-1fa1-490d-a563-e3bacaff0fbe/cp7-voice.
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
  - banner [ref=e6]:
    - generic [ref=e7]:
      - link "byway, start" [ref=e8] [cursor=pointer]:
        - /url: /
        - generic [ref=e11]: byway
      - navigation "Main" [ref=e12]:
        - link "Start" [ref=e13] [cursor=pointer]:
          - /url: /
        - link "Library" [ref=e14] [cursor=pointer]:
          - /url: /library
        - link "History 1 run is waiting for you" [ref=e15] [cursor=pointer]:
          - /url: /history
          - text: History
          - generic [ref=e16]:
            - text: "1"
            - generic [ref=e17]: run is waiting for you
        - link "Settings" [ref=e18] [cursor=pointer]:
          - /url: /settings
  - main [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - paragraph [ref=e23]:
            - text: Ad Video Chain
            - generic [ref=e24]: Untested — not yet studied
          - heading "A 30-second video ad for a neighbourhood bakery" [level=1] [ref=e26]
        - generic [ref=e27]:
          - generic [ref=e28]:
            - paragraph [ref=e29]:
              - text: $0.00
              - generic [ref=e30]: of $1.00
            - meter "Spent of this run’s budget" [ref=e31]
          - generic [ref=e32]: Your turn
          - generic [ref=e33]:
            - button "Pause" [ref=e34] [cursor=pointer]
            - button "Cancel" [ref=e35] [cursor=pointer]
      - list "Progress through the recipe" [ref=e37]:
        - listitem [ref=e38]:
          - generic [ref=e39]:
            - text: Explore
            - generic [ref=e40]: ", done"
          - list [ref=e41]:
            - 'listitem "Random spark: Eight separate sessions, each with its own random spark, propose a creative territory." [ref=e42]':
              - generic [ref=e44]: Random spark
              - generic [ref=e45]: ", AI"
            - 'listitem "Merge near-duplicates: The AI merges territories that say the same thing into one." [ref=e46]':
              - generic [ref=e48]: Merge near-duplicates
              - generic [ref=e49]: ", AI"
            - 'listitem "Obvious-answer check: Territories that plain sessions with no spark also come up with are flagged." [ref=e50]':
              - generic [ref=e52]: Obvious-answer check
              - generic [ref=e53]: ", AI"
            - 'listitem "Shortlist: Your turn: shortlist up to three territories." [ref=e54]':
              - generic [ref=e56]: Shortlist
              - generic [ref=e57]: ", You"
            - 'listitem "Your direction: Your turn: as creative director, give the brief, the shot list and the style you want." [ref=e58]':
              - generic [ref=e60]: Your direction
              - generic [ref=e61]: ", You"
            - 'listitem "Concepts: The AI builds a concept for each shortlisted territory, under your direction." [ref=e62]':
              - generic [ref=e64]: Concepts
              - generic [ref=e65]: ", AI"
            - 'listitem "Pick a concept: Your turn: choose the concept to produce." [ref=e66]':
              - generic [ref=e68]: Pick a concept
              - generic [ref=e69]: ", You"
            - 'listitem "Your words: the script: Your turn: write the voice-over script and every spoken claim. From here on it is locked, and nothing changes it." [ref=e70]':
              - generic [ref=e72]: "Your words: the script"
              - generic [ref=e73]: ", You"
        - listitem [ref=e74]:
          - generic [ref=e75]:
            - text: Refine
            - generic [ref=e76]: ", done"
          - list [ref=e77]:
            - 'listitem "Custom imagery: The AI makes the key frames, product shots and style frames the shots will start from." [ref=e78]':
              - generic [ref=e80]: Custom imagery
              - generic [ref=e81]: ", AI"
            - 'listitem "Motion: Shot by shot, each clip starts from the last frame of the one before. Each clip’s last frame is checked for visible defects against the frame it started from, and the clip is remade when needed; the motion between them is not checked. Without a video provider set up, the run stops at the storyboard and images, and nothing is checked." [ref=e82]':
              - generic [ref=e84]: Motion
              - generic [ref=e85]: ", AI"
            - 'listitem "Composite: The AI makes one more clip of the last shot, starting where the chain ended. Placing the product into each scene and cutting it out is not available in this version, so that part is skipped." [ref=e86]':
              - generic [ref=e88]: Composite
              - generic [ref=e89]: ", AI"
            - 'listitem "Voice-over audio: Not available in this version: no voice-over audio is made, and your locked script stays with the storyboard." [ref=e90]':
              - generic [ref=e92]: Voice-over audio
              - generic [ref=e93]: ", AI"
        - listitem [ref=e94]:
          - generic [ref=e95]:
            - text: Finish
            - generic [ref=e96]: ", in progress"
          - list [ref=e97]:
            - 'listitem "Trim: Your turn: cut the ad down to one message; the AI removes what you list from the shots. The voice-over stays as you locked it." [ref=e98]':
              - generic [ref=e100]: Trim
              - generic [ref=e101]: ", You"
            - 'listitem "Cliché sweep: A fresh reviewer lists the stock visual habits it finds, each with an alternative; you choose which ones, if any, the AI swaps." [ref=e102]':
              - generic [ref=e104]: Cliché sweep
              - generic [ref=e105]: ", AI"
            - 'listitem "Keep or revert: Your turn: compare the version before the swaps with the one after, and keep whichever you prefer." [ref=e106]':
              - generic [ref=e108]: Keep or revert
              - generic [ref=e109]: ", You"
            - 'listitem "Your words: Your turn: write the headline, the tagline and each shot''s caption. The voice-over stays as you locked it." [ref=e110]':
              - generic [ref=e112]: Your words
              - generic [ref=e113]: ", You"
            - 'listitem "Outside critique: launch check: The ad is judged from its storyboard (its frames as they were generated, or its shots written out) and ranked against strong ads in its category. If it lands below the middle, production runs once more on its own; then you decide." [ref=e114]':
              - generic [ref=e116]: "Outside critique: launch check"
              - generic [ref=e117]: ", AI"
      - paragraph [ref=e118]: "Your turn: What should go? List what to remove, one item per line."
      - generic [ref=e119]:
        - region [ref=e121]:
          - generic [ref=e122]:
            - paragraph [ref=e123]:
              - generic [ref=e124]: Your turn
              - generic [ref=e125]: Trim
            - heading "What should go? List what to remove, one item per line." [level=2] [ref=e126]
          - generic [ref=e127]:
            - generic [ref=e128]:
              - list [ref=e129]:
                - listitem [ref=e130]:
                  - generic [aria-hidden] [ref=e131]: "1"
                  - textbox "Item 1" [active] [ref=e132]:
                    - /placeholder: Something to remove
                  - button "Remove item 1" [ref=e133] [cursor=pointer]
              - button "Add an item" [ref=e136] [cursor=pointer]
              - paragraph [ref=e137]: Enter adds an item. Only what you list is removed.
            - region "For reference" [ref=e138]:
              - heading "For reference" [level=3] [ref=e139]
              - list [ref=e140]:
                - listitem [ref=e141]:
                  - generic [ref=e142]:
                    - paragraph [ref=e143]: "Headline: Less waiting. More doing. Tagline: Built to get out of your way."
                    - paragraph [ref=e144]: "Shot 1 (3s): Open on a small, everyday frustration. On screen: Again? Shot 2 (6s): Introduce warmer and plainer, please: lead with what people get, and keep it short in use, without explanation. On screen: Meet the shortcut. Shot 3 (6s): Show the moment it saves time. On screen: Done before the kettle boils. Shot 4 (4s): Cut to the person enjoying the time they got back. On screen: This is the time you got back. Shot 5 (6s): Close on the name and one line. On screen: Warmer and plainer, please: lead with what people get, and keep it short"
                    - paragraph [ref=e145]: "Voice-over: Some things should take less time. With warmer and plainer, please: lead with what people get, and keep it short, they do. Spend it on something better."
                  - link "Open Reference 1 in a new tab" [ref=e146] [cursor=pointer]:
                    - /url: /view/sha256%3Aaeb4a4380b75060114373dba1470d5f271d311d8888f6d5bdc766f0054f3ca5e
                    - text: Open
                    - generic [ref=e147]: Reference 1 in a new tab
                - listitem [ref=e148]:
                  - img "Reference 2" [ref=e149]
                  - link "Open Reference 2 in a new tab" [ref=e150] [cursor=pointer]:
                    - /url: /view/sha256%3Ad98c219ef302d79340f24779617323aa4f951b5030454f0b513bf948f573a315
                    - text: Open
                    - generic [ref=e151]: Reference 2 in a new tab
                - listitem [ref=e152]:
                  - img "Reference 3" [ref=e153]
                  - link "Open Reference 3 in a new tab" [ref=e154] [cursor=pointer]:
                    - /url: /view/sha256%3A786bbb7a7afcbbcdf4d3215060de98c91f8fa0e328e86f4775c3581b37140232
                    - text: Open
                    - generic [ref=e155]: Reference 3 in a new tab
                - listitem [ref=e156]:
                  - img "Reference 4" [ref=e157]
                  - link "Open Reference 4 in a new tab" [ref=e158] [cursor=pointer]:
                    - /url: /view/sha256%3A8a5c17aa4f0ef7bfe231918f6cbd93130f69f6fbc3a6bd22c5a8f38abfe95259
                    - text: Open
                    - generic [ref=e159]: Reference 4 in a new tab
                - listitem [ref=e160]:
                  - img "Reference 5" [ref=e161]
                  - link "Open Reference 5 in a new tab" [ref=e162] [cursor=pointer]:
                    - /url: /view/sha256%3A8c4e1cd1d9772e233ce53c02a19e0a112778caa54584a78c1fd1c9504769ff0c
                    - text: Open
                    - generic [ref=e163]: Reference 5 in a new tab
                - listitem [ref=e164]:
                  - img "Reference 6" [ref=e165]
                  - link "Open Reference 6 in a new tab" [ref=e166] [cursor=pointer]:
                    - /url: /view/sha256%3A97d85e917c5f1b47d06d731061351764269f80997fd3dc27e44e02dafd0c3ac2
                    - text: Open
                    - generic [ref=e167]: Reference 6 in a new tab
                - listitem [ref=e168]:
                  - paragraph [ref=e170]: No defects.
                  - link "Open Reference 7 in a new tab" [ref=e171] [cursor=pointer]:
                    - /url: /view/sha256%3Ad05b43518860bdba5014f25b5db82c561486bbb49b71fdaff51f982e84fc951e
                    - text: Open
                    - generic [ref=e172]: Reference 7 in a new tab
          - status [ref=e173]
          - generic [ref=e174]:
            - generic [ref=e175]:
              - paragraph [ref=e176]: 0 to remove
              - list "Keyboard shortcuts" [ref=e177]:
                - listitem [ref=e178]:
                  - generic [ref=e179]: Ctrl+Enter
                  - text: send
            - button "Send the list" [disabled] [ref=e180]
        - complementary "Steps" [ref=e181]:
          - generic [ref=e182]:
            - region "Explore" [ref=e183]:
              - heading "Explore" [level=2] [ref=e184]
              - list [ref=e185]:
                - listitem [ref=e186]:
                  - generic [ref=e187]: "Done:"
                  - generic [ref=e191]:
                    - button "Random spark" [ref=e193] [cursor=pointer]
                    - paragraph [ref=e194]: AI, 8 drafts
                    - paragraph [ref=e196]: "8 cards: Random spark, Random spark, Random spark, Random spark, Random spark, Random spark, Random spark, Random spark"
                - listitem [ref=e197]:
                  - generic [ref=e198]: "Done:"
                  - generic [ref=e202]:
                    - button "Merge near-duplicates" [ref=e204] [cursor=pointer]
                    - paragraph [ref=e205]: AI
                    - paragraph [ref=e207]: "6 cards: Storyboard as read, Storyboard as read, Storyboard as read, Storyboard as read, Storyboard as read, Storyboard as read"
                - listitem [ref=e208]:
                  - generic [ref=e209]: "Done:"
                  - generic [ref=e213]:
                    - button "Obvious-answer check" [ref=e215] [cursor=pointer]
                    - paragraph [ref=e216]: AI, 3 drafts
                    - paragraph [ref=e218]: "4 cards: Obvious-answer check, Obvious-answer check, Obvious-answer check, Obvious-answer check: Overlap flags"
                - listitem [ref=e219]:
                  - generic [ref=e220]: "Done:"
                  - generic [ref=e224]:
                    - button "Shortlist" [ref=e226] [cursor=pointer]
                    - paragraph [ref=e227]: You
                - listitem [ref=e228]:
                  - generic [ref=e229]: "Done:"
                  - generic [ref=e233]:
                    - button "Your direction" [ref=e235] [cursor=pointer]
                    - paragraph [ref=e236]: You
                - listitem [ref=e237]:
                  - generic [ref=e238]: "Done:"
                  - generic [ref=e242]:
                    - button "Concepts" [ref=e244] [cursor=pointer]
                    - paragraph [ref=e245]: AI, 3 drafts
                    - paragraph [ref=e247]: "3 cards: Concepts, Concepts, Concepts"
                - listitem [ref=e248]:
                  - generic [ref=e249]: "Done:"
                  - generic [ref=e253]:
                    - button "Pick a concept" [ref=e255] [cursor=pointer]
                    - paragraph [ref=e256]: You
                - listitem [ref=e257]:
                  - generic [ref=e258]: "Done:"
                  - generic [ref=e262]:
                    - 'button "Your words: the script" [ref=e264] [cursor=pointer]'
                    - paragraph [ref=e265]: You
            - region "Refine" [ref=e266]:
              - heading "Refine" [level=2] [ref=e267]
              - list [ref=e268]:
                - listitem [ref=e269]:
                  - generic [ref=e270]: "Done:"
                  - generic [ref=e274]:
                    - button "Custom imagery" [ref=e276] [cursor=pointer]
                    - paragraph [ref=e277]: AI
                    - generic [ref=e278]:
                      - list "5 outputs" [ref=e279]:
                        - listitem [ref=e280]:
                          - 'img "Image: Open on a small, everyday frustration." [ref=e281]'
                        - listitem [ref=e282]:
                          - 'img "Image: Introduce warmer and plainer, please: lead with what people get, and keep it sho" [ref=e283]'
                        - listitem [ref=e284]:
                          - 'img "Image: Show the moment it saves time." [ref=e285]'
                        - listitem [ref=e286]:
                          - 'img "Image: Cut to the person enjoying the time they got back." [ref=e287]'
                        - listitem [ref=e288]: "+1"
                      - paragraph [ref=e289]: "{ \"storyboard\": [ { \"shot\": 1, \"description\": \"Open on a small, everyday frustration.\", \"imagePrompt\": \"Close-up of…"
                - listitem [ref=e290]:
                  - generic [ref=e291]: "Done:"
                  - generic [ref=e295]:
                    - button "Motion" [ref=e297] [cursor=pointer]
                    - paragraph [ref=e298]: AI
                    - generic [ref=e299]:
                      - list "8 outputs" [ref=e300]:
                        - listitem [ref=e301]:
                          - img "Clip for shot 1" [ref=e302]
                        - listitem [ref=e303]:
                          - img "Last frame of shot 1" [ref=e304]
                        - listitem [ref=e305]:
                          - img "Clip for shot 2" [ref=e306]
                        - listitem [ref=e307]:
                          - img "Last frame of shot 2" [ref=e308]
                        - listitem [ref=e309]: "+4"
                      - paragraph [ref=e310]: "12 cards: Storyboard with the clip for shot 1, Shot 1 as read, Motion: Defects, Storyboard with the clip for shot 2, Shot 2 as read, Motion: Defects, Storyboard with the clip for shot 3, Shot 3 as read, Motion: Defects, Storyboard with the clip for shot 4, Shot 4 as read, Motion: Defects"
                - listitem [ref=e311]:
                  - generic [ref=e315]:
                    - button "Composite" [ref=e317] [cursor=pointer]
                    - paragraph [ref=e318]: AI, Part skipped
                    - paragraph [ref=e319]: Compositing is not available in byway yet
                    - generic [ref=e320]:
                      - list "2 outputs" [ref=e321]:
                        - listitem [ref=e322]:
                          - img "Clip for shot 5" [ref=e323]
                        - listitem [ref=e324]:
                          - img "Last frame of shot 5" [ref=e325]
                      - paragraph [ref=e326]: "{ \"storyboard\": [ { \"shot\": 1, \"description\": \"Open on a small, everyday frustration.\", \"imagePrompt\": \"Close-up of…"
                - listitem [ref=e327]:
                  - generic [ref=e330]:
                    - button "Voice-over audio" [ref=e332] [cursor=pointer]
                    - paragraph [ref=e333]: Skipped
                    - paragraph [ref=e334]: No voice-over audio provider is configured
            - region "Finish" [ref=e335]:
              - heading "Finish" [level=2] [ref=e336]
              - list [ref=e337]:
                - listitem [ref=e338]:
                  - generic [ref=e339]: "Done:"
                  - generic [ref=e343]:
                    - button "Trim" [ref=e345] [cursor=pointer]
                    - paragraph [ref=e346]: You
                    - paragraph [ref=e348]: "2 cards: Storyboard as read, Trim"
                - listitem [ref=e349]:
                  - generic [ref=e350]: "Done:"
                  - generic [ref=e354]:
                    - button "Cliché sweep" [ref=e356] [cursor=pointer]
                    - paragraph [ref=e357]: AI
                    - paragraph [ref=e359]: "3 cards: Storyboard as read, Cliché sweep: Cliché hits, Cliché sweep"
                - listitem [ref=e360]:
                  - generic [ref=e361]: "Done:"
                  - generic [ref=e365]:
                    - button "Keep or revert" [ref=e367] [cursor=pointer]
                    - paragraph [ref=e368]: You
                    - paragraph [ref=e369]: Nothing was swapped, so there was nothing to compare
                    - paragraph [ref=e371]: "Headline: Less waiting. More doing. Tagline: Built to get out of your way. Shot 1 (3s): Open on a small, everyday…"
                - listitem [ref=e372]:
                  - generic [ref=e373]: "Done:"
                  - generic [ref=e377]:
                    - button "Your words" [ref=e379] [cursor=pointer]
                    - paragraph [ref=e380]: You
                - listitem [ref=e381]:
                  - generic [ref=e382]: "Done:"
                  - generic [ref=e386]:
                    - 'button "Outside critique: launch check" [ref=e388] [cursor=pointer]'
                    - paragraph [ref=e389]: AI
                    - paragraph [ref=e390]: No examples were supplied, so the outside critique scored the work against a quality bar instead of ranking it against examples. It did not pass the final check, so the earlier stage runs again with the same brief.
                    - paragraph [ref=e392]: "2 cards: Storyboard as read, Outside critique: launch check: Critique"
            - region "Refine" [ref=e393]:
              - heading "Refine" [level=2] [ref=e394]
              - list [ref=e395]:
                - listitem [ref=e396]:
                  - generic [ref=e397]: "Done:"
                  - generic [ref=e401]:
                    - button "Custom imagery" [ref=e403] [cursor=pointer]
                    - paragraph [ref=e404]: AI, round 2
                    - generic [ref=e405]:
                      - list "5 outputs" [ref=e406]:
                        - listitem [ref=e407]:
                          - 'img "Image: Open on a small, everyday frustration." [ref=e408]'
                        - listitem [ref=e409]:
                          - 'img "Image: Introduce warmer and plainer, please: lead with what people get, and keep it sho" [ref=e410]'
                        - listitem [ref=e411]:
                          - 'img "Image: Show the moment it saves time." [ref=e412]'
                        - listitem [ref=e413]:
                          - 'img "Image: Cut to the person enjoying the time they got back." [ref=e414]'
                        - listitem [ref=e415]: "+1"
                      - paragraph [ref=e416]: "{ \"storyboard\": [ { \"shot\": 1, \"description\": \"Open on a small, everyday frustration.\", \"imagePrompt\": \"Close-up of…"
                - listitem [ref=e417]:
                  - generic [ref=e418]: "Done:"
                  - generic [ref=e422]:
                    - button "Motion" [ref=e424] [cursor=pointer]
                    - paragraph [ref=e425]: AI, round 2
                    - generic [ref=e426]:
                      - list "8 outputs" [ref=e427]:
                        - listitem [ref=e428]:
                          - img "Clip for shot 1" [ref=e429]
                        - listitem [ref=e430]:
                          - img "Last frame of shot 1" [ref=e431]
                        - listitem [ref=e432]:
                          - img "Clip for shot 2" [ref=e433]
                        - listitem [ref=e434]:
                          - img "Last frame of shot 2" [ref=e435]
                        - listitem [ref=e436]: "+4"
                      - paragraph [ref=e437]: "12 cards: Storyboard with the clip for shot 1, Shot 1 as read, Motion: Defects, Storyboard with the clip for shot 2, Shot 2 as read, Motion: Defects, Storyboard with the clip for shot 3, Shot 3 as read, Motion: Defects, Storyboard with the clip for shot 4, Shot 4 as read, Motion: Defects"
                - listitem [ref=e438]:
                  - generic [ref=e442]:
                    - button "Composite" [ref=e444] [cursor=pointer]
                    - paragraph [ref=e445]: AI, Part skipped, round 2
                    - paragraph [ref=e446]: Compositing is not available in byway yet
                    - generic [ref=e447]:
                      - list "2 outputs" [ref=e448]:
                        - listitem [ref=e449]:
                          - img "Clip for shot 5" [ref=e450]
                        - listitem [ref=e451]:
                          - img "Last frame of shot 5" [ref=e452]
                      - paragraph [ref=e453]: "{ \"storyboard\": [ { \"shot\": 1, \"description\": \"Open on a small, everyday frustration.\", \"imagePrompt\": \"Close-up of…"
                - listitem [ref=e454]:
                  - generic [ref=e457]:
                    - button "Voice-over audio" [ref=e459] [cursor=pointer]
                    - paragraph [ref=e460]: Skipped
                    - paragraph [ref=e461]: No voice-over audio provider is configured
            - region "Finish" [ref=e462]:
              - heading "Finish" [level=2] [ref=e463]
              - list [ref=e464]:
                - listitem [ref=e465]:
                  - generic [ref=e466]: "Your turn:"
                  - generic [ref=e470]:
                    - button "Trim" [ref=e472] [cursor=pointer]
                    - paragraph [ref=e473]: Your turn
                    - paragraph [ref=e475]: "Headline: Less waiting. More doing. Tagline: Built to get out of your way. Shot 1 (3s): Open on a small, everyday…"
  - alert [ref=e476]: A 30-second video ad for a neighbourhood bakery
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
      |         ^ Error: Nothing happened in 120 s after answering 8d684d33-1fa1-490d-a563-e3bacaff0fbe/cp7-voice.
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