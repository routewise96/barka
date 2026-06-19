/**
 * app/_layout.tsx — корневой layout и единственная точка инициализации.
 *
 * До показа экранов: открыть БД + миграции, распаковать bundled-паки, собрать
 * каталог (всё через useAppStore.initialize()). Пока не готово — заглушка-сплэш.
 * Сетевых вызовов нет и не будет (раздел 1, принцип «офлайн навсегда»).
 */
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { configureAudioForPlayback } from '../src/audio/player';
import { colors } from '../src/theme/tokens';
import { useAppStore } from '../src/store/useAppStore';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';

export default function RootLayout() {
  const initialized = useAppStore((s) => s.initialized);
  const initialize = useAppStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
    // Разово настраиваем аудио-режим до первого проигрывания (идемпотентно,
    // не блокирует UI). Детали политики — в configureAudioForPlayback.
    void configureAudioForPlayback();
  }, [initialize]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // headerShown:false — навигация для детей строится иконками/звуком, не хедером (раздел 6).
  // ErrorBoundary — последняя сеть: неперехваченная ошибка рендера показывает
  // дружелюбный экран вместо краша (часть 5).
  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }} />
    </ErrorBoundary>
  );
}
