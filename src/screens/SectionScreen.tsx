/**
 * src/screens/SectionScreen.tsx — общий экран-раздел (списки внутри раздела).
 *
 * Слой «композиции экранов»: связывает каталог (entriesByType + resolveAssetUri),
 * примитивы (BigButton, BackButton) и навигацию. Используется тонкими маршрутами
 * app/sections/{stories,numbers,letters}.tsx — чтобы не дублировать сетку.
 *
 * UX-контракт раздела 6: крупные тач-цели (обложки), кнопка «назад» в одном месте,
 * без текста для ребёнка, прокрутка при большом числе элементов.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entriesByType, resolveAssetUri } from '../content/catalog';
import type { ContentType } from '../content/types';
import { getCompletedItemIds } from '../db/progress';
import { useAppStore } from '../store/useAppStore';
import { BackButton } from '../ui/BackButton';
import { BigButton } from '../ui/BigButton';
import { colors, sizes, spacing } from '../theme/tokens';

export function SectionScreen({ type }: { type: ContentType }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useAppStore((s) => s.catalog);
  const ensureProfile = useAppStore((s) => s.ensureProfile);

  // Лёгкая пометка пройденных активностей (★) — необязательная, не блокирует флоу.
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    void (async () => {
      const pid = await ensureProfile();
      const ids = await getCompletedItemIds(pid);
      if (active) setCompleted(ids);
    })();
    return () => {
      active = false;
    };
  }, [ensureProfile]);

  const entries = catalog ? entriesByType(catalog, type) : [];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.grid,
          {
            paddingTop: insets.top + sizes.back + spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
          },
        ]}
      >
        {entries.map(({ item, pack }) => {
          const done = completed.has(item.id);
          return (
            <View key={item.id} style={styles.tile}>
              <BigButton
                imageUri={resolveAssetUri(pack, item.cover)}
                size={sizes.cover}
                accessibilityLabel={item.title}
                highlightColor={done ? colors.correct : undefined}
                onPress={() => router.push({ pathname: '/play/[itemId]', params: { itemId: item.id } })}
              />
              {done ? <Text style={styles.star}>★</Text> : null}
            </View>
          );
        })}
      </ScrollView>

      <BackButton onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    width: sizes.cover,
    height: sizes.cover,
  },
  star: {
    position: 'absolute',
    top: -spacing.sm,
    right: -spacing.sm,
    fontSize: 34,
    color: colors.accent,
    // обводка-контраст за счёт тёмного текста-тени дешевле настоящей тени
    textShadowColor: colors.ink,
    textShadowRadius: 1,
  },
});
