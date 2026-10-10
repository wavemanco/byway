/**
 * The one flow walk every path rule reads (PR6, ST12, DR7, the composed profile's writer counts) lives in
 * @byway/recipe's semantics, beside what a recipe does when it runs, so that the analyses there of what reaches a step
 * (whose critique a writer applies, whose directions a person is shown) read the same walk. Re-exported here for the
 * validator's rules and its public API.
 */
export { flowRecipe, withoutFlowMemo, type FlowOps } from '@byway/recipe';
