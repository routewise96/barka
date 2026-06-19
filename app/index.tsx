/**
 * app/index.tsx — стартовый экран: выбор профиля и 3 раздела (сказки/числа/буквы).
 * ЗАГЛУШКА каркаса. UI-реализация — шаг 6 раздела 10 (после UI-примитивов).
 */
import { Text, View } from 'react-native';

import { colors } from '../src/theme/tokens';

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <Text>Barka — заглушка стартового экрана</Text>
    </View>
  );
}
