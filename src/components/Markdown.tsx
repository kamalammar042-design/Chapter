// Markdown + LaTeX renderer for tutor output. react-markdown never renders
// raw HTML, so model output cannot inject markup or scripts. Loaded lazily
// (with KaTeX) only on screens that need it.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './markdown.css';
import { normalizeMathDelimiters } from '@/lib/mathDelimiters';

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
        urlTransform={(url) => (SAFE_PROTOCOL.test(url) ? url : '')}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">{c}</a>
          ),
          img: () => null,
        }}
      >
        {normalizeMathDelimiters(children)}
      </ReactMarkdown>
    </div>
  );
}
