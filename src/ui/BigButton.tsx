/**
 * src/ui/BigButton.tsx — крупная тач-цель (UX-контракт раздела 6, пп. 2, 3).
 *
 *  - Картинка/иконка на скруглённой плоской поверхности; минимум 64dp,
 *    по умолчанию крупнее (sizes.bigButton).
 *  - Мгновенная визуальная реакция на тап: лёгкое масштабирование + затемнение
 *    (press-state, без тяжёлых анимаций — дёшево для слабого GPU).
 *  - Опциональный звук при нажатии (через singleton-плеер: один звук одновременно).
 *
 * Принимает уже разрешённый file:// URI картинки (через resolveAssetUri).
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { playFromUri } from '../audio/player';
import { TOUCH_TARGET_MIN, borders, colors, motion, radius, sizes } from '../theme/tokens';
import { SafeImage } from './SafeImage';

export interface BigButtonProps {
  /** Абсолютный file:// URI картинки кнопки. */
  imageUri?: string;
  /** Абсолютный file:// URI звука, который проиграется при нажатии. */
  soundUri?: string;
  onPress: () => void;
  /** Сторона квадратной кнопки (по умолчанию sizes.bigButton). Не меньше 64dp. */
  size?: number;
  /** Цвет рамки-подсветки (напр. обратная связь выбора). Без значения — рамки нет. */
  highlightColor?: string;
  /** Подпись для скринридера/режима учителя (детям текст не показывается). */
  accessibilityLabel?: string;
}

export function BigButton({
  imageUri,
  soundUri,
  onPress,
  size = sizes.bigButton,
  highlightColor,
  accessibilityLabel,
}: BigButtonProps) {
  const side = Math.max(size, TOUCH_TARGET_MIN);

  const handlePress = () => {
    // Звук — сразу при нажатии, чтобы реакция ощущалась мгновенной.
    if (soundUri) void playFromUri(soundUri);
    onPress();
  };

  const box: ViewStyle = {
    width: side,
    height: side,
    borderRadius: radius.lg,
    borderWidth: highlightColor ? borders.feedback : 0,
    borderColor: highlightColor ?? 'transparent',
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        box,
        pressed && { transform: [{ scale: motion.pressScale }], opacity: 0.9 },
      ]}
    >
      {imageUri ? (
        // Битая картинка контента деградирует в дружелюбный плейсхолдер (часть 2),
        // кнопка остаётся кликабельной (обложка битая ≠ страницы битые).
        <SafeImage uri={imageUri} style={styles.image} contentFit="cover" context={accessibilityLabel} />
      ) : (
        // Картинки нет по дизайну (раздел без контента) — нейтральная пустая плитка.
        <View style={styles.placeholder} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: TOUCH_TARGET_MIN,
    minHeight: TOUCH_TARGET_MIN,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
  },
});
