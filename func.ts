import kit from "./kit.ts";

export async function getPR(pull_number: number) {
  const resp = await kit.rest.pulls.get({
    owner: 'denoland',
    repo: 'deno',
    pull_number,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (resp.status == 200) return resp.data
  throw new Error(`Failed to retrieve PR info (status code: ${resp.status})`)
}

export async function getRunsBySha(head_sha: string) {
  const resp = await kit.rest.actions.listWorkflowRunsForRepo({
    owner: 'denoland',
    repo: 'deno',
    head_sha
  });
  if (resp.status === 200) return resp.data
  throw new Error(`Failed to retrieve PR info (status code: ${resp.status})`)
}

export async function getArtifactRunBySha(head_sha: string) {
  const {
    workflow_runs
  } = await getRunsBySha(head_sha)
  for (const run of workflow_runs) {
    if (run.name != "ci") continue;
    return run
  }
}

export async function getArtifacts(run_id: number) {
  const resp = await kit.rest.actions.listWorkflowRunArtifacts({
    owner: 'denoland',
    repo: 'deno',
    run_id
  })
  if (resp.status === 200) return resp.data
  throw new Error(`Failed to retrieve PR info (status code: ${resp.status})`)
}

export function artifactName(target: string, ev_number: number | undefined) {
  return `deno-${target}-${ev_number || ''}`
}

export function artifactArchiveURL(run_id: number, artifact_id: number) {
  return `https://github.com/${'denoland'}/${'deno'}/actions/runs/${run_id}/artifacts/${artifact_id}`
}
