/**
 * @byway/prompts: the versioned prompt templates behind every model call in the product (product spec §3.3, WP-P),
 * and the strict renderer that implements `PromptRenderer` from @byway/contracts.
 *
 * Code that must not touch Node built-ins (Temporal workflow bundles) imports `@byway/prompts/pure` instead.
 */
export { createPromptRenderer, DEFAULT_TEMPLATES_DIR, type PromptLibrary, type PromptRendererOptions, type TemplateInfo } from './renderer.ts';
export { PromptTemplateError, type PromptErrorCode } from './errors.ts';
export { parseTemplateFile, type Template } from './template.ts';
export * from './pure.ts';
