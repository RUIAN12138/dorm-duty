## Implementation
- [x] Inspect current banner, queue, inbox, sender rules and existing APIs.
- [x] Implement inline reply, immutable identity/send and panel motion.
- [x] Implement server-confirmed read intent retry and queue pinning.
## Verification
- [x] Build/format/OpenSpec exact scope.
- [x] Browser and state tests: long hold, keyboard, swipe/read reasons, send/retry/dedup, queue and identity races.
- [x] Existing banner/inbox/chat/keyboard/gesture regressions.
- [x] Isolated visual preview and screenshots.
- [ ] iPhone Safari actual keyboard acceptance.
- [ ] Android WebView/HarmonyOS ArkWeb native verification (or explicit limits).
## Delivery
- [ ] Record fresh PR/publish authorizations after final scope digest.
- [ ] Update/attach existing review PR #82; do not merge main.
- [ ] Backup, deploy code-only, exact public assets/health/history checks.
