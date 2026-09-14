// apps/web/renderer/prewarm.mjs
//
// Baixa o Chromium headless-shell durante o BUILD da imagem, não no primeiro
// render em produção — um contêiner recém-criado não deveria depender de
// acesso de rede em tempo de execução, e o primeiro vídeo não deveria parecer
// travado por minutos sem progresso nenhum.

import { ensureBrowser } from "@remotion/renderer";

await ensureBrowser({ logLevel: "info" });
console.log("Chromium headless-shell pronto.");
