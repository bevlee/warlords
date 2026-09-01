# Changelog

Notable changes to Warlords. Anything before the first entry below is in the git history only.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- **Title screen at `/`.** The default page is now a title screen for the gauntlet: the wordmark, a
  single play button, and quiet links to the compendium and battle history. The button reads
  `Resume` and names the run's faction and node while a run is live.
- **Battle speed is remembered.** `battleSpeed` joins the saved profile (`src/lib/profile.ts`), so
  the cog on the title screen, the cog inside a battle, and `/settings` all read and write one
  value and it holds between battles instead of resetting to normal each fight.
- **A rules section on `/gauntlet`.** "How the Gauntlet works" sits at the foot of the page, out of
  the way during a battle: the ten nodes and their bosses, the enemy difficulty curve and veterancy,
  that your whole army returns at full strength between fights, what each win pays out, and Endless.
- **Legacy hub at `/legacy`.** The former multi-mode home page — seasonal event, campaign, gauntlet,
  and compendium cards — is preserved at its own route, with a banner pointing at the new home.

### Changed

- `/campaign` and `/events`, reachable only from the legacy hub, link back to `/legacy` rather than
  to `/`.
- `HubTopBar` takes a `home` prop so its wordmark leads to whichever hub renders it.
- The gauntlet's faction-select blurb is one line; the detail moved to the rules section.

### Removed

- The `← main game` link beside the gauntlet page title.
