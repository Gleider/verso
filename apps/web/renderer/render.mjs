// apps/web/renderer/render.mjs
//
// Lê um job em JSON no stdin, grava um MP4, emite NDJSON no stdout.
//
// stdout é EXCLUSIVAMENTE NDJSON. Qualquer diagnóstico vai para stderr — uma
// linha solta no stdout quebraria o leitor do worker Python.
//
// Escrito em .mjs de propósito: o tsconfig.json de apps/web tem
// `allowJs: false`, então este arquivo fica fora do `tsc` sem mudança de
// configuração. A verificação dele é o teste de fumaça da etapa 0, não o tsc.

import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitir = (evento) => process.stdout.write(JSON.stringify(evento) + "\n");

async function lerStdin() {
  const pedacos = [];
  for await (const pedaco of process.stdin) pedacos.push(pedaco);
  if (pedacos.length === 0) {
    throw new Error("Nenhum job recebido no stdin.");
  }
  return JSON.parse(Buffer.concat(pedacos).toString("utf8"));
}

const raiz = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const entryPoint = path.join(raiz, "composition", "index.ts");
const publicDir = path.join(raiz, "public");

/**
 * Impressão digital do que entra no bundle.
 *
 * SHA-256 sobre conteúdo, não sobre mtime: `COPY` de Docker e `git checkout`
 * reescrevem mtimes sem mudar conteúdo, e o bundle seria refeito a cada deploy.
 *
 * `lib/` entra junto porque a composição importa de lá — `versos.ts` chama
 * `lib/syllables` e `lib/normalize`, `audio/` chama `lib/beat`. Sem isso, uma
 * correção na silabificação ou no saneamento dos timings reaproveitava o
 * bundle antigo: o render terminava com exit 0, o MP4 saía, e o conserto
 * simplesmente não estava nele.
 */
function impressaoDoBundle() {
  const hash = createHash("sha256");
  const visitar = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const nome of fs.readdirSync(dir).sort()) {
      // Teste não entra no bundle; incluí-lo só forçaria reempacotar à toa.
      if (nome === "__tests__") continue;
      const caminho = path.join(dir, nome);
      const stat = fs.statSync(caminho);
      if (stat.isDirectory()) visitar(caminho);
      else {
        hash.update(path.relative(raiz, caminho));
        hash.update(fs.readFileSync(caminho));
      }
    }
  };
  visitar(path.join(raiz, "composition"));
  visitar(path.join(raiz, "lib"));
  visitar(publicDir);
  const lockfile = path.join(raiz, "package-lock.json");
  if (fs.existsSync(lockfile)) hash.update(fs.readFileSync(lockfile));
  return hash.digest("hex");
}

async function principal() {
  const job = await lerStdin();
  const timeout = job.timeoutInMilliseconds ?? 120_000;

  emitir({ tipo: "etapa", etapa: "preparando o navegador" });
  await ensureBrowser({
    logLevel: "error",
    onBrowserDownload: () => ({
      onProgress: ({ percent }) => emitir({ tipo: "navegador", progresso: percent }),
    }),
  });

  // --- bundle, com cache ---------------------------------------------------
  // bundle({outDir}) LIMPA o outDir — por isso a impressão digital fica
  // irmã, e não filha, do diretório do bundle.
  const impressao = impressaoDoBundle();
  const arquivoDeImpressao = `${job.bundleDir}.sha256`;
  const valido =
    fs.existsSync(arquivoDeImpressao) &&
    fs.readFileSync(arquivoDeImpressao, "utf8").trim() === impressao &&
    fs.existsSync(path.join(job.bundleDir, "index.html"));

  if (!valido) {
    emitir({ tipo: "etapa", etapa: "empacotando a composição" });
    await bundle({
      entryPoint,
      outDir: job.bundleDir,
      publicDir,
      rootDir: raiz,
      enableCaching: true,
      onProgress: (p) => emitir({ tipo: "empacotando", progresso: p / 100 }),
    });
    fs.writeFileSync(arquivoDeImpressao, impressao);
  } else {
    emitir({ tipo: "etapa", etapa: "bundle em cache" });
  }

  // --- composição ------------------------------------------------------------
  emitir({ tipo: "etapa", etapa: "medindo a composição" });
  const composition = await selectComposition({
    serveUrl: job.bundleDir,
    id: job.compositionId ?? "karaoke",
    inputProps: job.inputProps,
    logLevel: "error",
    timeoutInMilliseconds: timeout,
  });
  emitir({
    tipo: "composicao",
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
  });

  fs.mkdirSync(path.dirname(job.outputLocation), { recursive: true });

  // --- render ----------------------------------------------------------------
  emitir({ tipo: "etapa", etapa: "montando o vídeo" });
  await renderMedia({
    composition,
    serveUrl: job.bundleDir,
    codec: "h264",
    outputLocation: job.outputLocation,
    inputProps: job.inputProps,
    imageFormat: "jpeg",
    jpegQuality: 90,
    crf: job.crf ?? 20,
    x264Preset: job.x264Preset ?? "medium",
    audioCodec: "aac",
    audioBitrate: "192k",
    concurrency: job.concurrency ?? null,
    timeoutInMilliseconds: timeout,
    logLevel: "error",
    overwrite: true,
    // O backend de OpenGL não é opcional desde que a composição usa
    // @remotion/effects: os efeitos são shaders GLSL e exigem um contexto
    // WebGL2, que o Chromium headless não cria por padrão.
    //
    // O padrão é `swangle` (SwiftShader + ANGLE, rasterização por SOFTWARE)
    // porque é o único que funciona onde este projeto realmente renderiza: o
    // contêiner do worker não tem GPU, e lá o `angle` falha com "Failed to
    // acquire WebGL2 context" — em máquina com GPU o mesmo `angle` funciona,
    // que é como isso passa despercebido em desenvolvimento.
    //
    // `VERSO_RENDER_GL=angle` troca para o caminho por hardware em quem tem
    // GPU e quer velocidade.
    chromiumOptions: { headless: true, gl: process.env.VERSO_RENDER_GL || "swangle" },
    onDownload: (src) => {
      emitir({ tipo: "baixando", src });
      return undefined;
    },
    onBrowserLog: (log) => process.stderr.write(`[chromium] ${log.text}\n`),
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) =>
      emitir({
        tipo: "progresso",
        progresso: progress,
        quadrosRenderizados: renderedFrames,
        quadrosCodificados: encodedFrames,
        etapa: stitchStage,
      }),
  });

  const { size } = fs.statSync(job.outputLocation);
  emitir({ tipo: "pronto", saida: job.outputLocation, bytes: size });
}

principal().catch((erro) => {
  emitir({ tipo: "erro", mensagem: String(erro?.stack ?? erro) });
  process.exitCode = 1;
});
