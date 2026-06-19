/**
 * src/ui/ImageScreen.tsx — переиспользуемый «экран = одна большая картинка».
 * ЗАГЛУШКА каркаса (шаг 5 раздела 10). При входе будет автоматически играть звук.
 */
import { Image } from 'react-native';

import { colors } from '../theme/tokens';

export interface ImageScreenProps {
  /** Абсолютный URI главной картинки экрана. */
  imageUri: string;
  /** Абсолютный URI звука, играющего автоматически при входе. */
  audioUri?: string;
}

export function ImageScreen({ imageUri }: ImageScreenProps) {
  return (
    <Image
      source={{ uri: imageUri }}
      resizeMode="contain"
      style={{ flex: 1, backgroundColor: colors.background }}
    />
  );
}
