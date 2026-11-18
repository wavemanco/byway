'use client';

/**
 * On every screen once byway has said it started again at a new address (view/restarted.ts; B-188's re-checks): what
 * this tab typed and has not sent is kept for this address alone, so the person copies it before reloading.
 */
import { useSyncExternalStore } from 'react';
import { isRestarted, onRestarted } from '../view/restarted.ts';

export function RestartedNotice() {
  const restarted = useSyncExternalStore(onRestarted, isRestarted, () => false);
  if (!restarted) return null;
  return (
    <div className="restarted-banner" role="alert">
      <p>
        byway has started again, at a new address, so this page can no longer reach it. Anything you typed here and have not sent stays only on this
        screen: copy it before you reload or leave, then open the link byway printed this time.
      </p>
    </div>
  );
}
