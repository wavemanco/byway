# The providers' price pages read for block 2 (2026-10-22 and 2026-10-23)

The price table's read dates (`packages/gateway/src/prices.ts`, `PRICES_CHECKED` 2026-10-22) rest on the providers' pages as block 2's prices builder read them on 2026-10-22, and the price report's fixes of 2026-10-23 were tried against copies of the pages saved that night. Both sets of copies were kept only in the session's scratchpad under Temp (backlog row "Bring block 2's Temp-only evidence into the repository", items 2 and 4). On 2026-10-23, in the records pass of block 2's second fix round, Claude recorded here what each copy is, its address, when it was saved, its size and its SHA-256, after scanning the copies for the owner's address and the organisation's details (no hits). The pages themselves were not brought in: they are the providers' own pages, and Claude did not check whether their terms allow a copy (Claude's choice). A hash shows whether a copy found later is the one read; it does not keep the page.

The save time is each file's modification time, which curl sets when it writes the file. The builder fetched the pages with curl and searched them as raw text. The files' names are as the scratchpad holds them.

## The full re-read of 2026-10-22 (`prices-2026-10-22/`)

Read by block 2's prices builder (d7ffbfa, PRICE-CADENCE) from 17:00 to 17:20 local, which was 00:00 to 00:20 UTC on 2026-10-23: every paid row against Anthropic's pricing page in Markdown, OpenAI's pricing page and its pricing script, Google's pricing page ("Last updated 2026-10-22 UTC"), OpenRouter's model list and fal's three model pages, and the guides the code's comments quote. Every figure the rows record matched (the builder's report). Four files are the builder's own text extracts or decoding of a page, marked so; they are not pages.

| File in the scratchpad | What it is | Saved (local, UTC−7; UTC) | Bytes | SHA-256 |
|---|---|---|---|---|
| PricingContextSelector.react.BXL81orh.js | https://developers.openai.com/_astro/PricingContextSelector.react.BXL81orh.js (the pricing page's script) | 2026-10-22 17:01:40 (2026-10-23T00:01:40Z) | 174 | `f4c18718639e3e616e933e4aa0d2fc9539af640fd38aa77c5be4fb63d8755eaf` |
| anthropic.md | https://platform.claude.com/docs/en/about-claude/pricing.md | 2026-10-22 17:00:22 (2026-10-23T00:00:22Z) | 51,236 | `62c66784feffbbbf1ee0c00641e82bb6320f425ec9ef602c6d082448dac1d131` |
| calc.js | the image guide's token calculator script, from developers.openai.com/_astro/ (GptImageTokenCalculator.react.*.js; its file name was not kept) | 2026-10-22 17:19:34 (2026-10-23T00:19:34Z) | 5,711 | `8d26047a80d013b9210225d7f40155125005e5b76f2378955e591ff893f236d2` |
| fal-ffmpeg-api_extract-frame.html | https://fal.ai/models/fal-ai/ffmpeg-api/extract-frame | 2026-10-22 17:02:53 (2026-10-23T00:02:53Z) | 300,262 | `b0c4de7d8872daae41210bf9112e1d9086e0131d142d0bd0543f9229313bf982` |
| fal-ffmpeg-api_extract-frame.html.txt | the builder's text extract of the page above (not a page) | 2026-10-22 17:05:26 (2026-10-23T00:05:26Z) | 2,577 | `55280f444862c5fb56fb67635edd928657eeea05b06f46fcf4a16c94f991e146` |
| fal-kling-video_v2.5-turbo_pro_image-to-video.html | https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video | 2026-10-22 17:02:51 (2026-10-23T00:02:51Z) | 319,583 | `4886fd529a578314af2de9dd16fc4ccf3d765e5950bcbd6bdc967c0630f5586b` |
| fal-kling-video_v2.5-turbo_pro_image-to-video.html.txt | the builder's text extract of the page above (not a page) | 2026-10-22 17:05:26 (2026-10-23T00:05:26Z) | 3,706 | `0a4ff765f7cf95428c1b70fc3fc52fea371c53a8a7677b987e148566b6696b40` |
| fal-kling-video_v3_pro_image-to-video.html | https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video | 2026-10-22 17:02:52 (2026-10-23T00:02:52Z) | 437,011 | `ab819bfe79f55f18bec5306d15580a05f665cd486e2bd86a3a449300636611ce` |
| fal-kling-video_v3_pro_image-to-video.html.txt | the builder's text extract of the page above (not a page) | 2026-10-22 17:05:26 (2026-10-23T00:05:26Z) | 9,509 | `a86d4be5c0dc5e88f60f967a1f7dd7f83dc1320153c92ae01bad2f3613a23721` |
| g-caching.html | https://ai.google.dev/gemini-api/docs/caching | 2026-10-22 17:05:44 (2026-10-23T00:05:44Z) | 91,181 | `203c456ec3efa7305535127cd66746a7310cf7e8bd8035419f2918e5432f1422` |
| g-image.html | https://ai.google.dev/gemini-api/docs/image-generation | 2026-10-22 17:05:45 (2026-10-23T00:05:45Z) | 1,446,896 | `3738c73bd3399f13735a611f70052831da8271bdae8e0e1c0f28eb8ef350a692` |
| google.html | https://ai.google.dev/gemini-api/docs/pricing (in English) | 2026-10-22 17:00:23 (2026-10-23T00:00:23Z) | 253,707 | `d0fc2d054e31d8c6885a32a0fda5b9663dc38230eb4456f159a537d68bb50bf7` |
| google.txt | the builder's text extract of google.html (not a page) | 2026-10-22 17:02:15 (2026-10-23T00:02:15Z) | 67,975 | `cc961ee6f05ce0bdb8b2d10472c39cf42f410a3d9e4cbac7c81e0d5b21a2ef41` |
| oa-caching.html | https://developers.openai.com/api/docs/guides/prompt-caching | 2026-10-22 17:05:44 (2026-10-23T00:05:44Z) | 817,779 | `11eda1236bcc4daabeff327d68673b6e2fdd9015e842d9411f574382086eb2b3` |
| oa-imagegen.html | https://developers.openai.com/api/docs/guides/image-generation | 2026-10-22 17:19:15 (2026-10-23T00:19:15Z) | 1,256,641 | `9c743d82bde9dca07bbc2f5b10b29dda4b199ee57904636b0f5b0ff697793cf1` |
| openai.decoded.txt | the builder's decoding of openai.html (not a page) | 2026-10-22 17:00:58 (2026-10-23T00:00:58Z) | 563,894 | `4d1f8833974e23ab43ed0795ccf46369976ce9d74e5c8b2b74ed731d0fc644ba` |
| openai.html | https://developers.openai.com/api/docs/pricing | 2026-10-22 17:00:22 (2026-10-23T00:00:22Z) | 577,063 | `f6bdcd25e5710bd389fd06293337e25019a7300943fe8b0ad40104f92d95009c` |
| openai.txt | the builder's text extract of openai.html (not a page) | 2026-10-22 17:00:44 (2026-10-23T00:00:44Z) | 20,129 | `9b6ec7ffc6c87b144497078b686693e29967e166d54ece9b2adaae1554703b29` |
| openrouter.json | https://openrouter.ai/api/v1/models | 2026-10-22 17:00:23 (2026-10-23T00:00:23Z) | 787,607 | `075dc34dc759d434f98d36c7a845956de2390bb4931b927ed81b923d2cbc1531` |
| pricing.DOaJHzjH.js | https://developers.openai.com/_astro/pricing.DOaJHzjH.js (the pricing page's script) | 2026-10-22 17:01:40 (2026-10-23T00:01:40Z) | 16,311 | `3f2fc4c4f1281740590e8a79cb26fdb19009acf1e3fd93aaac33960e3a73aee3` |

## The copies saved on the night of 2026-10-22 to 2026-10-23 (`lens-prices-pages/`)

Saved in the session's scratchpad from 23:52 local on 2026-10-22 to 00:05 on 2026-10-23 (06:52 to 07:05 UTC on 2026-10-23), during block 2's check (by the folder's name, its prices lens: Claude's reading). The fix round's prices builder tried each of its fixes against them (0025315, 27133aa, ce332f8, 30dc01b, 604a148; the commits call them "the saved live pages of 2026-10-23"). `google-ru.html` is Google's pricing page as served in Russian when no language is asked for, the reason the report asks for English (ADR-0115).

| File in the scratchpad | What it is | Saved (local, UTC−7; UTC) | Bytes | SHA-256 |
|---|---|---|---|---|
| anthropic.md | https://platform.claude.com/docs/en/about-claude/pricing.md | 2026-10-22 23:52:18 (2026-10-23T06:52:18Z) | 53,412 | `7290220dcde922ef0cfc83fe37213bc709c47723c0ae38bfed38374e40cce998` |
| caching.html | https://developers.openai.com/api/docs/guides/prompt-caching | 2026-10-23 00:03:42 (2026-10-23T07:03:42Z) | 817,778 | `de321ad588ed346357cd9ad9737af2d7a84997b45c1b7e94cdf482348ada78ac` |
| calc.js | the image guide's token calculator script, from developers.openai.com/_astro/ (GptImageTokenCalculator.react.*.js; its file name was not kept) | 2026-10-22 23:56:02 (2026-10-23T06:56:02Z) | 5,711 | `43e1e021729ad1a9e03979a31afa5f0e6f035693cb0fda72c31ff5bf035d43dd` |
| fal1.html | https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video | 2026-10-22 23:52:19 (2026-10-23T06:52:19Z) | 321,460 | `eeed669a07a163c7e5e343eccfe6df8e3294de4de34c2c401e11458ec90a5cf8` |
| fal2.html | https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video | 2026-10-22 23:52:20 (2026-10-23T06:52:20Z) | 437,568 | `4091f8b68addb227b387856e742270f82e3b4eaf116d8826d077ac2ede2400cf` |
| fal3.html | https://fal.ai/models/fal-ai/ffmpeg-api/extract-frame | 2026-10-22 23:52:20 (2026-10-23T06:52:20Z) | 298,524 | `646409af52cd1af4f836a3352bc155e850df08e74606ac358b7fb141f722e60c` |
| gcache.html | https://ai.google.dev/gemini-api/docs/caching | 2026-10-23 00:05:00 (2026-10-23T07:05:00Z) | 91,185 | `96e41807b57b9fc9f9bd1d10dd010819b00f13008bb35a95695f94f8bb91804e` |
| gimg.html | https://ai.google.dev/gemini-api/docs/image-generation | 2026-10-22 23:58:31 (2026-10-23T06:58:31Z) | 1,446,900 | `1856f108bb5abfe7dbd5c926e870ff47b39dbf9e3fa4cdccbe7ad9d90489a2e2` |
| google-ru.html | https://ai.google.dev/gemini-api/docs/pricing, as served in Russian (its canonical link names ?hl=ru) | 2026-10-22 23:55:15 (2026-10-23T06:55:15Z) | 329,993 | `f14b9b55cdd1b1f49ff69dc84b5eac457b8935ce49f7ec88e3880dd6a093a049` |
| google.html | https://ai.google.dev/gemini-api/docs/pricing (in English) | 2026-10-22 23:52:19 (2026-10-23T06:52:19Z) | 253,703 | `fae40e2b832c5e30d448d262d5644d3f173ae8a5a752e39247645f527fe9aa04` |
| imggen.html | https://developers.openai.com/api/docs/guides/image-generation | 2026-10-22 23:55:56 (2026-10-23T06:55:56Z) | 1,256,641 | `c995e123740201ea3d61d7a68235f9c101f1fd97d3de2239641876594d537c30` |
| openai.html | https://developers.openai.com/api/docs/pricing | 2026-10-22 23:52:18 (2026-10-23T06:52:18Z) | 577,063 | `b36690fa0addcc00ff2ace7a1e42ea6e7b99e631fca1a02934c5a3b0778d8c59` |
| openrouter.json | https://openrouter.ai/api/v1/models | 2026-10-22 23:52:19 (2026-10-23T06:52:19Z) | 789,932 | `d31314e6ba3f01fc9ee9c7339cf88cb8b08a6d146e4374ef35aa0d0cf816bc83` |
| pricing.js | https://developers.openai.com/_astro/pricing.*.js (the pricing page's script; its file name was not kept) | 2026-10-22 23:53:25 (2026-10-23T06:53:25Z) | 16,311 | `cd95708c98c24771b045d06305f8a0c2f6cb448debcaf130db2558d3b45bf5ba` |

They record what was read; they are not tests that run today. ADR-0115's Evidence points here.
