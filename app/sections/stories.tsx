/**
 * app/sections/stories.tsx — раздел «Сказки». Тонкая обёртка над SectionScreen.
 * Источник данных: entriesByType(catalog, 'story').
 */
import { SectionScreen } from '../../src/screens/SectionScreen';

export default function Stories() {
  return <SectionScreen type="story" />;
}
