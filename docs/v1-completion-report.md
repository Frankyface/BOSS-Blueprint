# BOSS Blueprint — v1 Completion Report

_For Cam · 29 July 2026_

---

## 1. What got built

**Live now: [frankyface.github.io/BOSS-Blueprint](https://frankyface.github.io/BOSS-Blueprint/)**

A free tool your clients open in a browser. No account, no install, nothing to pay, and nothing
of theirs leaves their computer until they choose to send it.

Here is the journey end to end:

**Pick a starting point.** Restaurant, Trades, Portfolio or Shop come pre-laid-out with
real-looking placeholder copy — or they start blank. Templates exist because non-technical people
freeze on an empty page.

**Sketch the site.** Six kinds of block — heading, text, image, button, nav bar, and a coloured
section band — dropped on a page, dragged, resized, typed into. A pen for circling things and
scribbling notes in the margin. Real photos, shrunk in the browser so the package stays small.
As many pages as they want, with buttons and menu items wired to each other, and a Nav map that
shows what points where — and what nothing points at. If they have no words yet, a block can say
"write it for me" plus a description of what it should say. It all saves itself as they work, and
they can download the design and pick it up later on another computer.

**Submit.** It checks the design over first and tells them, in plain English, about anything that
would leave us guessing — with a "Take me to it" button beside each one. Then a zip downloads to
their machine, named after their business.

**The package.** Inside that zip: `site.json` (every page, block, position and link as data),
`brief.md` (the same thing written out for a human), a picture of each page exactly as they drew
it, pen marks and all, and their uploaded photos. The last screen hands them a pre-filled email to
send it with.

**You build it.** You feed that zip to a fresh Claude Code session and it builds the real site.
That last step is not a hope — it is the thing the whole project was designed around, and it is
what Section 3 below is waiting on.

---

## 2. The numbers that matter

- **22 features** across four stages, **21 verified done** with dated evidence. The one that
  isn't is the notification email — it waits on you (Section 4), not on any work. The round-trip
  harness's own final review is the last signature being collected as this is written; its
  runs already passed (Section 3).
- **1,685 unit tests and 687 browser tests**, green on your machine and green on the build server.
  Every browser test runs three times over — Chrome, Firefox and Safari engines — against the real
  production build, not a dev server.
- **Lighthouse on the live site: 99–100 Performance, 100 Accessibility, 100 Best Practices,
  100 SEO** (desktop). Page paints in under half a second.
- **36 design decisions written down** with what was chosen, why, what was rejected and what would
  make us revisit it. Nothing important was decided in someone's head.

**On the review discipline** — this is the part worth trusting. Nothing was marked done by the
person who built it. Every feature was handed to a separate reviewer who checked out the exact
commit into its own clean copy of the repo, installed from scratch, and re-ran the whole lot
themselves: linting, type checking, every unit test, coverage, the production build and the full
browser suite. Recorded numbers were not taken on faith — where a claim was "the bundle only grew
1.85 kB", the reviewer rebuilt the old bundle and measured it again; where it said "Lighthouse
100", they ran Lighthouse again. A feature only reached "verified done" when someone other than
its author reproduced the evidence. And the standing rule throughout: if something fails a
criterion, you fix the thing — you never soften the criterion to make it pass.

---

## 3. The round-trip verdict

## ✅ IT PASSED — all three runs, first complete gauntlet.

Each run had a scripted fake client sketch a whole fictional business site through the real
interface, submit it, and hand the resulting package to a fresh Claude session given *nothing
else* — no access to this project, no notes, no chance to ask a question. What that session
built was then scored against what was sketched.

| Run | What it tested | Score | Verdict |
|---|---|---|---|
| Cedar & Stone Landscaping (template start) | local production build | **96.36** | **PASS** |
| Cedar & Stone Landscaping | **the live site itself** | **96.04** | **PASS** |
| North Star Dog Grooming (blank start) | local production build | **92.00** | **PASS** |

**Pass mark 85. Every one of the 24 hard gates green. Every dimension floor met.** All three at
the same commit, no cached shortcuts, no rule changed between them — checked by a separate
"ship gate" script that verifies the three as a set. It passed, exit code 0.

What that means in plain terms: **a stranger's Claude session, handed nothing but your client's
zip, builds their website — and it matches what they drew.** Including from the live site your
clients will actually use.

**Seven attempts got there, and this is the part worth trusting:** every single defect found
along the way was in the *measuring equipment*, never in the product. An expired login. A CLI
that silently updated itself. A checker looking for a file one folder above where the brief told
the builder to put it. A placement score whose maths made the top third of a page mathematically
unreachable. A length check that judged a heading using body-text sizing. A ship gate that
demanded two different scenarios have identical scenario files. Each one was ruled on and fixed
with its reasoning written down — and each was found *because* the builders kept doing the job
correctly and something insisted they hadn't. Twice the operator measured a proposed fix against
real data, found it wouldn't work, and came back with numbers instead of a fabricated pass.

Evidence — every run's report, verdict, manifest and side-by-side sketch/screenshot pairs, plus
both ship-gate outputs (the failing one kept deliberately, as proof the fix was a fix) — is
committed in the repo under `staging/stage-4-roundtrip-launch/evidence/`.

---

## 4. What's waiting on you

Four things. **None of them stop a client using the tool today** — submit works, the package
downloads, the email opens pre-filled.

**1. The submit address — a decision, two minutes.**
The completion screen shows a real address for clients to send their zip to. It is currently
`cammer3034@gmail.com`. That address sits on a public page. Say the word and it becomes a BOSS
mailbox instead — it is one line in one file, no code around it. This is just: *is that the inbox
you want it landing in?*

**2. The heads-up email — a signup and two copy-pastes, about ten minutes.**
Right now a client downloads their package and emails it to you, and you find out when the email
lands. This adds a notification to you the moment they submit. The code is built, tested in three
browsers, and shipped switched **off** — it makes no network call at all until you fill in two
fields.
  - Sign up free at a form relay (Web3Forms matches the defaults with no extra setup) and point it
    at the inbox you want.
  - Open `site.config.ts`, find the `BOSS_RELAY` block near the bottom, paste the provider's
    endpoint into `endpoint` and its public key into `credential`.
  - Build, commit, push — it deploys itself.
  - Submit one sketch through the live app and check the inbox.

  Two things worth knowing. That key is a *public form key* — its only power is "submit to this one
  form", it will be visible in the public code, and that is the model working rather than a leak
  (if you get form spam, rotate it). And **the email is a notification, never the package** — it
  carries the client's name, email, page count and the brief, but the zip itself always travels by
  the client's own email. A typo can't break anything: an invalid setting quietly falls back to
  today's behaviour.

**3. The link on bossolutions.pro — one click, it's ready.**
Blueprint already sends traffic *to* BOSS: every screen carries a "Built by BOSS →
bossolutions.pro" footer link. The link in the other direction is written and waiting as a pull
request: **[BOSS-website PR #1](https://github.com/Frankyface/BOSS-website/pull/1)** adds a
"Sketch Your Site" section between your pricing table and "Work With Us If…", using your site's
own classes and background rhythm, with copy that hands off to your existing free-mock-up offer
rather than competing with it. Review and merge when you like. This is lead capture, not
product: nothing is waiting on it.

**4. `sketch.bossolutions.pro` — optional, whenever.**
A nicer address than the GitHub one. It rides on your pending DNS move off GoHighLevel, so there
is no rush. Worth knowing before you start: **a DNS record on its own is not enough** — the
current address is baked into the page's social-card tags and the app bundle, so it also needs a
one-line config change, a `CNAME` file, a redeploy and a re-run of two test files. Ten-minute job
once you say go. The app works perfectly on the GitHub address until then.

---

## 5. Keeping it healthy later

Two commands, run from the project folder.

```bash
npm run e2e
```
**The full health check.** Builds the app for production and drives it like a real user through
Chrome, Firefox and Safari — every feature, every page, the whole submit path. Takes a while;
green means the app is sound. (First time on a fresh machine, also run
`npm ci --prefix scripts/roundtrip` once — the test suite has a second, separate set of
dependencies and will fail confusingly without it.)

```bash
npm run roundtrip:smoke
```
**The "is the package still buildable?" check** — about 12 minutes. It hands a real submitted
package to a fresh Claude session with no other context and scores the site it builds. **The rule:
run this before shipping any change that touches how the package is made** — the export code, the
package format, the brief text, the starter templates or the page-image renderer. Everything else
in the app is covered by the command above; this one guards the thing the product is actually
for.

---

## 6. What v2 could be

Recorded along the way, deliberately left out of v1 — not forgotten, just not now.

- **A form block.** v1 has no contact-form, map or footer block on purpose; the templates coach
  clients to *describe* a form in a text box instead. If submissions keep describing contact forms
  the same way, that is the signal to promote it to a real block.
- **Guided wizard onboarding.** Answer a handful of questions, get a pre-built skeleton sketch to
  edit. Considered for v1 and rejected as "a second product's worth of logic".
- **Revision sketches.** The client marks up a screenshot of their *delivered* site to request
  changes — the same tool, pointed at the back half of the relationship instead of the front.
- **A proper inbox.** If the volume ever outgrows email, a Supabase backend with a submission
  inbox. Explicitly not in v1: you chose zero maintenance over save-anywhere convenience, and
  that's still the right call at this volume.
- **Smaller ones on the list:** live AI copy written in the app (needs a tiny server, hence the
  wait), tablet support, and more industry-specific templates.

---

_Everything above except Section 3 is measured and recorded in the project's own files. Section 3
is the one thing still running._
