/**
 * app/sections/stories.tsx — список сказок по языкам. ЗАГЛУШКА каркаса.
 * Источник данных: entriesByType(catalog, 'story') из src/content/catalog.ts.
 */
import { Text, View } from 'react-native';

export default function Stories() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Сказки — заглушка</Text>
    </View>
  );
}
