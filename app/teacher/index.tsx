/**
 * app/teacher/index.tsx — «Espace adulte» (уголок для взрослых).
 *
 * Единственное место с текстом для ВЗРОСЛЫХ (раздел 6, п.5) — не часть детского флоу,
 * поэтому текст/иконки уместны. Здесь живут взрослые действия дистрибуции контента:
 *   - «Partager» рядом с каждым установленным паком → экспорт в .barka + Share intent
 *     (Bluetooth/Xender/SHAREit), чтобы передать пак на другой телефон офлайн;
 *   - «Importer un pack» → системный file picker → импорт .barka с проверкой целостности.
 * После импорта каталог пересобирается (store.refreshCatalog).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportAndSharePack, pickAndImportPack } from '../../src/content/packArchive';
import { useAppStore } from '../../src/store/useAppStore';
import { BackButton } from '../../src/ui/BackButton';
import { colors, radius, sizes, spacing } from '../../src/theme/tokens';

/** Сторона круглой кнопки «поделиться» в строке пака. */
const TOUCH_SHARE = 56;

/** Человекочитаемая причина отказа импорта (для взрослого). */
const REJECT_FR: Record<string, string> = {
  'no-manifest': 'Fichier invalide : manifest absent.',
  'bad-json': 'Fichier invalide : manifest illisible.',
  'bad-shape': 'Fichier invalide : format du manifest incorrect.',
  'schema-too-new': 'Pack trop récent — mettez à jour Barka.',
  'schema-unreadable': 'Schéma de pack non pris en charge.',
  'hash-mismatch': 'Fichier corrompu pendant le transfert. Réessayez.',
  'missing-files': 'Fichier incomplet : des médias manquent.',
};

export default function Teacher() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const catalog = useAppStore((s) => s.catalog);
  const refreshCatalog = useAppStore((s) => s.refreshCatalog);
  const [busy, setBusy] = useState(false);

  const packs = catalog?.packs ?? [];

  const onImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await pickAndImportPack();
      if (res === null) return; // отменено пользователем
      if (!res.ok) {
        Alert.alert('Importation échouée', REJECT_FR[res.reason] ?? res.reason);
        return;
      }
      await refreshCatalog();
      const m: Record<string, string> = {
        installed: 'Pack installé.',
        updated: 'Pack mis à jour.',
        'already-installed': 'Ce pack est déjà installé.',
        'kept-newer': 'Une version plus récente est déjà installée.',
      };
      Alert.alert(res.manifest.displayName, m[res.status] ?? 'Importé.');
    } catch (e) {
      Alert.alert('Importation échouée', String(e));
    } finally {
      setBusy(false);
    }
  };

  const onShare = async (packId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await exportAndSharePack(packId);
    } catch (e) {
      Alert.alert('Partage échoué', String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + sizes.back + spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text style={styles.title}>Espace adulte</Text>

        <Pressable
          onPress={onImport}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.importBtn, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Text style={styles.importLabel}>＋ Importer un pack (.barka)</Text>
        </Pressable>

        <Text style={styles.section}>Packs installés ({packs.length})</Text>
        {packs.map((p) => (
          <View key={p.manifest.packId} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.packName} numberOfLines={1}>
                {p.manifest.displayName}
              </Text>
              <Text style={styles.packMeta}>
                v{p.manifest.version} · {p.manifest.items.length} éléments
              </Text>
            </View>
            <Pressable
              onPress={() => onShare(p.manifest.packId)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Partager ${p.manifest.displayName}`}
              hitSlop={spacing.sm}
              style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed, busy && styles.disabled]}
            >
              <Text style={styles.shareGlyph}>↗</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <BackButton onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textTeacher,
    marginBottom: spacing.lg,
  },
  importBtn: {
    backgroundColor: colors.accentCool,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  importLabel: { color: colors.onAccent, fontSize: 18, fontWeight: '800' },
  section: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textTeacher,
    opacity: 0.7,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  packName: { fontSize: 17, fontWeight: '700', color: colors.textTeacher },
  packMeta: { fontSize: 13, color: colors.textTeacher, opacity: 0.6, marginTop: 2 },
  shareBtn: {
    width: TOUCH_SHARE,
    height: TOUCH_SHARE,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareGlyph: { color: colors.onAccent, fontSize: 24, fontWeight: '900' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
