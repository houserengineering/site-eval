# Site evaluation

Septic site evaluations: excavated test pits logged by feel against DEQ soil log requirements.

## Language

**Confirmation field**:
The complete text entered by the evaluator, including any prefix. Store, back up and print it unchanged; never extract just its digits.

**Project folder**:
The exact existing Dropbox Server folder identified by the whole project number. For example, `0999.001` means `/Server/0999/001`. Resolve against the connected account; a parent folder or a similarly named folder does not establish that the subproject exists.

**Test pit**:
One excavated hole, numbered on the site plan. Dug to 96 inches unless groundwater or a limiting layer stops it.
_Avoid_: hole, pit location

**Pit wall**:
One side of a test pit, logged on its own soil log. The two walls are labeled A and B: two opposite walls of the same hole, in no fixed direction. Both share the pit's location because they are the same hole.
_Avoid_: treating A and B as separate pits or separate locations

**Horizon**:
A layer in a pit wall that differs in texture, color or rock content from the one above it. Horizon depths are measured on each wall; texture and color are sampled on the first walls and carried forward until something looks different.

**Pit check**:
Something on a pit wall to fix or accept before leaving it: a depth gap or overlap, a log short of 96 inches (or of the water or limiting depth), walls A and B with different horizon counts, a hue outside the site pattern, rock of 60% or more, a horizon with no color or texture, a photo that is blurry, too dark, washed out or too small, or a logged color far from what the wall-face photo reads. An open check holds the soil log; accepting one records who and when.
_Avoid_: rule warning (those cite DEQ/county rules and never hold anything)

**Wall-face photo**:
The one photo of a pit wall taken square to it, the surface at the top edge and the log bottom at the bottom, that the color check samples by depth. The user marks it, and marks whether a white card or tape is in frame; only then are value and chroma judged.
_Avoid_: pit photo (most pit photos look down into the pit and show backdirt and shadow)

**Demo**:
A coached walkthrough of one made-up site evaluation, done in the real screens: the screen dims except the highlighted field, a tip with an example sits above or below it, and each step completes when the user does it (or taps Show me). Required on a device's first launch and must be finished once there; replayed (and exitable) from Settings › Replay the demo. Wall B carries a planted dark, blurred photo to retake. Finish deletes the demo evaluation; it never syncs or files to Dropbox. Tips and the grey field examples come from one field guide (`src/app/fieldGuide.ts`).
_Avoid_: tutorial, help page

**Project folder (missing)**:
A readable project number whose folder does not exist yet. The app shows the exact path and creates it only when the user asks. A blank or unreadable project number instead files to its own folder under `/Server/Office/Site Evaluations`.

## Relationships

- A **Test pit** has two **Pit walls** (A and B); a soil log is one **Pit wall**.
- A **Pit wall** has one or more **Horizons**; walls of the same pit usually share horizons and differ only in depths.

## Example dialogue

> **Nate:** "7B is the opposite side?"
> **Justin:** "Yep. It's literally the same hole. The only thing that changes is the height of the layers."
