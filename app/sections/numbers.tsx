/**
 * app/sections/numbers.tsx — раздел «Цифры». Тонкая обёртка над SectionScreen.
 * Источник данных: entriesByType(catalog, 'number').
 */
import { SectionScreen } from '../../src/screens/SectionScreen';

export default function Numbers() {
  return <SectionScreen type="number" />;
}
