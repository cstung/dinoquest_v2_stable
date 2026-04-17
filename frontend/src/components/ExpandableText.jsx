import { useState } from 'react';

export default function ExpandableText({ text, lines = 3, className = "" }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text && text.length > 120;

  if (!text) return null;

  return (
    <div className={className}>
      <p
        className={`text-muted text-xs leading-relaxed transition-all duration-200 ${
          isExpanded ? '' : `line-clamp-${lines}`
        }`}
      >
        {text}
      </p>

      {isLong && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="mt-1 text-[10px] font-bold uppercase tracking-wider underline decoration-dotted underline-offset-2 hover:bg-[#7C3AED] hover:text-white px-1 py-0.5 rounded transition-colors"
        >
          {isExpanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
