/**
 * app/sandbox.tsx — ⚠️ ВРЕМЕННЫЙ DEBUG-маршрут (/sandbox). НЕ часть детского флоу.
 *
 * Песочница-«storybook» для ручной проверки UI-примитивов шага 5 на реальных
 * данных пака core_demo: ImageScreen, BigButton, ChoiceRow и singleton-плеера.
 * Каталог уже собран в useAppStore (init в app/_layout.tsx). Текст здесь —
 * отладочные подписи, а не интерфейс для ребёнка.
 *
 * УДАЛИТЬ перед релизом (или спрятать за dev-флагом) — см. шаг 6.
 */
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveAssetUri } from '../src/content/catalog';
import type { CatalogEntry } from '../src/content/types';
import { useAppStore } from '../src/store/useAppStore';
import { BigButton } from '../src/ui/BigButton';
import { ChoiceRow, type ChoiceItem } from '../src/ui/ChoiceRow';
import { ImageScreen } from '../src/ui/ImageScreen';
import { colors, sizes, spacing } from '../src/theme/tokens';

export default function Sandbox() {
  const insets = useSafeAreaInsets();
  const catalog = useAppStore((s) => s.catalog);

  if (!catalog) {
    return (
      <View style={styles.center}>
        <Text style={styles.note}>Каталог ещё не готов…</Text>
      </View>
    );
  }

  const story = catalog.byId.get('story_fr_demo_001');
  const covers: CatalogEntry[] = [
    catalog.byId.get('number_fr_003'),
    catalog.byId.get('letter_fr_a'),
    catalog.byId.get('story_fr_demo_002'),
  ].filter((e): e is CatalogEntry => e !== undefined);

  // page 1 (index 0) — картинка+звук для ImageScreen; page 2 (index 1) — choices.
  const page0 = story?.item.pages[0];
  const choicePage = story?.item.pages[1];

  const choiceItems: ChoiceItem[] =
    story && choicePage?.choices
      ? choicePage.choices.map((c) => ({
          imageUri: resolveAssetUri(story.pack, c.image),
          soundUri: resolveAssetUri(story.pack, c.audio),
          correct: c.correct,
        }))
      : [];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'DEBUG · sandbox' }} />
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.lg }}
      >
        <Text style={styles.banner}>⚠️ ВРЕМЕННЫЙ DEBUG-экран — примитивы шага 5</Text>

        {/* ── ImageScreen ─────────────────────────────────────────── */}
        <Text style={styles.h}>ImageScreen (звук авто при входе, тап = повтор)</Text>
        {story && page0 ? (
          <View style={styles.stage}>
            <ImageScreen
              imageUri={resolveAssetUri(story.pack, page0.image)}
              audioUri={resolveAssetUri(story.pack, page0.audio)}
              onBack={() => {
                /* debug: в реальном флоу — router.back() (шаг 6) */
              }}
            />
          </View>
        ) : (
          <Text style={styles.note}>story_fr_demo_001 не найдена</Text>
        )}

        {/* ── ChoiceRow ───────────────────────────────────────────── */}
        <Text style={styles.h}>ChoiceRow (тап → звук + рамка correct/wrong)</Text>
        {choiceItems.length > 0 ? (
          <ChoiceRow
            choices={choiceItems}
            onChoice={(i, correct) => {
              /* debug-only: оркестрация (переход/прогресс) будет на шаге 6 */
              void i;
              void correct;
            }}
          />
        ) : (
          <Text style={styles.note}>нет choices на стр. 2</Text>
        )}

        {/* ── BigButton ───────────────────────────────────────────── */}
        <Text style={styles.h}>BigButton (обложки; тап играет озвучку 1-й страницы)</Text>
        <View style={styles.coversRow}>
          {covers.map((e) => (
            <BigButton
              key={e.item.id}
              imageUri={resolveAssetUri(e.pack, e.item.cover)}
              soundUri={resolveAssetUri(e.pack, e.item.pages[0].audio)}
              size={sizes.cover}
              accessibilityLabel={e.item.title}
              onPress={() => {
                /* debug */
              }}
            />
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  banner: { color: colors.wrong, fontWeight: '900' },
  h: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  note: { color: colors.ink, opacity: 0.7 },
  stage: { height: 320, borderRadius: spacing.md, overflow: 'hidden', backgroundColor: colors.surface },
  coversRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
