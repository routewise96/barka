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
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { entriesByType, resolveAssetUri } from '../src/content/catalog';
import type { Catalog, ContentType } from '../src/content/types';
import { useAppStore } from '../src/store/useAppStore';
import { BigButton } from '../src/ui/BigButton';
import { colors, sizes, spacing } from '../src/theme/tokens';

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
});
