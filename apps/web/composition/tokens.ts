/**
 * As cores de `app/globals.css` como literais TypeScript.
 *
 * O `bundle()` do Remotion compila `composition/` com webpack próprio e não
 * carrega `globals.css` — o Tailwind do Next não existe lá dentro. No preview,
 * a composição roda montada na página do Next, onde o Tailwind *está*
 * carregado: uma classe funcionaria no preview e sumiria no vídeo exportado.
 * Por isso nada em `composition/` usa `className`; tudo usa `style={{}}` com
 * os valores literais daqui.
 */
export const CORES = {
  ground: "#0c1316",
  surface: "#121c20",
  surface2: "#18262b",
  line: "#25373d",
  lineSoft: "#1d2d32",
  ink: "#e6eeef",
  ink2: "#9eb1b5",
  ink3: "#6f8388",
  amber: "#e8a33d",
  amberBright: "#f5b959",
  amberSoft: "#33270f",
  ok: "#74b490",
  risk: "#db7a74",
} as const;
