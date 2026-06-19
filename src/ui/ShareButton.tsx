/**
 * src/ui/ShareButton.tsx — ненавязчивая кнопка «Поделиться» (угол экрана).
 *
 * ВЗРОСЛОЕ действие (не часть детского флоу), поэтому допустима иконка-аффорданс.
 * Презентационный примитив без логики шеринга — onPress прокидывает экран
 * (слой ui остаётся чистым от config/sharing). Размещается сверху справа,
 * с учётом safe-area; не мешает центральным плиткам разделов.
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radius, sizes, spacing } from '../theme/tokens';

export interface ShareButtonProps {
  onPress: () => void;
}

export function ShareButton({ onPress }: ShareButtonProps) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Partager Barka"
      hitSlop={spacing.sm}
      style={({ pressed }) => [
        styles.btn,
        { top: insets.top + spacing.md, right: spacing.md },
        pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.85 },
      ]}
    >
      <Text style={styles.glyph}>↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    zIndex: 10,
    width: sizes.back,
    height: sizes.back,
    borderRadius: radius.pill,
    backgroundColor: colors.accentCool,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: sizes.backGlyph,
    lineHeight: sizes.backGlyph,
    color: colors.onAccent,
    fontWeight: '900',
  },
});
