"use client";
/* eslint-disable @next/next/no-img-element -- Preview uses a generated local PNG Blob URL. */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ImageDown, Share2, X } from "lucide-react";
import type { Scope } from "../lib/ui-types";
import type { OfficialFirstRoundResult } from "../lib/first-round-results";
import { captureChartSvg, renderShareImage } from "../lib/share-image";
import type { ShareImageInput } from "../lib/share-image";
import "./share-image-button.css";

type Props = {
  firstRound: OfficialFirstRoundResult | null;
  scope: Scope | null;
  title: string;
  regions: Scope[];
  national: Scope | null;
  reference: ShareImageInput["reference"];
  axisLabel: string;
  chartNote: string;
  stale: boolean;
};
type Preview = {
  url: string;
  file: File;
  filename: string;
  title: string;
  capturedAt: string;
  shareable: boolean;
};

function capturedTime(at: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(at));
}
function supportsFileShare(file: File) {
  try { return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); }
  catch { return false; }
}

export function ShareImageButton({ firstRound, scope, title, regions, national, reference, axisLabel, chartNote, stale }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const titleId = useId(), noteId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(true), generatingRef = useRef(false), sharingRef = useRef(false);
  const job = useRef(0), objectUrl = useRef<string | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    setShareError("");
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const previous = returnFocus.current || triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== backdropRef.current);
    const inertBefore = background.map((element) => [element, element.inert] as const);
    for (const [element] of inertBefore) element.inert = true;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ) || []).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePreview(); return; }
      if (event.key !== "Tab") return;
      const elements = focusables(), first = elements[0], last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); dialogRef.current?.focus(); return; }
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) closeRef.current?.focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      document.body.style.overflow = previousOverflow;
      for (const [element, wasInert] of inertBefore) element.inert = wasInert;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [preview, closePreview]);

  async function generate() {
    if (!scope || generatingRef.current) return;
    generatingRef.current = true;
    const currentJob = ++job.current;
    returnFocus.current = triggerRef.current;
    setGenerating(true);
    setError("");
    try {
      // Capture both the DTO and displayed SVG in this synchronous event, before any await.
      const pane = document.getElementById("curvas");
      const svg = pane?.querySelector<SVGSVGElement>("svg.curve") || null;
      if (pane && (pane.dataset.shareScope !== scope.code || pane.dataset.shareReady === "false")) {
        throw new Error("Aguarde carregar o gráfico deste recorte e tente novamente.");
      }
      if (svg && (svg.dataset.shareTitle !== title || svg.dataset.shareAxis !== axisLabel)) {
        throw new Error("O recorte do gráfico mudou. Aguarde a atualização e tente novamente.");
      }
      const chartSvg = svg ? captureChartSvg(svg) : null;
      const input: ShareImageInput = structuredClone({
        scope, title, regions, national, reference, axisLabel, stale, firstRound,
        chartNote: chartNote + (chartSvg ? "" : " Gráfico indisponível no momento da captura."),
        chartSvg, capturedAt: new Date().toISOString(),
      });
      const result = await renderShareImage(input);
      if (!mounted.current || currentJob !== job.current) return;
      if (!result.blob.size || result.blob.type !== "image/png") throw new Error("O navegador não conseguiu gerar um PNG válido.");
      const file = new File([result.blob], result.filename, { type: "image/png", lastModified: Date.parse(input.capturedAt) });
      const url = URL.createObjectURL(result.blob);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      setShareError("");
      setPreview({ url, file, filename: result.filename, title: input.title, capturedAt: input.capturedAt, shareable: supportsFileShare(file) });
    } catch (caught) {
      if (mounted.current && currentJob === job.current) setError(caught instanceof Error ? caught.message : "Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      generatingRef.current = false;
      if (mounted.current && currentJob === job.current) setGenerating(false);
    }
  }

  async function share() {
    if (!preview || sharingRef.current) return;
    if (!supportsFileShare(preview.file)) { setShareError("Compartilhamento de arquivos indisponível. Use Baixar PNG."); return; }
    sharingRef.current = true;
    setSharing(true);
    setShareError("");
    try {
      // A new explicit click supplies user activation; image generation has already finished.
      await navigator.share({ files: [preview.file] });
    } catch (caught) {
      if (mounted.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        setShareError("Não foi possível abrir o compartilhamento. Você pode baixar o PNG.");
      }
    } finally {
      sharingRef.current = false;
      if (mounted.current) setSharing(false);
    }
  }

  return <div className="share-image-control">
    <button ref={triggerRef} type="button" className="subtle-button share-image-trigger" onClick={() => void generate()} disabled={!scope || generating} aria-busy={generating}>
      <ImageDown size={15} aria-hidden="true"/>{generating ? "Gerando imagem…" : "Salvar imagem"}
    </button>
    {error && <span className="share-image-error" role="alert">{error}</span>}
    {preview && createPortal(<div ref={backdropRef} className="share-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }}>
      <section ref={dialogRef} className="share-preview-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={noteId} tabIndex={-1}>
        <div className="share-preview-heading"><div><span>IMAGEM PRONTA</span><h2 id={titleId}>{preview.title}</h2></div><button ref={closeRef} type="button" className="share-preview-close" aria-label="Fechar prévia da imagem" onClick={closePreview}><X size={20} aria-hidden="true"/></button></div>
        <p id={noteId} className="share-preview-note">Recorte congelado em {capturedTime(preview.capturedAt)}, horário de Belém. A imagem mantém os dados desse instante enquanto o painel continua atualizando.</p>
        <div className="share-preview-image"><img src={preview.url} alt={"PNG do painel eleitoral de " + preview.title + ", capturado em " + capturedTime(preview.capturedAt)}/></div>
        {shareError && <p className="share-preview-error" role="alert">{shareError}</p>}
        <div className="share-preview-actions"><a className="share-preview-download" href={preview.url} download={preview.filename}><Download size={16} aria-hidden="true"/>Baixar PNG</a>{preview.shareable && <button type="button" className="share-preview-share" onClick={() => void share()} disabled={sharing}><Share2 size={16} aria-hidden="true"/>{sharing ? "Compartilhando…" : "Compartilhar"}</button>}</div>
        <p className="share-preview-help">{preview.shareable ? "Escolha o aplicativo e o destinatário na tela de compartilhamento do aparelho." : "Baixe o PNG e anexe a imagem no aplicativo que preferir."}</p>
      </section>
    </div>, document.body)}
  </div>;
}
