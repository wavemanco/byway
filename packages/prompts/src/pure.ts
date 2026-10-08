/**
 * The parts of @byway/prompts that touch no Node built-ins (no fs, no crypto): prompt ids, output contracts and slot
 * layout helpers. Temporal workflow code may import this entry; the renderer itself runs in activities.
 */
export * from './ids.ts';
export * from './outputs.ts';
export * from './slots.ts';
