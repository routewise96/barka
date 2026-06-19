/**
 * src/ui/ImageScreen.tsx — переиспользуемый «экран = одна большая картинка»
 * (UX-контракт раздела 6, пп. 1, 3, 6).
 *
 *  - Одна доминирующая картинка (SafeImage → expo-image) на спокойном фоне; битая
 *    картинка деградирует в дружелюбный плейсхолдер, экран не падает (часть 2).
 *  - При входе на экран автоматически играет звук. Если авто-звук НЕ проигрался
 *    (файл битый/удалён) — показываем крупную кнопку «повторить звук»: молчащий
 *    экран без сигнала — худшее для аудио-первого приложения (часть 3). Flow не
 *    блокируется: листать дальше можно даже при немом звуке.
 *  - Тап по картинке: по умолчанию повтор звука; если задан onPress — вызывает его.
 *  - Крупная очевидная кнопка «назад» всегда в одном и том же месте (BackButton).
 *
 * Принимает уже разрешённые file:// URI (через resolveAssetUri на стороне экрана).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playFromUri } from '../audio/player';
import { colors, motion, radius, sizes, spacing } from '../theme/tokens';
import { BackButton } from './BackButton';
import { SafeImage } from './SafeImage';

export interface ImageScreenProps {
  /** Абсолютный file:// URI главной картинки экрана. */
  imageUri: string;
  /** Абсолютный file:// URI звука, играющего автоматически при входе. */
  audioUri?: string;
  /** Обработчик кнопки «назад». Если не задан — кнопка не показывается. */
  onBack?: () => void;
  /** Короткий контекст для лога ошибок картинки (напр. itemId/№ страницы). */
  context?: string;
  /**
   * Обработчик тапа по картинке. Если задан — заменяет поведение по умолчанию
   * (повтор звука). Плеер передаёт сюда «следующая страница» для линейных сказок.
   */
  onPress?: () => void;
}

export function ImageScreen({ imageUri, audioUri, onBack, context, onPress }: ImageScreenProps) {
  const insets = useSafeAreaInsets();
  // true → авто-звук не проигрался, показываем кнопку повтора.
  const [audioFailed, setAudioFailed] = useState(false);

  // Звук играет автоматически при входе и при смене трека. playFromUri сам делает
  // seekTo(0) при повторе того же URI и НЕ кидает — возвращает успех/неуспех.
  useEffect(() => {
    if (!audioUri) {
      setAudioFailed(false);
      return;
    }
    let active = true;
    setAudioFailed(false);
    void playFromUri(audioUri).then((ok) => {
      if (active && !ok) setAudioFailed(true);
    });
    return () => {
      active = false;
    };
  }, [audioUri]);

  const replay = () => {
    if (!audioUri) return;
    void playFromUri(audioUri).then((ok) => setAudioFailed(!ok));
  };

  const handlePress = () => {
    if (onPress) onPress();
    else replay(); // поведение по умолчанию — повтор озвучки
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.imagePress} onPress={handlePress} accessibilityRole="image">
        <SafeImage uri={imageUri} contentFit="contain" context={context} />
      </Pressable>

      {/* Видимый сигнал «звук есть, нажми» — только когда авто-звук не сыграл. */}
      {audioUri && audioFailed ? (
        <Pressable
          onPress={replay}
          accessibilityRole="button"
          accessibilityLabel="Réécouter le son"
          hitSlop={spacing.sm}
          style={({ pressed }) => [
            styles.replayBtn,
            { top: insets.top + spacing.md, right: spacing.md },
            pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.85 },
          ]}
        >
          <Text style={styles.replayGlyph}>🔊</Text>
        </Pressable>
      ) : null}

      {onBack ? <BackButton onPress={onBack} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  imagePress: {
    flex: 1,
  },
  replayBtn: {
    position: 'absolute',
    zIndex: 10,
    width: sizes.back,
    height: sizes.back,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replayGlyph: {
    fontSize: sizes.backGlyph,
    lineHeight: sizes.backGlyph,
  },
});
