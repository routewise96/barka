/**
 * src/ui/BigButton.tsx — крупная тач-цель (мин 64dp), картинка + звук при нажатии.
 * ЗАГЛУШКА каркаса (шаг 5 раздела 10). Сигнатура задана, оформление — позже.
 */
import { Pressable, View } from 'react-native';

import { TOUCH_TARGET_MIN, sizes } from '../theme/tokens';

export interface BigButtonProps {
  /** Абсолютный URI картинки кнопки. */
  imageUri?: string;
  /** Абсолютный URI звука, который проиграется при нажатии. */
  soundUri?: string;
  onPress: () => void;
}

export function BigButton({ onPress }: BigButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN }}
    >
      <View style={{ width: sizes.bigButton, height: sizes.bigButton }} />
    </Pressable>
  );
}
