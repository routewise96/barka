/**
 * src/ui/ImageScreen.tsx — переиспользуемый «экран = одна большая картинка»
 * (UX-контракт раздела 6, пп. 1, 3, 6).
 *
 *  - Одна доминирующая картинка (expo-image, contentFit="contain") на спокойном фоне.
 *  - При входе на экран автоматически играет звук (seekTo(0) для повторного входа —
 *    логика внутри player.playFromUri). Только один звук одновременно (singleton-плеер).
 *  - Тап по картинке — мгновенно повторить звук (<100мс ощущается).
 *  - Крупная очевидная кнопка «назад» всегда в одном и том же месте (сверху слева).
 *
 * Принимает уже разрешённые file:// URI (через resolveAssetUri на стороне экрана).
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playFromUri } from '../audio/player';
import { colors, motion, radius, sizes, spacing } from '../theme/tokens';

export interface ImageScreenProps {
  /** Абсолютный file:// URI главной картинки экрана. */
  imageUri: string;
  /** Абсолютный file:// URI звука, играющего автоматически при входе. */
  audioUri?: string;
  /** Обработчик кнопки «назад». Если не задан — кнопка не показывается. */
  onBack?: () => void;
}

export function ImageScreen({ imageUri, audioUri, onBack }: ImageScreenProps) {
  const insets = useSafeAreaInsets();

  // Звук играет автоматически при входе и при смене трека.
  // playFromUri сам делает seekTo(0) при повторном проигрывании того же URI.
  useEffect(() => {
    if (audioUri) void playFromUri(audioUri);
  }, [audioUri]);

  // Тап по картинке — повторить озвучку экрана.
  const replay = () => {
    if (audioUri) void playFromUri(audioUri);
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.imagePress} onPress={replay} accessibilityRole="image">
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="contain"
          // ассеты уже на диске — память важнее агрессивного кеша на 1GB RAM
          cachePolicy="memory"
          transition={0}
        />
      </Pressable>

      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={spacing.sm}
          style={({ pressed }) => [
            styles.back,
            { top: insets.top + spacing.md, left: spacing.md },
            pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.85 },
          ]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
      ) : null}
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
  back: {
    position: 'absolute',
    width: sizes.back,
    height: sizes.back,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    // плоско: без теней — дёшево для слабого GPU; читаемость даёт контур
    borderWidth: 3,
    borderColor: colors.ink,
  },
  backGlyph: {
    fontSize: sizes.backGlyph,
    lineHeight: sizes.backGlyph,
    marginTop: -spacing.xs,
    color: colors.ink,
    fontWeight: '900',
  },
});
