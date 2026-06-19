/**
 * src/ui/ErrorBoundary.tsx — последняя сеть безопасности рантайма (часть 5).
 *
 * Любая НЕперехваченная ошибка рендера в дереве навигации иначе показала бы белый
 * (release) или красный (dev) экран краша. Boundary ловит её, логирует 'error_render'
 * и показывает дружелюбный экран с минимумом текста и крупной кнопкой «повторить» —
 * чтобы взрослый мог вернуть приложение в рабочее состояние, а не закрывать его.
 *
 * Error Boundary обязан быть классовым компонентом (хуков-аналога нет).
 */
import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logError } from '../db/progress';
import { colors, motion, radius, spacing } from '../theme/tokens';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    // Логирование безопасно (logError не кидает); диагностика — в локальную БД.
    void logError('error_render', `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`);
  }

  private reset = () => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    // Дружелюбный экран: иконка + минимум текста (для взрослого) + крупная «повторить».
    return (
      <View style={styles.root}>
        <Text style={styles.glyph}>🙂</Text>
        <Text style={styles.title}>Oups…</Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Réessayer"
          style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.85 }]}
        >
          <Text style={styles.btnGlyph}>↻</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  glyph: { fontSize: 88 },
  title: { fontSize: 24, fontWeight: '900', color: colors.textTeacher },
  btn: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGlyph: { fontSize: 44, color: colors.onAccent, fontWeight: '900' },
});
