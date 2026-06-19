/**
 * src/ui/ImageScreen.tsx — переиспользуемый «экран = одна большая картинка»
 * (UX-контракт раздела 6, пп. 1, 3, 6).
 *
 *  - Одна доминирующая картинка (expo-image, contentFit="contain") на спокойном фоне.
 *  - При входе на экран автоматически играет звук (seekTo(0) для повторного входа —
 *    логика внутри player.playFromUri). Только один звук одновременно (singleton-плеер).
 *  - Тап по картинке: по умолчанию повторяет звук (<100мс); если задан onPress —
 *    вызывает его (плеер использует это как «вперёд» на линейной странице).
 *  - Крупная очевидная кнопка «назад» всегда в одном и том же месте (BackButton).
 *
 * Принимает уже разрешённые file:// URI (через resolveAssetUri на стороне экрана).
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { playFromUri } from '../audio/player';
import { colors } from '../theme/tokens';
import { BackButton } from './BackButton';

export interface ImageScreenProps {
  /** Абсолютный file:// URI главной картинки экрана. */
  imageUri: string;
  /** Абсолютный file:// URI звука, играющего автоматически при входе. */
  audioUri?: string;
  /** Обработчик кнопки «назад». Если не задан — кнопка не показывается. */
  onBack?: () => void;
  /**
   * Обработчик тапа по картинке. Если задан — заменяет поведение по умолчанию
   * (повтор звука). Плеер передаёт сюда «следующая страница» для линейных сказок.
   */
  onPress?: () => void;
}

export function ImageScreen({ imageUri, audioUri, onBack, onPress }: ImageScreenProps) {
  // Звук играет автоматически при входе и при смене трека.
  // playFromUri сам делает seekTo(0) при повторном проигрывании того же URI.
  useEffect(() => {
    if (audioUri) void playFromUri(audioUri);
  }, [audioUri]);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (audioUri) {
      void playFromUri(audioUri); // поведение по умолчанию — повтор озвучки
    }
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.imagePress} onPress={handlePress} accessibilityRole="image">
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="contain"
          // ассеты уже на диске — память важнее агрессивного кеша на 1GB RAM
          cachePolicy="memory"
          transition={0}
        />
      </Pressable>

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
  image: {
    flex: 1,
    width: '100%',
  },
});
