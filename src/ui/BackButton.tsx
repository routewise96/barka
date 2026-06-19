/**
 * src/ui/BackButton.tsx — единая крупная кнопка «назад» (UX-контракт раздела 6, п.6).
 *
 * Всегда в одном и том же месте (сверху слева, с учётом safe-area) и одинакового
 * вида на всех экранах — поэтому вынесена в один примитив и переиспользуется
 * в ImageScreen и в экранах-разделах. Иконка-глиф, без текста для ребёнка.
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radius, sizes, spacing } from '../theme/tokens';

export interface BackButtonProps {
  onPress: () => void;
}

export function BackButton({ onPress }: BackButtonProps) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Retour"
      hitSlop={spacing.sm}
      style={({ pressed }) => [
        styles.btn,
        { top: insets.top + spacing.md, left: spacing.md },
        pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.85 },
      ]}
    >
      <Text style={styles.glyph}>‹</Text>
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    // плоско: без теней — дёшево для слабого GPU; читаемость даёт контур
    borderWidth: 3,
    borderColor: colors.ink,
  },
  glyph: {
    fontSize: sizes.backGlyph,
    lineHeight: sizes.backGlyph,
    marginTop: -spacing.xs,
    color: colors.ink,
    fontWeight: '900',
  },
});
