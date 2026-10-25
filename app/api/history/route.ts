import { publicReadHeaders } from "@/lib/public-read-headers";
import { env } from "cloudflare:workers";
import { readSnapshotHistory } from "@/lib/snapshot-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "BR";
  const requestedLimit = Number(url.searchParams.get("limit") ?? 300);
  const headers = publicReadHeaders;
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(scope) || !Number.isFinite(requestedLimit) || requestedLimit < 2) {
    return Response.json({ error: "Informe um escopo válido e limite entre 2 e 300 pontos." }, { status: 400, headers });
  }
  const history = await readSnapshotHistory(env.BUCKET, { scope, limit: Math.min(300, requestedLimit) });
  return Response.json({ ...history, collection: { ...history.collection, mode: "scheduled", pollSeconds: 300,
    continuousPollSeconds: 60,
    note: "Snapshots coletados por rotina autenticada: agenda de cinco minutos e rodada contínua de um minuto quando ativada. A agenda pode atrasar. Geração oficial inalterada não cria snapshot duplicado; ausência de novo registro não comprova ausência de consulta.",
  } }, { headers });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: publicReadHeaders });
}
