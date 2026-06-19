/**
 * src/play/playSession.ts — ЧИСТАЯ логика прохождения активности (без UI/IO).
 *
 * Состояние «текущая страница / завершено» как чистая функция от действий —
 * тестируется без рендера (см. scripts/test-play-session.mjs). Экран play
 * лишь диспатчит действия и реагирует на состояние; вся навигация по страницам
 * и правило «правильный выбор продвигает, неправильный — нет» живут здесь.
 *
 * Детский паттерн без наказания:
 *  - линейная страница: тап вперёд → следующая (NEXT);
 *  - страница с выбором: правильный выбор продвигает, неправильный оставляет
 *    на месте (выбор остаётся доступным, без блокировки/очков/проигрыша);
 *  - выход за последнюю страницу → finished:true (триггер записи прохождения).
 */

/** Состояние сессии прохождения одной активности. */
export interface PlayState {
  /** Индекс текущей страницы в item.pages[]. */
  pageIndex: number;
  /** Активность пройдена (дошли за последнюю страницу). Терминальное состояние. */
  finished: boolean;
}

export type PlayAction =
  /** Тап «вперёд» на линейной странице. */
  | { type: 'NEXT' }
  /** Сделан выбор: correct=true продвигает, false — остаёмся на странице. */
  | { type: 'CHOICE'; correct: boolean };

export const initialPlayState: PlayState = { pageIndex: 0, finished: false };

/** Продвижение на следующую страницу; за последней — finished. */
function advance(state: PlayState, totalPages: number): PlayState {
  if (state.finished) return state;
  const next = state.pageIndex + 1;
  if (next >= totalPages) {
    return { pageIndex: state.pageIndex, finished: true };
  }
  return { pageIndex: next, finished: false };
}

/**
 * Чистый редьюсер сессии. totalPages — длина item.pages (константа на активность).
 * Терминальность: после finished любые действия — no-op.
 */
export function playReducer(state: PlayState, action: PlayAction, totalPages: number): PlayState {
  if (state.finished) return state;
  switch (action.type) {
    case 'NEXT':
      return advance(state, totalPages);
    case 'CHOICE':
      // Неправильный выбор не меняет состояние — ребёнок пробует снова.
      return action.correct ? advance(state, totalPages) : state;
    default:
      return state;
  }
}
