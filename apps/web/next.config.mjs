/** @type {import('next').NextConfig} */
const nextConfig = {
  // Empacota só o necessário para rodar: a imagem final não leva node_modules.
  output: "standalone",
  // Sem rewrite de /api: o browser chama a API diretamente (ver lib/api.ts).
  // O proxy de rewrites falha com 500 em uploads acima de ~8 MB, e áudio passa
  // muito disso. O CORS da API cobre o acesso direto.
};

export default nextConfig;
