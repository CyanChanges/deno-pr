import kit from "./kit.ts";
import { parseArgs } from "@std/cli/parse-args";
import { type } from "arktype";
import {
  artifactArchiveURL,
  artifactName,
  getArtifactRunBySha,
  getArtifacts,
  getPR,
} from "./func.ts";
import { crypto } from "@std/crypto";
import type { DigestAlgorithm } from "@std/crypto/crypto";
import { encodeHex } from "@std/encoding/hex";
import { concat } from "@std/bytes/concat";

export * from "./func.ts";

export const Args = type({
  "pr": "boolean = true",
  "commit?": "boolean",
  "target?": "string",
  "_": "(string | number)[]",
});

if (import.meta.main) {
  const { consola } = await import("npm:consola@^3.4.2")

  const { default: ProgressBar } = await import("jsr:@deno-library/progress@^1.5.1");

  const args = Args.assert(parseArgs(Deno.args));
  const target = args.target ?? `${Deno.build.os}-${Deno.build.arch}`;
  if (args.pr && args.commit) {
    throw new TypeError("`--pr` and `--commit` cannot exists together");
  }
  if (args._.length != 1) {
    throw new Error("Require a position argument for pr number or commit sha");
  }

  const [sha, num] = await (async function () {
    if (args.commit) {
      return [`${args._["0"]}`, void 0];
    } else if (args.pr !== false) {
      const pr_number = +args._["0"];
      consola.debug("Fetching PR %s", pr_number);
      const { head: { sha }, title, draft, user } = await getPR(pr_number);
      consola.info("[PR] Title    %s", title);
      consola.info("[PR] User     %s (%s)", user.login, user.url);
      consola.info("[PR] Is Draft %o", draft ?? '<unknown>');
      return [sha, pr_number];
    } else {
      console.error("Unresolve args", args);
      throw new Error("Unresolvable args", { cause: args });
    }
  })();

  consola.debug(
    `Commit SHA:   %s`,
    sha
  )
  consola.debug(`Event Number: %s`,
    num || "<none>",
  );
  consola.info("Fetching Workflows with %s", sha);
  const run = await getArtifactRunBySha(sha);
  if (!run) throw new Error(`Could not found ci run for commit ${sha}`);
  const { id: run_id } = run;
  const artName = artifactName(target, num);
  consola.info(`Search for Artifact with name: ${artName}`);

  consola.debug("Fetching Artifacts with Run %s", run_id);
  const { artifacts } = await getArtifacts(run_id);
  let match = false;
  for (const artifact of artifacts) {
    consola.debug("Checking Artifact [%s]", artifact.name);
    if (!artifact.name.startsWith(artName)) continue;
    match = true
    consola.info(`Found artifact     ${artifact.name}`);
    consola.info(`Archive URL:       ${artifactArchiveURL(run_id, artifact.id)}`);
    consola.info(`Archive URL (API): ${artifact.archive_download_url}`);
    consola.info(`Archive Size:      ${artifact.size_in_bytes}`);
    consola.info(`Archive Digest:    ${artifact.digest || "<none>"}`);

    const download = await consola.prompt("Do you want to download", {
      type: "confirm",
    });
    if (!download) break;

    if (!Deno.env.has("GITHUB_TOKEN")) {
      throw new Error("GITHUB_TOKEN is required to download artifacts from API")
    }
    const bar = new ProgressBar({
      total: artifact.size_in_bytes,
      title: artName,
    });
    let progress = 0;
    const resp = await fetch(artifact.archive_download_url, {
      headers: {
        "Authorization": `Bearer ${Deno.env.get("GITHUB_TOKEN")}`,
      },
    });
    if (!resp.body) throw new TypeError("Download failed, body is null");
    const filePath = await consola.prompt(
      "Download Path",
      {
        type: "text",
        default: artName,
      },
    );
    const file = await Deno.open(filePath, {
      create: true,
      write: true,
      truncate: true,
    });
    const writer = file.writable.getWriter();
    const buffers: Uint8Array[] = [];
    for await (const buffer of resp.body) {
      await writer.write(buffer);
      if (artifact.digest) buffers.push(buffer);
      progress += buffer.byteLength;
      bar.render(progress);
    }
    if (artifact.digest) {
      const [algo, digest] = artifact.digest.split(":");
      const algoMap: Record<string, DigestAlgorithm> = {
        "sha224": "SHA-224",
        "sha256": "SHA-256",
        "sha384": "SHA-384",
        "sha512": "SHA-512",
        "sha3-224": "SHA3-224",
        "sha3-256": "SHA3-256",
        "sha3-384": "SHA3-384",
        "sha3-512": "SHA3-512",
        "blake2": "BLAKE2B",
        "blake2b": "BLAKE2B",
        "blake2b-128": "BLAKE2B-128",
        "blake2b-160": "BLAKE2B-160",
        "blake2b-224": "BLAKE2B-224",
        "blake2b-256": "BLAKE2B-256",
        "blake2b-384": "BLAKE2B-384",
        "blake2s": "BLAKE2S",
        "blake3": "BLAKE3",
      };
      const fab = concat(buffers);
      const ab = crypto.subtle.digestSync(algoMap[algo] || "SHA-256", fab);
      const hex = encodeHex(ab);
      if (hex !== digest) {
        consola.error(
          "Invalid digest. File may be corrupted or being hijacked",
        );
        consola.box(`
Expect digest: ${digest}
Actual digest: ${hex}
`);
        const confirm = await consola.prompt("Do you want to save the file", {
          type: "confirm",
          initial: false,
        });
        if (confirm) await writer.close();
        throw new Error("Artifact Digest verification failed");
      }
      consola.info("Digest is okay");
    }
    await writer.close();
    break;
  }
  if (!match) {
    consola.warn("No artifacts matches.");
    throw new Error("No artifact matches found.");
  }
}
