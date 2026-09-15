/**
 * Sistemas de partícula, em GLSL.
 *
 * **Por célula, não por partícula.** A implementação óbvia — um laço sobre N
 * partículas para cada pixel — é O(N) por pixel e fica cara depressa. Aqui a
 * tela é uma grade: cada célula tem UMA partícula, e o pixel só olha as nove
 * células vizinhas. Custo constante, independente da densidade, e a densidade
 * vira o tamanho da célula.
 *
 * Tudo função do tempo e de hash: nada de `Math.random`, nada de estado entre
 * quadros. Duas execuções do mesmo quadro dão o mesmo resultado.
 *
 * **A regra que faz a busca por vizinhança funcionar:** a partícula de uma
 * célula nunca sai do entorno dela. O deslocamento é relativo à célula, e o
 * movimento que não volta sozinho (neve caindo, fagulha subindo) se fecha com
 * `fract` — cada partícula circula dentro da própria célula. Somar `t * vel` à
 * posição absoluta e reenrolar com `mod` no fim parece dar certo e não dá: o
 * desenho vai para o lugar certo, mas o pixel que deveria enxergar a partícula
 * procura só nas nove células ao redor DELE, e a origem já ficou longe. O
 * campo esvazia com o tempo, sem erro nenhum.
 */

export const PARTICULAS = /* glsl */ `
/**
 * Deslocamento da partícula DENTRO da célula, já animado.
 *
 * O repouso é [0,1) nos dois eixos. As oscilações passam um pouco disso de
 * propósito (a partícula encosta na vizinha), e o limite é o que a busca 3x3
 * aguenta: deslocamento + raio tem que ficar dentro de [-1, 2).
 */
vec2 deslocamentoNaCelula(vec2 celula, float t, int modo, float vel) {
  float h1 = hash21(celula);
  float h2 = hash21(celula + 37.0);
  vec2 o = vec2(h1, h2);

  if (modo == 1) {          // neve: cai e balança
    o.y = fract(h2 - t * (0.45 + h1 * 0.55) * vel);
    o.x = h1 + sin(t * (0.7 + h2) + h1 * 6.28) * 0.3;
  } else if (modo == 2) {   // fagulhas: sobem rápido
    o.y = fract(h2 + t * (1.0 + h1 * 1.2) * vel);
    o.x = h1 + sin(t * (1.6 + h2 * 2.0) + h1 * 6.28) * 0.18;
  } else if (modo == 3) {   // estrelas: paradas, só cintilam
    o = vec2(h1, h2);
  } else if (modo == 4) {   // vaga-lumes: vagam devagar
    o.x = h1 + sin(t * (0.35 + h1 * 0.4) + h2 * 6.28) * 0.38;
    o.y = h2 + cos(t * (0.3 + h2 * 0.35) + h1 * 6.28) * 0.38;
  } else {                  // poeira: deriva lenta na diagonal
    o.x = fract(h1 + t * (0.05 + h1 * 0.06) * vel);
    o.y = h2 + sin(t * 0.5 + h1 * 6.28) * 0.2;
  }
  return o;
}

/** Brilho da partícula neste instante, de 0 a 1. */
float brilhoNaCelula(vec2 celula, float t, int modo, float pulso) {
  float h = hash21(celula + 11.0);
  if (modo == 3) {          // estrelas cintilam devagar
    return 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * (1.2 + h * 2.0) + h * 6.28), 3.0);
  }
  if (modo == 4) {          // vaga-lumes pulsam e às vezes apagam
    float p = 0.5 + 0.5 * sin(t * (1.6 + h * 1.4) + h * 6.28);
    return pow(p, 2.5);
  }
  if (modo == 2) {          // fagulhas tremeluzem e reagem à batida
    return (0.45 + 0.55 * hash21(celula + floor(t * 12.0))) * (1.0 + pulso);
  }
  return 0.55 + 0.45 * sin(t * (0.6 + h) + h * 6.28);
}

/** Cor natural de cada tipo, quando o usuário não escolheu uma. */
vec3 corDoModo(int modo, vec2 celula) {
  if (modo == 1) return vec3(0.93, 0.96, 1.0);                 // neve
  if (modo == 2) {                                             // fagulhas
    float h = hash21(celula + 5.0);
    return mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.85, 0.35), h);
  }
  if (modo == 3) {                                             // estrelas
    float h = hash21(celula + 7.0);
    return mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.97, 0.9), h);
  }
  if (modo == 4) return vec3(0.85, 1.0, 0.45);                 // vaga-lumes
  return vec3(1.0, 0.95, 0.85);                                // poeira
}

/**
 * Quanto cada tipo desvia da densidade e do tamanho pedidos.
 *
 * Sem isto os cinco tipos saem com a mesma cara e só mudam de cor — foi a
 * queixa que já existiu sobre as texturas: o nome não descreve o que se vê.
 * Estrela é ponto miúdo e numeroso; vaga-lume é raro e gordo.
 * x = fator de densidade (mais células), y = fator de raio.
 */
vec2 fatoresDoModo(int modo) {
  if (modo == 1) return vec2(1.0, 0.95);   // neve
  if (modo == 2) return vec2(0.85, 0.6);   // fagulhas
  if (modo == 3) return vec2(1.45, 0.42);  // estrelas
  if (modo == 4) return vec2(0.6, 1.15);   // vaga-lumes
  return vec2(1.0, 0.8);                   // poeira
}

/**
 * Acumula as partículas das nove células vizinhas.
 *
 * Nove, e não uma: a partícula mora perto do centro da célula dela, mas o
 * raio de desenho atravessa a borda. Olhando só a própria célula, as
 * partículas apareceriam cortadas em quadrados.
 */
vec4 campoDeParticulas(
  vec2 uv, vec2 tam, float ms, int modo,
  float densidade, float tamanhoP, float vel, float pulso, vec3 corFixa, bool usarCorFixa
) {
  float t = ms / 1000.0;
  vec2 fator = fatoresDoModo(modo);

  // Densidade vira número de células. Mais células, mais partículas.
  float colunas = mix(8.0, 46.0, densidade) * fator.x;
  // As linhas saem da proporção da tela para a célula ficar QUADRADA em pixels
  // — é o que permite medir distância com length() puro mais abaixo.
  vec2 grade = vec2(colunas, colunas * tam.y / tam.x);
  vec2 p = uv * grade;
  vec2 celulaBase = floor(p);

  // Raio em CÉLULAS. Foi um multiplicador 0.06 perdido aqui que fez a partícula encher a
  // própria célula e a tela virar uma parede de manchas.
  float raio = mix(0.06, 0.30, tamanhoP) * fator.y * (1.0 + pulso * 0.5);

  vec3 soma = vec3(0.0);
  float alfa = 0.0;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 celula = celulaBase + vec2(float(dx), float(dy));
      vec2 pos = celula + deslocamentoNaCelula(celula, t, modo, vel);
      // A célula é quadrada em pixels, então distância em células já é
      // isotrópica: nada de corrigir proporção outra vez aqui.
      float dist = length(p - pos);
      float forma = smoothstep(raio, 0.0, dist);
      if (forma <= 0.0) continue;
      float b = brilhoNaCelula(celula, t, modo, pulso);
      vec3 cor = usarCorFixa ? corFixa : corDoModo(modo, celula);
      soma += cor * forma * b;
      alfa += forma * b;
    }
  }

  alfa = clamp(alfa, 0.0, 1.0);
  return vec4(alfa > 0.0 ? soma / max(alfa, 0.001) : vec3(0.0), alfa);
}
`;
