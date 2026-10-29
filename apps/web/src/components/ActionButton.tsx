'use client';

import type { ComponentProps } from 'react';
import { actionAttributes, blockActivation, type ActionState } from './useAction.ts';

/** A button's own props (its ref included), less the ones ActionButton owns: the native disabled state is never used (R5). */
type NativeProps = Omit<ComponentProps<'button'>, 'disabled' | 'aria-disabled' | 'aria-busy'>;

export type ActionButtonProps = NativeProps & ActionState;

/**
 * A button that acts (useAction.ts). Busy or unavailable, it says so with aria-disabled (and aria-busy while busy),
 * keeps focus and its place in the Tab order, and a press does nothing: a submit does not submit. Incomplete, it looks
 * unavailable but a press still reaches `onClick`, so the screen can say what is missing. `type` is "button" unless set.
 */
export function ActionButton({ busy = false, unavailable = false, incomplete = false, onClick, type = 'button', ...rest }: ActionButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      {...actionAttributes({ busy, unavailable, incomplete })}
      onClick={(event) => {
        if (blockActivation(event, { busy, unavailable })) return;
        onClick?.(event);
      }}
    />
  );
}
