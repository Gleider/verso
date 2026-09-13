/**
 * Silabificação e distribuição de tempo dentro da palavra.
 *
 * Por que isto existe: o destaque preenchia cada palavra linearmente, mas canto
 * não é uniforme. Uma sílaba tônica, uma com ditongo ou uma travada por
 * consoante duram mais que uma átona aberta. Repartir o tempo da palavra por
 * peso silábico faz o preenchimento parar de escorregar em relação ao ouvido.
 *
 * O alvo não é rigor linguístico — é aproximar a duração percebida.
 */

const STRONG = "aeoáéóâêôãõà";
const WEAK = "iuy";
const ACCENTED_STRESS = "áéíóúâêô"; // acento gráfico manda na tonicidade
const NASAL_STRESS = "ãõ"; // ditongo nasal final atrai a tônica
const VOWELS = STRONG + WEAK + "íúï";

/** Consoantes que nunca se separam da vogal seguinte. */
const ONSET_CLUSTERS = new Set([
  "ch", "lh", "nh", "qu", "gu",
  "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr",
  "pl", "pr", "tl", "tr", "vl", "vr", "pn", "ps",
]);

export interface Syllable {
  text: string;
}

export interface TimedSyllable {
  text: string;
  s: number;
  e: number;
}

const isVowel = (c: string) => VOWELS.includes(c);
const isStrong = (c: string) => STRONG.includes(c);
const isWeak = (c: string) => WEAK.includes(c);

/** Duas vogais na mesma sílaba, ou em sílabas diferentes? */
function formsDiphthong(a: string, b: string, lang: string): boolean {
  if (lang !== "pt") return true; // em inglês a ortografia não ajuda; agrupamos
  if (NASAL_STRESS.includes(a) && (b === "e" || b === "o")) return true; // ão, ãe, õe
  if (isStrong(a) && isStrong(b)) return false; // hiato
  return isWeak(a) || isWeak(b);
}

/** O 'e' final de 'time' não é núcleo de sílaba. */
function hasSilentFinalE(word: string, lang: string): boolean {
  return (
    lang !== "pt" &&
    word.length > 2 &&
    word.endsWith("e") &&
    !isVowel(word[word.length - 2])
  );
}

/** Divide a palavra em sílabas; concatenadas, devolvem a palavra original. */
export function splitSyllables(word: string, lang = "pt"): Syllable[] {
  if (!word) return [];

  const lower = word.toLowerCase();
  const limit = hasSilentFinalE(lower, lang) ? lower.length - 1 : lower.length;

  // 1. Núcleos vocálicos, agrupando ditongos.
  const nuclei: { start: number; end: number }[] = [];
  let i = 0;
  while (i < limit) {
    if (!isVowel(lower[i])) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < limit && isVowel(lower[j]) && formsDiphthong(lower[j - 1], lower[j], lang)) {
      j += 1;
    }
    nuclei.push({ start: i, end: j });
    i = j;
  }

  if (nuclei.length <= 1) return [{ text: word }];

  // 2. Um corte entre cada par de núcleos, conforme as consoantes no meio.
  const cuts: number[] = [];
  for (let k = 0; k < nuclei.length - 1; k += 1) {
    const from = nuclei[k].end;
    const to = nuclei[k + 1].start;
    const between = to - from;

    if (between <= 1) {
      cuts.push(from); // hiato, ou consoante única que abre a sílaba seguinte
    } else {
      const lastTwo = lower.slice(to - 2, to);
      // Dígrafo ou encontro inseparável migram inteiros para a sílaba seguinte.
      cuts.push(ONSET_CLUSTERS.has(lastTwo) ? to - 2 : to - 1);
    }
  }

  const out: Syllable[] = [];
  let previous = 0;
  for (const cut of cuts) {
    if (cut > previous) out.push({ text: word.slice(previous, cut) });
    previous = cut;
  }
  out.push({ text: word.slice(previous) });
  return out;
}

/** Índice da sílaba tônica. */
function stressIndex(syllables: Syllable[], lang: string): number {
  if (syllables.length <= 1) return 0;
  const lowered = syllables.map((s) => s.text.toLowerCase());

  if (lang === "pt") {
    const accented = lowered.findIndex((s) => [...s].some((c) => ACCENTED_STRESS.includes(c)));
    if (accented >= 0) return accented;

    const nasal = lowered.findIndex((s) => [...s].some((c) => NASAL_STRESS.includes(c)));
    if (nasal >= 0) return nasal;

    // Sem acento gráfico: terminações em a/e/o (e plurais e nasais) são paroxítonas.
    const word = lowered.join("");
    const paroxytone = /(a|e|o|as|es|os|am|em|ens)$/.test(word);
    return paroxytone ? syllables.length - 2 : syllables.length - 1;
  }

  // Inglês: a primeira sílaba carrega o acento na maioria das palavras curtas.
  return 0;
}

/**
 * Peso de duração de cada sílaba.
 *
 * Tônica, ditongo e coda alongam; a sílaba final também, pelo alongamento
 * natural de fim de palavra.
 */
export function syllableWeights(syllables: Syllable[], lang = "pt"): number[] {
  const stress = stressIndex(syllables, lang);

  return syllables.map((syllable, index) => {
    const lower = syllable.text.toLowerCase();
    const vowels = [...lower].filter(isVowel).length;
    const lastVowel = [...lower].reduce((pos, c, at) => (isVowel(c) ? at : pos), -1);
    const hasCoda = lastVowel >= 0 && lastVowel < lower.length - 1;

    let weight = 1;
    if (vowels >= 2) weight += 0.3;
    if (hasCoda) weight += 0.15;
    if (index === stress) weight += 0.35;
    if (index === syllables.length - 1) weight += 0.1;
    return weight;
  });
}

/**
 * Reparte o intervalo da palavra entre suas sílabas.
 *
 * Os segmentos são contíguos por construção: o fim de um é o começo do próximo,
 * e o último termina exatamente onde a palavra termina — sem buraco onde o
 * destaque pudesse sumir.
 */
export function timeSyllables(
  word: { w: string; s: number; e: number },
  lang = "pt",
): TimedSyllable[] {
  const syllables = splitSyllables(word.w, lang);
  if (syllables.length === 0) return [];
  if (syllables.length === 1) {
    return [{ text: word.w, s: word.s, e: word.e }];
  }

  const weights = syllableWeights(syllables, lang);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const duration = Math.max(0, word.e - word.s);

  const out: TimedSyllable[] = [];
  let cursor = word.s;
  for (let i = 0; i < syllables.length; i += 1) {
    const isLast = i === syllables.length - 1;
    const end = isLast ? word.e : Math.round(cursor + (duration * weights[i]) / total);
    out.push({ text: syllables[i].text, s: cursor, e: end });
    cursor = end;
  }
  return out;
}
