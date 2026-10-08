import { parseUnifiedDiff } from '../view/diff.ts';

/**
 * A unified-diff viewer: one table per file with old and new line numbers. Added and removed lines carry
 * their + and - signs (and screen-reader words), so colour is never the only cue.
 */
export function DiffView({ text, compact = false, showWhy = true }: { text: string; compact?: boolean; showWhy?: boolean }) {
  const { files, why } = parseUnifiedDiff(text);
  if (files.length === 0) return <pre className="diff-raw">{text}</pre>;
  const limit = compact ? 14 : Number.POSITIVE_INFINITY;
  return (
    <div className={compact ? 'diff diff-compact' : 'diff'}>
      {files.map((file, f) => {
        let shown = 0;
        return (
          <section key={`${file.newPath}-${f}`} className="diff-file" aria-label={`Changes to ${file.newPath}`}>
            <header className="diff-file-head">
              <span className="diff-path">{file.newPath === '/dev/null' ? file.oldPath : file.newPath}</span>
              <span className="diff-stats">
                <span className="diff-plus">+{file.additions}</span> <span className="diff-minus">−{file.deletions}</span>
              </span>
            </header>
            <table className="diff-table">
              <tbody>
                {file.hunks.flatMap((hunk, h) => {
                  if (shown >= limit) return [];
                  const rows = [
                    <tr key={`h${h}`} className="diff-hunk">
                      <td colSpan={4}>{hunk.header}</td>
                    </tr>,
                  ];
                  for (const [l, line] of hunk.lines.entries()) {
                    if (shown++ >= limit) break;
                    rows.push(
                      <tr key={`h${h}l${l}`} className={`diff-line diff-${line.kind}`}>
                        <td className="diff-num">{line.oldLine ?? ''}</td>
                        <td className="diff-num">{line.newLine ?? ''}</td>
                        <td className="diff-sign" aria-hidden="true">
                          {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}
                        </td>
                        <td className="diff-code">
                          {line.kind !== 'context' ? <span className="sr-only">{line.kind === 'add' ? 'Added: ' : 'Removed: '}</span> : null}
                          {line.text}
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      {showWhy && why ? (
        <div className="diff-why">
          <h3>Why</h3>
          <p>{why}</p>
        </div>
      ) : null}
    </div>
  );
}
