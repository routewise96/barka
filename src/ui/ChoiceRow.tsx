/**
 * src/ui/ChoiceRow.tsx — ряд из не более 3 вариантов выбора (раздел 6, п.4).
 * ЗАГЛУШКА каркаса (шаг 5 раздела 10).
 */
import { View } from 'react-native';

import { spacing } from '../theme/tokens';
import { BigButton } from './BigButton';

export interface ChoiceOption {
  imageUri: string;
  soundUri?: string;
  onPress: () => void;
}

export interface ChoiceRowProps {
  /** До 3 вариантов (раздел 6, п.4). */
  choices: ChoiceOption[];
}

export function ChoiceRow({ choices }: ChoiceRowProps) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', gap: spacing.md }}>
      {choices.slice(0, 3).map((c, i) => (
        <BigButton key={i} imageUri={c.imageUri} soundUri={c.soundUri} onPress={c.onPress} />
      ))}
    </View>
  );
}
