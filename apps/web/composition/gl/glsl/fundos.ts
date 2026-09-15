/**
 * Os fundos da biblioteca, agora como GLSL.
 *
 * Eram geradores de `@remotion/effects` empilhados — 3 a 4 passes, cada um
 * copiando 2 MP para o próximo. Aqui são funções dentro do MESMO `main()`:
 * uma passada, zero cópia.
 *
 * Todas seguem a mesma assinatura para o montador do shader poder escolher
 * uma por `#define`, sem ramo em tempo de execução.
 *
 * `i` é a intensidade do movimento ambiente (0..1) e `pulso` é a batida.
 * `ms` é o único relógio.
 */

export const FUNDOS = /* glsl */ `
// --- aurora: véu de bandas macias sobre gradiente frio ---------------------
vec3 fundo_aurora(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.043, 0.176, 0.227), vec3(0.039, 0.059, 0.133), uv.y);
  float fase = ms * 0.00019 * (0.4 + i);
  float n = fbm(vec2(uv.x * 1.6 + fase, uv.y * 2.2 - fase * 0.6));
  // Banda macia: suavizar duas vezes evita a borda dura que o gerador antigo
  // produzia (virava mármore, não aurora).
  float banda = smoothstep(0.35, 0.72, n);
  vec3 verde = vec3(0.368, 0.917, 0.831);
  vec3 indigo = vec3(0.506, 0.549, 0.972);
  vec3 cor = base + banda * 0.18 * verde + smoothstep(0.5, 0.95, n) * 0.15 * indigo;
  return cor + pulso * 0.05;
}

// --- brasa: carvão aceso, fagulhas e halo quente ---------------------------
vec3 fundo_brasa(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.078, 0.020, 0.012), vec3(0.427, 0.141, 0.031), uv.y);
  float calor = fbm(vec2(uv.x * 3.0, uv.y * 3.0 - ms * 0.00012 * (0.5 + i)));
  base += calor * 0.16 * vec3(0.91, 0.35, 0.12);
  // Fagulhas: pontos esparsos que trocam em blocos de tempo.
  vec2 cel = floor(uv * vec2(90.0, 50.0));
  float bloco = floor(ms / 140.0);
  float faisca = step(0.985 - 0.01 * i, hash21(cel + bloco));
  base += faisca * vec3(1.0, 0.65, 0.3) * (0.5 + pulso);
  return base;
}

// --- oceano: faixas senoidais sobre azul -----------------------------------
vec3 fundo_oceano(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.024, 0.188, 0.286), vec3(0.008, 0.063, 0.102), uv.y);
  float onda = sin(uv.x * 9.0 + ms * 0.00055) * (0.03 + 0.04 * i);
  float faixa = sin((uv.y + onda) * 46.0);
  base += smoothstep(0.2, 1.0, faixa) * 0.10 * vec3(0.22, 0.74, 0.97);
  return base;
}

// --- neon: anéis concêntricos que avançam na batida ------------------------
vec3 fundo_neon(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.165, 0.043, 0.247), vec3(0.031, 0.012, 0.059), uv.y);
  vec2 p = centrado(uv, tam);
  float r = length(p);
  float avanco = ms * 0.00022 * (0.5 + i) + pulso * 0.12;
  float anel = fract(r * 9.0 - avanco);
  float linha = smoothstep(0.0, 0.08, anel) * smoothstep(0.22, 0.10, anel);
  vec3 rosa = vec3(0.925, 0.282, 0.600);
  vec3 azul = vec3(0.220, 0.741, 0.972);
  base += linha * 0.5 * mix(rosa, azul, 0.5 + 0.5 * sin(r * 6.0));
  return base;
}

// --- papel: creme com linhas de nível --------------------------------------
vec3 fundo_papel(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.937, 0.906, 0.839), vec3(0.812, 0.753, 0.635), uv.y);
  float campo = fbm(uv * 3.2 + 21.0);
  float nivel = fract(campo * 9.0);
  float linha = smoothstep(0.0, 0.06, nivel) * smoothstep(0.16, 0.08, nivel);
  base -= linha * (0.12 + 0.16 * i) * vec3(0.55, 0.45, 0.30);
  float vin = smoothstep(0.35, 0.95, length(centrado(uv, tam)));
  return mix(base, base * 0.78, vin * 0.35);
}

// --- grade: pontos regulares sobre azul esverdeado -------------------------
vec3 fundo_grade(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.184, 0.420, 0.490), vec3(0.039, 0.094, 0.114), uv.y);
  vec2 cel = fract(uv * vec2(44.0 * tam.x / tam.y, 44.0)) - 0.5;
  float raio = 0.14 + 0.16 * i + pulso * 0.10;
  float ponto = smoothstep(raio, raio - 0.06, length(cel));
  base *= mix(0.25, 1.0, ponto);
  float vin = smoothstep(0.30, 0.95, length(centrado(uv, tam)));
  return mix(base, base * 0.35, vin);
}

// --- raios: sunburst escuro girando devagar --------------------------------
vec3 fundo_raios(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec2 p = centrado(uv, tam) - vec2(0.0, -0.05);
  float ang = atan(p.y, p.x) + ms * 0.000045 * (0.4 + i);
  float raio = fract(ang / 6.2831853 * 28.0);
  float setor = step(0.5, raio);
  vec3 escuro = vec3(0.106, 0.063, 0.125);
  vec3 quente = vec3(0.227, 0.114, 0.047);
  vec3 base = mix(escuro, quente, setor);
  base *= mix(1.35, 0.55, smoothstep(0.0, 1.1, length(p)));
  return base + pulso * 0.06;
}

// --- vinil: sulcos finos concêntricos --------------------------------------
vec3 fundo_vinil(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec2 p = centrado(uv, tam);
  float r = length(p);
  vec3 base = mix(vec3(0.133, 0.188, 0.227), vec3(0.043, 0.063, 0.082), uv.y);
  float sulco = sin(r * 620.0 - ms * 0.0009 * (0.3 + i));
  base += sulco * 0.018;
  float brilho = smoothstep(0.9, 0.0, r) * 0.20;
  base += brilho * vec3(0.36, 0.45, 0.51);
  float vin = smoothstep(0.25, 0.9, r);
  return mix(base, base * 0.35, vin);
}

// --- vazamento: luz entrando na diagonal -----------------------------------
vec3 fundo_vazamento(vec2 uv, vec2 tam, float ms, float i, float pulso) {
  vec3 base = mix(vec3(0.137, 0.078, 0.212), vec3(0.051, 0.043, 0.071), uv.y);
  float ciclo = (1.0 - cos(6.2831853 * ms / 7000.0)) * 0.5;
  float faixa = dot(uv, normalize(vec2(1.0, 0.7)));
  float luz = smoothstep(0.75, 1.25, faixa + ciclo * 0.45);
  vec3 quente = mix(vec3(0.86, 0.38, 0.16), vec3(0.95, 0.72, 0.35), ciclo);
  return base + luz * (0.45 + 0.35 * i) * quente;
}
`;
