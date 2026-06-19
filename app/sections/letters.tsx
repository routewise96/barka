/**
 * app/sections/letters.tsx — алфавит. ЗАГЛУШКА каркаса.
 * Источник данных: entriesByType(catalog, 'letter').
 */
import { Text, View } from 'react-native';

export default function Letters() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Буквы — заглушка</Text>
    </View>
  );
}
