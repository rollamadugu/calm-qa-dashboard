// ---------------------------------------------------------------------------
// Thin bridge to the Rust side. The Rust command holds the token and makes the
// real HTTP call (no CORS, token never in the browser). We just paginate here.
// ---------------------------------------------------------------------------
import { invoke } from "@tauri-apps/api/core";

// Pull every issue for a JQL, following nextPageToken until the last page.
// The new /rest/api/3/search/jql no longer returns `total`, so we page until
// isLast or the token disappears.
export async function jiraSearch(jql, fields) {
  let all = [];
  let token = null;
  let guard = 0; // safety: never loop forever if a page token misbehaves
  do {
    const res = await invoke("jira_search", { jql, fields, nextPageToken: token });
    if (res.issues && res.issues.length) all = all.concat(res.issues);
    token = res.isLast ? null : res.nextPageToken || null;
    guard += 1;
  } while (token && guard < 200);
  return all;
}

// Fetch a specific set of issue keys (used to load parent features so we can
// read their labels). Chunked because JQL `key in (...)` has a practical limit.
export async function jiraFetchByKeys(keys, fields) {
  const out = [];
  for (let i = 0; i < keys.length; i += 80) {
    const chunk = keys.slice(i, i + 80);
    const jql = `key in (${chunk.join(",")})`;
    const part = await jiraSearch(jql, fields);
    out.push(...part);
  }
  return out;
}

// Optional: members of a Jira group, used only when CONFIG.qaGroupId is set.
export async function jiraGroupMembers(groupId) {
  const res = await invoke("jira_group_members", { groupId });
  return (res.values || []).map((m) => m.accountId);
}
