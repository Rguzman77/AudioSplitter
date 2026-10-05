/**
 * Conversiones puras de transposición de tono.
 *
 * ÚNICA fuente de verdad para la relación semitonos ↔ ratio de frecuencia.
 * Antes esta fórmula estaba duplicada dentro del hook de audio; centralizarla
 * evita que pitch y tempo se "contaminen" entre sí por un cálculo divergente.
 *
 * Importante: el pitch (tono) y el tempo (velocidad) son DIMENSIONES
 * INDEPENDIENTES. Cambiar el tono NUNCA debe alterar el tempo. soundtouch
 * logra esto internamente combinando un resample (rate = ratio) con un
 * time-stretch compensatorio (tempo = 1/ratio); aquí solo producimos el ratio.
 */

/** Semitonos (p. ej. +7, -3) → multiplicador de frecuencia. 0 ⇒ 1 (sin cambio). */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** Multiplicador de frecuencia → semitonos (inverso de semitonesToRatio). */
export function ratioToSemitones(ratio: number): number {
  return 12 * Math.log2(ratio);
}
