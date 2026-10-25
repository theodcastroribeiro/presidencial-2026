import { fetchElectionSnapshot } from "@/lib/election.mjs";
import baseline from "@/public/data/baseline-2022.json";
import historical2022 from "@/public/data/historico-2022-uf.json";
import firstRound2026 from "@/public/data/first-round-2026.json";
import { env } from "cloudflare:workers";
import { readPreservedSnapshot } from "@/lib/public-snapshot.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchElectionSnapshot({ baseline, references: {
      historical2022: { baseline, history: historical2022 },
      firstRound2026: { baseline: firstRound2026, history: null },
    } });
    const result = snapshot.national ? snapshot : await readPreservedSnapshot(env.BUCKET) || snapshot;
    return Response.json(result, {
      status: result.national ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Data-Source": "Tribunal Superior Eleitoral",
      },
    });
  } catch {
    const preserved = await readPreservedSnapshot(env.BUCKET);
    if (preserved) return Response.json(preserved, { headers: { "Cache-Control": "no-store", "X-Data-Source": "Tribunal Superior Eleitoral; leitura anterior preservada" } });
    return Response.json({ error: "Não foi possível consultar o TSE agora. Tente novamente em instantes.", fetchedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
