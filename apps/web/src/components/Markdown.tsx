import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hostOf, isOwnArtifactUrl } from '../view/pages.ts';

/**
 * Markdown from models and people. react-markdown renders no raw HTML and strips unsafe link protocols, so
 * text artifacts cannot inject markup into the app. Images load only from byway's own artifact routes: an image from
 * another site would be fetched as soon as the text is shown, and a model can be led to put private text in its
 * address (SEC-4). Such an image is named instead, and not loaded.
 */
export function Markdown({ text, className = 'prose' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const url = typeof src === 'string' ? src : undefined;
            if (isOwnArtifactUrl(url)) return <img src={url} alt={alt ?? ''} loading="lazy" />;
            const host = hostOf(url);
            return (
              <span className="md-image-blocked">
                {alt ? `${alt}: ` : 'An image: '}
                {host ? `from ${host}, not loaded` : 'not loaded'}
              </span>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
