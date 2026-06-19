/**
 * app/play/[itemId].tsx — плеер активности: картинка + аудио + выборы.
 * ЗАГЛУШКА каркаса. Реализация — шаги 5-7 раздела 10.
 *
 * Возьмёт itemId из маршрута, найдёт запись через catalog.byId, отрендерит
 * страницы (ImageScreen + ChoiceRow), будет играть один звук за раз (audio/player),
 * и писать прогресс/события (db/progress).
 */
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function Play() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Плеер активности «{itemId}» — заглушка</Text>
    </View>
  );
}
