/**
 * src/ui/SafeImage.tsx — обёртка expo-image с graceful degradation (часть 2).
 *
 * Любая картинка контента приходит как file:// URI и может оказаться битой/удалённой
 * уже ПОСЛЕ установки (плохая SD, оборванный Bluetooth, нехватка памяти). Вместо
 * пустоты или краша при onError показываем дружелюбный плейсхолдер и логируем
 * 'error_image'. Flow продолжается — экран остаётся живым и кликабельным.
 *
 * Использовать ВЕЗДЕ, где рендерится картинка контента (ImageScreen, BigButton).
 */
import { Image, type ImageContentFit } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { logError } from '../db/progress';
import { BROKEN_IMAGE_PLACEHOLDER } from '../theme/assets';

export interface SafeImageProps {
  /** Абсолютный file:// URI картинки контента. Пустой/undefined → сразу плейсхолдер. */
  uri?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** Короткий контекст для лога (напр. itemId/«cover») — помогает диагностике. */
  context?: string;
}

export function SafeImage({ uri, style, contentFit = 'contain', context }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  // Новый URI — сбрасываем флаг ошибки (вдруг следующая картинка цела).
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const showPlaceholder = !uri || failed;

  if (showPlaceholder) {
    return (
      <Image
        source={BROKEN_IMAGE_PLACEHOLDER}
        style={[styles.fill, style]}
        contentFit="contain"
        transition={0}
        accessibilityLabel="image indisponible"
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.fill, style]}
      contentFit={contentFit}
      // ассеты уже на диске — память важнее агрессивного кеша на 1GB RAM
      cachePolicy="memory"
      transition={0}
      onError={() => {
        setFailed(true);
        void logError('error_image', context ? `${context}: ${uri}` : uri!);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});

/** Ненавязчивый «голый» плейсхолдер (без логирования) — когда картинки нет по дизайну. */
export function PlaceholderBox({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.fill, style]} />;
}
