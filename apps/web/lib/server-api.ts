/**
 * Endereço da API para código que roda no servidor.
 *
 * O navegador e o servidor enxergam a API por caminhos diferentes quando tudo
 * sobe em contêineres: o navegador acessa pela porta publicada no host
 * (`localhost:8000`), enquanto os Server Components falam pela rede interna do
 * compose (`http://api:8000`). Usar a mesma variável nos dois lados faz a
 * listagem vir vazia dentro do Docker, sem erro visível.
 */
export const SERVER_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";
