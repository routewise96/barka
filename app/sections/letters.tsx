/**
 * app/sections/letters.tsx — раздел «Алфавит». Тонкая обёртка над SectionScreen.
 * Источник данных: entriesByType(catalog, 'letter').
 */
import { SectionScreen } from '../../src/screens/SectionScreen';

export default function Letters() {
  return <SectionScreen type="letter" />;
}
