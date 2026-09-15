/**
 * O renderer tem manifesto próprio — e é por isso que ele precisa de teste.
 *
 * O worker instala só o que o render usa (`renderer/package.json`, ~190 MB) em
 * vez do app inteiro do Next (~1,1 GB, com `next`, `@rspack`, `sharp` e
 * `typescript` que nenhum render abre). O preço é ter dois lugares declarando
 * as mesmas versões do Remotion.
 *
 * Divergir aí falha do pior jeito possível: o preview roda numa versão, o MP4
 * sai de outra, e a diferença aparece como "ficou diferente no vídeo" — a
 * classe de defeito que a composição única existe para eliminar.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface Manifesto {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const raiz = path.join(__dirname, "..", "..");
const ler = (p: string): Manifesto => JSON.parse(fs.readFileSync(p, "utf8")) as Manifesto;

const web = ler(path.join(raiz, "package.json"));
const renderer = ler(path.join(raiz, "renderer", "package.json"));

describe("manifesto do renderer", () => {
  it("declara as mesmas versões que o app", () => {
    const doApp = { ...web.dependencies, ...web.devDependencies };
    for (const [nome, versao] of Object.entries(renderer.dependencies ?? {})) {
      expect(doApp[nome], `${nome} não existe em apps/web/package.json`).toBeDefined();
      expect(doApp[nome], `${nome} diverge entre os dois manifestos`).toBe(versao);
    }
  });

  it("cobre tudo que a composição e o renderer importam", () => {
    // Se um arquivo passar a importar um pacote novo, ele precisa entrar no
    // manifesto do renderer — senão o `npm ci` do contêiner monta um
    // node_modules sem ele, e o erro só aparece no primeiro render.
    const importados = new Set<string>();
    const visitar = (dir: string) => {
      for (const nome of fs.readdirSync(dir)) {
        if (nome === "__tests__" || nome === "node_modules") continue;
        const caminho = path.join(dir, nome);
        if (fs.statSync(caminho).isDirectory()) {
          visitar(caminho);
          continue;
        }
        if (!/\.(ts|tsx|mjs)$/.test(nome)) continue;
        const fonte = fs.readFileSync(caminho, "utf8");
        for (const achado of fonte.matchAll(/from\s+"([^".][^"]*)"/g)) {
          const pacote = achado[1];
          if (pacote.startsWith("node:")) continue;
          // "@/..." é o alias do Next, não um pacote. Ele não pode aparecer
          // dentro do bundle (o bundler do Remotion ignora `paths`), mas isso
          // é a regra 3 de `composition/`, não assunto deste teste.
          if (pacote.startsWith("@/")) continue;
          // "@escopo/nome/sub" e "nome/sub" viram "@escopo/nome" e "nome".
          const partes = pacote.split("/");
          importados.add(pacote.startsWith("@") ? partes.slice(0, 2).join("/") : partes[0]);
        }
      }
    };
    // `lib/` entra porque a composição importa de lá (`versos.ts` →
    // `lib/syllables`, `audio/` → `lib/beat`), e portanto lib/ vai no bundle.
    visitar(path.join(raiz, "composition"));
    visitar(path.join(raiz, "renderer"));
    visitar(path.join(raiz, "lib"));

    const declarados = new Set(Object.keys(renderer.dependencies ?? {}));
    // `react-dom` não aparece num import: quem o carrega é o Remotion.
    declarados.delete("react-dom");
    const faltando = [...importados].filter((p) => !declarados.has(p));
    expect(faltando, "pacotes importados e não declarados no renderer").toEqual([]);
  });
});
