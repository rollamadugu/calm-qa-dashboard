// ---------------------------------------------------------------------------
// App configuration. Safe to edit. The API TOKEN is NOT here on purpose —
// it lives in src-tauri/src/main.rs so it never ships in the web bundle and
// can't be read from browser devtools. Everything below is plain app logic.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // Jira site (matches your screenshots). The token + email live in Rust.
  baseUrl: "https://southwest.atlassian.net",

  // The one query that defines "all defects in scope". Tune this freely.
  // Examples:
  //   project = CPLN AND issuetype = Bug
  //   project = CPLN AND issuetype = Bug AND created >= -180d
  defectJql: 'project = CPLN AND issuetype = Bug ORDER BY created DESC',

  // Module dimension: a parent feature's label like "PSMod-FMLA" -> module "FMLA".
  // Only labels starting with this prefix are treated as module/area labels;
  // everything else (needs-triage, etc.) is ignored.
  moduleLabelPrefix: "PSMod-",

  // How far up the parent chain to walk looking for a module label.
  // defect -> story -> feature is 2 hops; 4 is plenty of headroom.
  maxParentDepth: 4,

  // A defect under a feature carrying TWO module labels (e.g. CPLN-5225 has
  // PSMod-FOAttendance AND PSMod-IFAttendance) counts under BOTH when true.
  // Set false to count only the first label found.
  countUnderEveryModule: true,

  // Priorities considered "Critical / High" for the KPI card. Adjust to match
  // your scheme (Southwest may use custom priority names).
  highPriorities: ["Critical", "Highest", "High"],

  // OPTIONAL: restrict the QA roster to members of a Jira group. Leave null to
  // use everyone who has reported/owned a defect (fully dynamic, zero upkeep).
  // To find the id: Jira admin -> Groups, or the group/bulk API.
  qaGroupId: null,

  // Auto-refresh interval (ms). 20 minutes = 1200000.
  refreshIntervalMs: 20 * 60 * 1000,
};

// Fields we pull per issue. Note: the new /search/jql defaults to id-only,
// so we MUST list fields explicitly or everything comes back empty.
export const ISSUE_FIELDS = [
  "summary", "status", "priority", "reporter", "assignee",
  "labels", "parent", "created", "resolutiondate", "issuetype",
];
