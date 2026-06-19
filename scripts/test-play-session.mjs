/**
 * scripts/test-play-session.mjs — юнит-тест чистого редьюсера прохождения.
 * Импортирует реальный src/play/playSession.ts напрямую (Node 24 стрипит типы).
 *
 * Запуск:  node --test scripts/test-play-session.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { playReducer, initialPlayState } from '../src/play/playSession.ts';

test('NEXT продвигает на следующую страницу', () => {
  const s = playReducer(initialPlayState, { type: 'NEXT' }, 4);
  assert.deepEqual(s, { pageIndex: 1, finished: false });
});

test('NEXT за последней страницей → finished', () => {
  const last = { pageIndex: 3, finished: false };
  const s = playReducer(last, { type: 'NEXT' }, 4);
  assert.deepEqual(s, { pageIndex: 3, finished: true });
});

test('CHOICE correct продвигает', () => {
  const s = playReducer({ pageIndex: 1, finished: false }, { type: 'CHOICE', correct: true }, 4);
  assert.deepEqual(s, { pageIndex: 2, finished: false });
});

test('CHOICE wrong оставляет на месте (без наказания)', () => {
  const cur = { pageIndex: 1, finished: false };
  const s = playReducer(cur, { type: 'CHOICE', correct: false }, 4);
  assert.deepEqual(s, cur);
});

test('CHOICE correct на последней странице → finished (single-page number/letter)', () => {
  const s = playReducer({ pageIndex: 0, finished: false }, { type: 'CHOICE', correct: true }, 1);
  assert.deepEqual(s, { pageIndex: 0, finished: true });
});

test('finished терминально: любые действия — no-op', () => {
  const done = { pageIndex: 2, finished: true };
  assert.deepEqual(playReducer(done, { type: 'NEXT' }, 3), done);
  assert.deepEqual(playReducer(done, { type: 'CHOICE', correct: true }, 3), done);
});

test('полный прогон story_fr_demo_001 (4 стр., choices на стр.2 и 4)', () => {
  const total = 4;
  let s = initialPlayState;                          // стр.1 (index 0), линейная
  s = playReducer(s, { type: 'NEXT' }, total);       // → стр.2
  assert.equal(s.pageIndex, 1);
  s = playReducer(s, { type: 'CHOICE', correct: false }, total); // неверно — на месте
  assert.equal(s.pageIndex, 1);
  s = playReducer(s, { type: 'CHOICE', correct: true }, total);  // верно → стр.3
  assert.equal(s.pageIndex, 2);
  s = playReducer(s, { type: 'NEXT' }, total);       // → стр.4 (последняя, с choices)
  assert.equal(s.pageIndex, 3);
  assert.equal(s.finished, false);
  s = playReducer(s, { type: 'CHOICE', correct: true }, total);  // верно на последней → finished
  assert.equal(s.finished, true);
});
