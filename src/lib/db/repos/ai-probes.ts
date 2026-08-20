import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

/** One question put to an assistant, and what came back. */
export type AiProbe = {
  id: string;
  scanId: string | null;
  businessId: string;
  promptSetVersion: string;
  promptKey: string;
  prompt: string;
  model: string;
  response: string;
  mentioned: boolean;
  /** 1-based place in the answer's list. Null while mentioned means named, not ranked. */
  position: number | null;
  competitors: string[];
  createdAt: Date;
};

export type AiProbeInput = {
  promptSetVersion: string;
  promptKey: string;
  prompt: string;
  model: string;
  response: string;
  mentioned: boolean;
  position: number | null;
  competitors: string[];
};

type Row = {
  id: string;
  scan_id: string | null;
  business_id: string;
  prompt_set_version: string;
  prompt_key: string;
  prompt: string;
  model: string;
  response: string;
  mentioned: boolean;
  mention_position: number | string | null;
  competitors: string[] | null;
  created_at: Date;
};

const toProbe = (r: Row): AiProbe => ({
  id: r.id,
  scanId: r.scan_id,
  businessId: r.business_id,
  promptSetVersion: r.prompt_set_version,
  promptKey: r.prompt_key,
  prompt: r.prompt,
  model: r.model,
  response: r.response,
  mentioned: r.mentioned,
  position: r.mention_position === null ? null : Number(r.mention_position),
  competitors: r.competitors ?? [],
  createdAt: new Date(r.created_at),
});

/**
 * Append-only, and written in one transaction: a partly recorded probe set would read
 * as an assistant that answered fewer questions than it was asked.
 *
 * The verbatim answer is stored next to the measurement on purpose. An agency showing a
 * client "you are not in the answer" needs the answer itself, not our summary of it.
 */
export async function recordAiProbes(
  scope: OrgScope,
  input: { scanId: string | null; businessId: string; probes: readonly AiProbeInput[] },
): Promise<number> {
  const orgId = requireOrg(scope);
  if (input.probes.length === 0) return 0;

  return db().begin(async (tx) => {
    for (const probe of input.probes) {
      await tx`
        insert into ai_probes (
          org_id, scan_id, business_id, prompt_set_version, prompt_key, prompt, model,
          response, mentioned, mention_position, competitors
        ) values (
          ${orgId}, ${input.scanId}, ${input.businessId}, ${probe.promptSetVersion},
          ${probe.promptKey}, ${probe.prompt}, ${probe.model}, ${probe.response},
          ${probe.mentioned}, ${probe.position}, ${tx.array(probe.competitors)}
        )
      `;
    }
    return input.probes.length;
  });
}

export async function listAiProbes(
  scope: OrgScope,
  filter: { scanId?: string; businessId?: string; limit?: number },
): Promise<AiProbe[]> {
  const orgId = requireOrg(scope);
  const sql = db();
  const rows = await sql<Row[]>`
    select * from ai_probes
     where org_id = ${orgId}
       ${filter.scanId ? sql`and scan_id = ${filter.scanId}` : sql``}
       ${filter.businessId ? sql`and business_id = ${filter.businessId}` : sql``}
     order by created_at desc
     limit ${filter.limit ?? 100}
  `;
  return rows.map(toProbe);
}
