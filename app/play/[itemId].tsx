/**
 * app/play/[itemId].tsx — плеер активности (ядро взаимодействия, раздел 6, шаг 6).
 *
 * Берёт ContentItem по itemId из каталога, листает item.pages[] через ImageScreen
 * (картинка + авто-звук). Логика «текущая страница / завершено» — в чистом редьюсере
 * src/play/playSession.ts; этот компонент только диспатчит действия и делает IO
 * (звук, запись прогресса, навигация).
 *
 * Оркестрация выбора — детский паттерн без наказания:
 *  - correct: ChoiceRow даёт радостный звук+зелёную рамку → через ~1с автопереход
 *    (CHOICE), logEvent('choice_correct');
 *  - wrong: мягкий звук+красная рамка, остаёмся на странице (выбор доступен снова),
 *    logEvent('choice_wrong'). Без очков/блокировки/текста.
 * Завершение (выход за последнюю страницу): recordCompletion (атомарно пишет и
 * событие 'complete') → мягкий возврат в раздел.
 *
 * Один активный звук гарантирует singleton-плеер: смена страницы меняет audioUri
 * (старый звук гасится), выход из активности — stop() в cleanup.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useReducer, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { stop } from '../../src/audio/player';
import { resolveAssetUri } from '../../src/content/catalog';
import { logEvent, recordCompletion } from '../../src/db/progress';
import { initialPlayState, playReducer, type PlayAction, type PlayState } from '../../src/play/playSession';
import { useAppStore } from '../../src/store/useAppStore';
import { spacing } from '../../src/theme/tokens';
import { ChoiceRow, type ChoiceItem } from '../../src/ui/ChoiceRow';
import { ImageScreen } from '../../src/ui/ImageScreen';

/** Пауза перед автопереходом после правильного выбора — успеть «порадоваться». */
const CORRECT_ADVANCE_MS = 1000;

export default function Play() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useAppStore((s) => s.catalog);
  const ensureProfile = useAppStore((s) => s.ensureProfile);

  const entry = itemId ? catalog?.byId.get(itemId) : undefined;
  const totalPages = entry?.item.pages.length ?? 0;

  const [state, dispatch] = useReducer(
    (s: PlayState, a: PlayAction) => playReducer(s, a, totalPages),
    initialPlayState,
  );

  const profileIdRef = useRef<number | null>(null);
  const advancingRef = useRef(false); // защита от двойного срабатывания на correct
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Вход в активность: молча гарантируем профиль и логируем 'open'.
  useEffect(() => {
    if (!entry || !itemId) return;
    let active = true;
    void (async () => {
      const pid = await ensureProfile();
      if (!active) return;
      profileIdRef.current = pid;
      void logEvent(pid, itemId, 'open');
    })();
    return () => {
      active = false;
    };
  }, [entry, itemId, ensureProfile]);

  // Смена страницы — сбрасываем «замок» автоперехода и гасим висящий таймер.
  useEffect(() => {
    advancingRef.current = false;
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [state.pageIndex]);

  // Завершение активности: запись прохождения (+'complete') и мягкий возврат.
  useEffect(() => {
    if (!state.finished || !itemId) return;
    const pid = profileIdRef.current;
    void (async () => {
      if (pid != null) await recordCompletion(pid, itemId); // атомарно: progress + 'complete'
      router.back();
    })();
  }, [state.finished, itemId, router]);

  // Выход из активности останавливает звук (singleton), без утечки.
  useEffect(() => () => stop(), []);

  // Каталог к этому моменту готов (init в _layout). Нет элемента — мягко пусто.
  if (!entry || !itemId) {
    return <View style={styles.root} />;
  }

  const { item, pack } = entry;
  const page = item.pages[state.pageIndex];
  const hasChoices = !!page.choices?.length;

  const choiceItems: ChoiceItem[] = (page.choices ?? []).map((c) => ({
    imageUri: resolveAssetUri(pack, c.image),
    soundUri: resolveAssetUri(pack, c.audio),
    correct: c.correct,
  }));

  const handleChoice = (_index: number, correct: boolean) => {
    const pid = profileIdRef.current;
    if (correct) {
      if (pid != null) void logEvent(pid, itemId, 'choice_correct');
      if (advancingRef.current) return; // уже запланирован переход
      advancingRef.current = true;
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: 'CHOICE', correct: true });
      }, CORRECT_ADVANCE_MS);
    } else {
      if (pid != null) void logEvent(pid, itemId, 'choice_wrong');
      // остаёмся на странице — без наказания, выбор доступен снова
    }
  };

  return (
    <View style={styles.root}>
      <ImageScreen
        imageUri={resolveAssetUri(pack, page.image)}
        audioUri={resolveAssetUri(pack, page.audio)}
        onBack={() => router.back()}
        // Линейная страница: тап = вперёд. Страница с выбором: тап = повтор озвучки.
        onPress={hasChoices ? undefined : () => dispatch({ type: 'NEXT' })}
      />

      {hasChoices ? (
        <View style={[styles.choices, { bottom: insets.bottom + spacing.lg }]}>
          {/* key=pageIndex — сброс визуального состояния выбора на новой странице */}
          <ChoiceRow key={state.pageIndex} choices={choiceItems} onChoice={handleChoice} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  choices: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    // прозрачно для тапов мимо плиток (back-кнопка/картинка остаются доступны)
    pointerEvents: 'box-none',
  },
});
