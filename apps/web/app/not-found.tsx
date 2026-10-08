import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <h1>Nothing here</h1>
        <p>This page or run does not exist. Runs live in this computer’s byway workspace; a link from another computer will not open here.</p>
        <div className="empty-actions">
          <Link className="button button-primary" href="/">
            Go to Start
          </Link>
          <Link className="button" href="/history">
            See History
          </Link>
        </div>
      </div>
    </div>
  );
}
