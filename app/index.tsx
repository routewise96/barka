/**
 * app/index.tsx — стартовый экран: три раздела (Сказки / Цифры / Алфавит).
 *
 * UX-контракт раздела 6: крупные тач-цели, навигация иконками/цветом (без текста
 * для ребёнка), яркий дисциплинированный стиль из токенов. Профиль создаётся молча
 * (ensureProfile) — экрана выбора профиля в MVP нет (раздел 6, шаг 6).
 *
 * Каждая плитка различима цветом (акцент-рамка раздела) и картинкой — обложкой
 * первого элемента раздела (готовых icon-ассетов ещё нет; контент-обложка нагляднее).
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entriesByType, resolveAssetUri } from '../src/content/catalog';
import type { Catalog, ContentType } from '../src/content/types';
import { shareAppLink } from '../src/sharing/shareAppLink';
import { useAppStore } from '../src/store/useAppStore';
import { BigButton } from '../src/ui/BigButton';
import { ShareButton } from '../src/ui/ShareButton';
import { colors, radius, sizes, spacing } from '../src/theme/tokens';

interface SectionDef {
  type: ContentType;
  route: Href;
  /** Цвет акцент-рамки раздела (различие по цвету — UX п.5). */
  color: string;
}

const SECTIONS: SectionDef[] = [
  { type: 'story', route: '/sections/stories', color: colors.primary },
  { type: 'number', route: '/sections/numbers', color: colors.accent },
  { type: 'letter', route: '/sections/letters', color: colors.accentCool },
];

/** Обложка-«иконка» раздела — cover первого элемента этого типа, если есть. */
function sectionThumb(catalog: Catalog, type: ContentType): string | undefined {
  const first = entriesByType(catalog, type)[0];
  return first ? resolveAssetUri(first.pack, first.item.cover) : undefined;
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useAppStore((s) => s.catalog);
  const ensureProfile = useAppStore((s) => s.ensureProfile);

  // Молча гарантируем дефолтный профиль — не блокируя экран.
  useEffect(() => {
    void ensureProfile();
  }, [ensureProfile]);

  if (!catalog) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.center]}>
      <View style={styles.tiles}>
        {SECTIONS.map((s) => (
          <BigButton
            key={s.type}
            imageUri={sectionThumb(catalog, s.type)}
            size={sizes.cover}
            highlightColor={s.color}
            accessibilityLabel={s.type}
            onPress={() => router.push(s.route)}
          />
        ))}
      </View>

      {/* Взрослое действие: поделиться ссылкой на приложение. Не мешает плиткам. */}
      <ShareButton onPress={() => void shareAppLink()} />

      {/* Дискретная точка входа в «уголок для взрослых» (импорт/экспорт паков). */}
      <Pressable
        onPress={() => router.push('/teacher')}
        accessibilityRole="button"
        accessibilityLabel="Espace adulte"
        hitSlop={spacing.sm}
        style={({ pressed }) => [
          styles.adultBtn,
          { top: insets.top + spacing.md, left: spacing.md },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.adultGlyph}>⚙</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.lg,
  },
  adultBtn: {
    position: 'absolute',
    zIndex: 10,
    width: sizes.back,
    height: sizes.back,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adultGlyph: {
    fontSize: sizes.backGlyph,
    lineHeight: sizes.backGlyph,
    color: colors.ink,
  },
});
