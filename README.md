# CALM QA Defect Command Center

A desktop dashboard (Windows + macOS) that pulls QA defects from Jira, refreshes
every 20 minutes (plus a manual button), and shows team metrics for a director
review. Built with Tauri 2 + React + Vite.

## What it shows
- KPIs: total / open / unassigned / critical-high / resolved last 7 days / reopen rate
- Defects by status (donut) and by application/module (bars)
- Per-QA-member ownership table (reported, assigned, open, resolved, reopened)
- A loud "unassigned defects" panel

## Where things live
- `src-tauri/src/main.rs` — **paste your Jira email + API token here.** They stay
  out of the web bundle and the HTTP call runs from Rust, so no CORS issues.
- `src/config.js` — all app logic: the defect JQL, the `PSMod-` module-label
  prefix, parent-walk depth, multi-label behaviour, high-priority names,
  optional QA group filter, refresh interval.
- `src/transform.js` — module resolution + the **dynamic QA roster** + metrics.

## How the QA roster is built (no hardcoded names)
1. One JQL (`config.defectJql`) pulls every defect in scope.
2. The distinct `reporter` and `assignee` people on those issues become the roster.
3. If `config.qaGroupId` is set, the roster is intersected with that Jira group,
   so only QA folks show even if a PO occasionally files a bug.

## How module ("by application") is derived
A defect's module is the `PSMod-*` label on the nearest tagged ancestor. The app
walks defect → story → feature until it finds one (`config.maxParentDepth`),
strips the prefix, and humanizes it (`PSMod-FOAttendance` → "FO Attendance"). A
feature with two labels counts the defect under both (toggle in config). Defects
with no tagged ancestor land in "Unmapped".

## Run it
```bash
npm install
# paste credentials into src-tauri/src/main.rs, set the JQL in src/config.js
npm run tauri dev      # live window
npm run tauri build    # produces .dmg (mac) and .exe installer (windows)
```
Prereqs: Node 18+, Rust (rustup), and the Tauri 2 system deps for your OS
(WebView2 is built into Windows 10/11; macOS needs Xcode CLT).

## Notes
- Uses the current `/rest/api/3/search/jql` endpoint with `nextPageToken` paging
  (the old `/rest/api/3/search` was removed by Atlassian in 2025).
- Reopen rate is a heuristic from the current status name; it can be made exact
  later by reading the issue changelog.
