// ---------------------------------------------------------------------------
// The brain. Takes raw Jira issues and produces everything the dashboard shows.
//   1. resolveModules  -> walk parent links to find each defect's PSMod-* module
//   2. buildRoster     -> derive the QA team DYNAMICALLY from the defect data
//   3. computeMetrics  -> KPIs, by-status, by-module, per-person, unassigned
// Nothing here hardcodes a person, a module, or a count.
// ---------------------------------------------------------------------------
import { CONFIG, ISSUE_FIELDS } from "./config.js";
import { jiraFetchByKeys } from "./api.js";

const labelsToModules = (labels) =>
  (labels || [])
    .filter((l) => l.startsWith(CONFIG.moduleLabelPrefix))
    .map((l) => prettyModule(l.slice(CONFIG.moduleLabelPrefix.length)));

function prettyModule(raw) {
  // "FOAttendance" -> "FO Attendance", "LeaveMgmt" -> "Leave Mgmt", "FMLA" -> "FMLA"
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^IF /, "IF ")
    .trim();
}

// Walk each defect up its parent chain until an ancestor carries a module
// label. Defects with no module-tagged ancestor go to "Unmapped" so nothing
// silently vanishes. Returns issues annotated with a `.modules` array.
export async function resolveModules(defects) {
  // Map of everything we know by key (defects + any parents we load).
  const byKey = new Map();
  for (const d of defects) byKey.set(d.key, d);

  // Iteratively load parent issues we don't have yet, up to maxParentDepth.
  for (let depth = 0; depth < CONFIG.maxParentDepth; depth++) {
    const needed = new Set();
    for (const issue of byKey.values()) {
      const parentKey = issue.fields?.parent?.key;
      if (parentKey && !byKey.has(parentKey)) needed.add(parentKey);
    }
    if (needed.size === 0) break;
    const parents = await jiraFetchByKeys([...needed], ISSUE_FIELDS);
    for (const p of parents) byKey.set(p.key, p);
  }

  // For each defect, climb until we hit module labels.
  for (const d of defects) {
    let cur = d;
    let hops = 0;
    let modules = [];
    while (cur && hops <= CONFIG.maxParentDepth) {
      const found = labelsToModules(cur.fields?.labels);
      if (found.length) {
        modules = CONFIG.countUnderEveryModule ? found : [found[0]];
        break;
      }
      const pk = cur.fields?.parent?.key;
      cur = pk ? byKey.get(pk) : null;
      hops += 1;
    }
    d.modules = modules.length ? modules : ["Unmapped"];
  }
  return defects;
}

const isDone = (i) => i.fields?.status?.statusCategory?.key === "done";
const isOpen = (i) => !isDone(i);
const isReopened = (i) => /re-?open/i.test(i.fields?.status?.name || "");
const isUnassigned = (i) => !i.fields?.assignee;
const priorityName = (i) => i.fields?.priority?.name || "None";
const person = (u) => u && { id: u.accountId, name: u.displayName };
const withinDays = (iso, days) => {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) / 86400000 <= days;
};

// ---- DYNAMIC ROSTER --------------------------------------------------------
// The QA team is whoever appears as reporter (and optionally assignee) across
// the defect set. No name list anywhere. If CONFIG.qaGroupId is set, the
// caller passes allowedIds and we keep only those people.
export function buildRoster(defects, allowedIds = null) {
  const map = new Map(); // accountId -> { id, name }
  for (const d of defects) {
    const r = person(d.fields?.reporter);
    const a = person(d.fields?.assignee);
    if (r) map.set(r.id, r);
    if (a) map.set(a.id, a);
  }
  let people = [...map.values()];
  if (allowedIds) {
    const allow = new Set(allowedIds);
    people = people.filter((p) => allow.has(p.id));
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

export function computeMetrics(defects, roster) {
  const open = defects.filter(isOpen);
  const done = defects.filter(isDone);

  // By status (open buckets + done), keyed by the actual Jira status name.
  const byStatus = {};
  for (const d of defects) {
    const s = d.fields?.status?.name || "Unknown";
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  // By module — a defect can land in several modules (counted in each).
  const byModule = {};
  for (const d of defects) {
    for (const m of d.modules) byModule[m] = (byModule[m] || 0) + 1;
  }

  // Per QA person.
  const team = roster.map((p) => {
    const reported = defects.filter((d) => d.fields?.reporter?.accountId === p.id);
    const assigned = defects.filter((d) => d.fields?.assignee?.accountId === p.id);
    return {
      ...p,
      reported: reported.length,
      assigned: assigned.length,
      open: assigned.filter(isOpen).length,
      resolved: assigned.filter(isDone).length,
      reopened: assigned.filter(isReopened).length,
    };
  }).sort((a, b) => b.reported - a.reported);

  // Defects nobody owns — surfaced loudly.
  const unassigned = open
    .filter(isUnassigned)
    .map((d) => ({
      key: d.key,
      title: d.fields?.summary || "",
      module: d.modules[0],
      priority: priorityName(d),
    }));

  const highOpen = open.filter((d) => CONFIG.highPriorities.includes(priorityName(d)));
  const reopenedCount = defects.filter(isReopened).length;

  return {
    kpis: {
      total: defects.length,
      open: open.length,
      unassigned: unassigned.length,
      critHigh: highOpen.length,
      resolved7d: done.filter((d) => withinDays(d.fields?.resolutiondate, 7)).length,
      reopenRate: defects.length ? Math.round((reopenedCount / defects.length) * 100) : 0,
    },
    byStatus,
    byModule,
    team,
    unassigned,
  };
}
