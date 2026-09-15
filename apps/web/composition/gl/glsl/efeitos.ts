/**
 * Os efeitos que precisam AMOSTRAR pixels — os únicos que justificam GPU.
 *
 * Todos assumem que o shader montado definiu `vec3 amostrar(vec2 uv)`, que é
 * o fundo (procedural ou textura). É assim que um efeito multi-amostra
 * (cromático, borrão radial, retícula) funciona sem precisar do resultado
 * numa textura intermediária: ele simplesmente chama o fundo de novo.
 *
 * É exatamente isso que o `@remotion/effects` não podia fazer — lá cada
 * efeito era um passe separado, e passar o resultado adiante custava uma
 * cópia de quadro inteiro (~7 ms medidos).
 *
 * `i` é a intensidade (0..1) e `pulso` a batida. `ms` é o único relógio.
 */

export const EFEITOS = /* glsl */ `
// --- transformações de UV (aplicadas ANTES de amostrar) --------------------

/** Pixelado: quantiza o UV numa grade que encolhe na batida. */
vec2 ef_pixelar(vec2 uv, vec2 tam, float i, float pulso) {
  float bloco = max(2.0, floor(mix(4.0, 34.0, i) * (1.0 - pulso * 0.55)));
  vec2 grade = tam / bloco;
  return (floor(uv * grade) + 0.5) / grade;
}

/** Distorção de barril: a curvatura da tela de tubo. */
vec2 ef_barril(vec2 uv, vec2 tam, float i) {
  vec2 p = centrado(uv, tam);
  float k = mix(0.06, 0.30, i);
  float r2 = dot(p, p);
  p *= 1.0 + k * r2;
  p.x /= tam.x / tam.y;
  return p + 0.5;
}

// --- efeitos de amostragem -------------------------------------------------

/** Separação de canais, com o ângulo girando devagar. */
vec3 ef_cromatico(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  float px = mix(3.0, 22.0, i) * (1.0 + pulso);
  float ang = radians(mod(ms / 90.0, 360.0));
  vec2 d = vec2(cos(ang), sin(ang)) * px / tam;
  return vec3(amostrar(uv + d).r, amostrar(uv).g, amostrar(uv - d).b);
}

/** Sangria de cor do VHS: separação só no eixo horizontal. */
vec3 ef_vhs_cor(vec2 uv, vec2 tam, float i, float pulso) {
  float px = (mix(2.0, 14.0, i) + pulso * 12.0 * i);
  vec2 d = vec2(px / tam.x, 0.0);
  return vec3(amostrar(uv + d).r, amostrar(uv).g, amostrar(uv - d).b);
}

/**
 * Borrão radial que salta na batida.
 *
 * Doze amostras num laço: numa passada só. No modelo antigo isto era um
 * efeito inteiro, com cópia de quadro na entrada e na saída.
 */
vec3 ef_zoomblur(vec2 uv, vec2 tam, float i, float pulso) {
  float forca = mix(0.04, 0.30, i) * (0.35 + pulso);
  vec2 dir = (vec2(0.5) - uv) * forca;
  vec3 soma = vec3(0.0);
  for (int k = 0; k < 12; k++) {
    soma += amostrar(uv + dir * (float(k) / 11.0));
  }
  return soma / 12.0;
}

/** Estouro: passa-alta borrado somado de volta. */
vec3 ef_bloom(vec2 uv, vec2 tam, float i, float pulso) {
  vec3 base = amostrar(uv);
  float raio = mix(10.0, 30.0, i);
  vec3 halo = vec3(0.0);
  // Oito direções num anel: barato e suficiente para halo suave.
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a)) * raio / tam;
    vec3 s = amostrar(uv + d);
    halo += max(s - 0.45, vec3(0.0));
  }
  halo /= 8.0;
  float ganho = mix(0.7, 2.2, i) * (1.0 + pulso * 0.6);
  return base + halo * ganho;
}

/** Retícula de impressão: o ponto cresce onde a imagem escurece. */
vec3 ef_halftone(vec2 uv, vec2 tam, float i) {
  float passo = mix(14.0, 5.0, i);
  float ang = radians(15.0);
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 px = uv * tam;
  vec2 cel = rot * px / passo;
  vec2 f = fract(cel) - 0.5;
  // Amostra no CENTRO da célula: é o que faz o ponto ter um tamanho só, em
  // vez de tremer dentro dele.
  vec2 centro = (rot * (floor(cel) + 0.5)) * passo;
  vec3 cor = amostrar(centro / tam);
  float lum = luminancia(cor);
  float raio = sqrt(1.0 - clamp(lum, 0.0, 1.0)) * 0.72;
  float ponto = smoothstep(raio, raio - 0.12, length(f));
  return mix(vec3(1.0), cor, ponto);
}

// --- superfícies (aplicadas DEPOIS de amostrar) ----------------------------

/** Varredura horizontal, com rolagem lenta. */
vec3 ef_varredura(vec3 cor, vec2 uv, vec2 tam, float ms, float i, float espaco, float vel) {
  float linha = sin((uv.y * tam.y + ms / vel) * 3.1415926 / espaco);
  float forca = mix(0.20, 0.70, i);
  return cor * (1.0 - forca * 0.5 * (0.5 + 0.5 * linha));
}

/** Chiado de fita: grão que troca ~30x por segundo. */
vec3 ef_chiado(vec3 cor, vec2 uv, float ms, float i) {
  float bloco = floor(ms / 33.0);
  float n = hash21(uv * 640.0 + bloco) - 0.5;
  return cor + n * mix(0.06, 0.22, i);
}

/** Cantos escuros. */
vec3 ef_vinheta(vec3 cor, vec2 uv, vec2 tam, float forca, float raio) {
  float d = length(centrado(uv, tam));
  float v = smoothstep(raio, raio + 0.55, d);
  return cor * (1.0 - forca * v);
}
`;
