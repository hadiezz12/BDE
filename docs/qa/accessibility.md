# Accessibility audit (Phase 15)

Target: **WCAG 2.2 level AA** for the core experiences. This is the developers' audit, **not a certification**
and not a full RGAA assessment (see below). Automated tools find a part of the issues only; what was checked by
hand is listed as such.

## Scope and methods

| Method | Pages / flows | Result |
|---|---|---|
| axe-core 4.14 (WCAG 2.0/2.1/2.2 A+AA rules), production build | **Local, dev data:** 43 pages (12 public desktop, 4 light theme, 4 phone, 9 account, 9 management, page preview, editor, candidate pages) + BDE recruitment steps (overview, positions, form builder, publication, follow-up, applications, interviews, decisions, committee), platform pages (overview, statistics, continuity, moderation, messages), governance. **CI, seed data:** `e2e/accessibility.spec.ts` (public, light, phone, student, president's workspace with form builder, event wizard, page preview and editor) | 6 defects found, all fixed (D4–D9); 0 violations after |
| Keyboard only | Skip link → `#contenu`; search dialog (open with Enter, type, focus never reaches the page behind, Escape empties then closes, focus returns to the button); editor toolbar (roving tab index, Phase 6) | Pass (CI) |
| Reflow 320 px (≈ 400 % zoom) | 7 public pages in CI; 12 signed-in management pages locally | Defect D7 found and fixed; 0 px sideways scroll |
| Motion | Reduced motion: marquees stop and stay focusable; the neon headline no longer blinks forever (D11) | Pass (CI) |
| Contrast | axe on both themes; one token fixed (D9) | Pass |
| Other engines | Firefox, WebKit, iPhone emulation: pages render, keyboard search, sign-in / sign-out, no sideways scroll (`cross-browser.spec`) | Pass (emulation) |

## What was not done (remaining work)

- **Screen readers**: no session with NVDA, JAWS, VoiceOver or TalkBack was performed. Semantics were checked
  through axe and the accessibility tree (names, roles, landmarks, live regions for statuses and uploads), which is
  not the same as a user test.
- **Real devices**: phones and tablets were emulated; no physical iPhone or Android device was used.
- **Text spacing (1.4.12)** and **200 % text-only zoom** were not tested separately (reflow at 320 px was).
- **Dragging (2.5.7)**: the image uploader accepts drag-and-drop but always offers a button; no other drag-only action exists.
- **Accessible authentication (3.3.8)**: sign-in uses an e-mail code and TOTP; codes can be pasted, no cognitive
  test, password managers are not blocked — checked by reading the forms, not by user testing.
- **RGAA**: French public bodies (and some companies) must publish an accessibility statement based on RGAA 4.1.
  Whether the BDE (an association) is subject to it is a question for the controller; if so, a full RGAA audit
  (106 criteria) and a statement are needed. The present audit maps to WCAG, which RGAA is based on, but does not
  replace it.

## Remaining known issue

D12 (performance, not WCAG): a layout shift on `/associations` when the display font arrives late on a slow first visit.
