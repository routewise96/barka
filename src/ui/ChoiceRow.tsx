/**
 * src/ui/ChoiceRow.tsx — ряд из ≤3 вариантов выбора (UX-контракт раздела 6, пп. 3, 4).
 *
 *  - Каждый choice — крупная тач-цель с картинкой (BigButton).
 *  - При нажатии мгновенно играет свой звук-реакция (choice.audio) через
 *    singleton-плеер и показывает визуальную обратную связь:
 *      correct → рамка цвета успеха, wrong → рамка цвета ошибки (из токенов).
 *  - ВАЖНО: это только примитив выбора с обратной связью. Логику «что дальше»
 *    (переход, запись прогресса) реализуют экраны на шаге 6 — здесь её НЕТ.
 *    Наружу отдаём факт выбора через onChoice(index, correct) — без оркестрации.
 *
 * Принимает уже разрешённые file:// URI (через resolveAssetUri на стороне экрана).
 * Модель валидна по построению: ≤3 вариантов, ровно один correct:true.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme/tokens';
import { BigButton } from './BigButton';

export interface ChoiceItem {
  /** Абсолютный file:// URI картинки варианта. */
  imageUri: string;
  /** Абсолютный file:// URI звука-реакции на выбор. */
  soundUri?: string;
  /** Правильный ли это вариант (для обратной связи цветом). */
  correct?: boolean;
}

export interface ChoiceRowProps {
  /** До 3 вариантов (раздел 6, п.4). */
  choices: ChoiceItem[];
  /** Колбэк факта выбора (без перехода/оркестрации — это шаг 6). */
  onChoice?: (index: number, correct: boolean) => void;
}

export function ChoiceRow({ choices, onChoice }: ChoiceRowProps) {
  // Индекс последнего выбранного варианта — для подсветки правильно/неправильно.
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View style={styles.row}>
      {choices.slice(0, 3).map((c, i) => {
        const isSelected = selected === i;
        const highlight = isSelected
          ? c.correct
            ? colors.correct
            : colors.wrong
          : undefined;
        return (
          <BigButton
            key={i}
            imageUri={c.imageUri}
            soundUri={c.soundUri}
            highlightColor={highlight}
            accessibilityLabel={`Choix ${i + 1}`}
            onPress={() => {
              setSelected(i);
              onChoice?.(i, c.correct === true);
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: spacing.md,
  },
});
