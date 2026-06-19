/**
 * src/theme/tokens.ts — дизайн-токены (раздел 6 UX-контракта).
 * Крупные тач-цели, высокий контраст, без мелкого текста для детей.
 */

/** Минимальная тач-цель — 64dp (раздел 6, п.2). Используется как базовый размер. */
export const TOUCH_TARGET_MIN = 64;

export const colors = {
  background: '#FFFDF5',
  surface: '#FFFFFF',
  primary: '#E2552B', // тёплый «земляной» акцент
  accent: '#F2B705',
  correct: '#3FA34D',
  wrong: '#D7263D',
  textTeacher: '#2B2B2B', // текст только для режима учителя
} as const;

export const spacing = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const radius = {
  md: 16,
  lg: 28,
} as const;

/** Крупные размеры — интерфейс для маленьких детей. */
export const sizes = {
  bigButton: 96,
  cover: 160,
  backArrow: 72,
} as const;
