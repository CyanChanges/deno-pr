import { Octokit } from 'octokit'

export const kit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
  userAgent: `deno/${Deno.version.deno} deno-pr/0.1.0`
})

export default kit
