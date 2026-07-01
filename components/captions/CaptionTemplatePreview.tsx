'use client';

import type React from 'react';
import type { CaptionStyle } from '@/types';

interface CaptionTemplatePreviewProps {
  style?: CaptionStyle | null;
}

export default function CaptionTemplatePreview({ style }: CaptionTemplatePreviewProps) {
  if (!style) {
    return <span className="text-sm font-black text-white">Default</span>;
  }

  const previewText = style.previewText || style.name || 'THE QUICK BROWN FOX';
  const words = previewText.split(/\s+/).filter(Boolean);
  const textTransform = style.uppercase === false || style.textTransform === 'none' ? 'none' : 'uppercase';
  const fontSize = Math.min(Math.max((style.fontSize || 64) * 0.34, 18), 34);
  const strokeWidth = Math.min(Math.max(style.strokeWidth || 0, 0), 4);
  const shadowColor = style.shadowColor || '#000000';
  const hasShadow = style.shadowEnabled !== false && style.shadow !== false;
  const highlightMode = style.highlightMode || 'active-word';
  const highlightColor = style.activeWordColor || style.highlightColor || '#FACC15';
  const isBackground = Boolean(style.backgroundEnabled && style.backgroundColor && style.backgroundColor !== 'transparent');
  const animationClass = style.animation === 'glitch'
    ? 'caption-preview-glitch'
    : style.animation === 'bounce' || style.animation === 'seamless-bounce'
      ? 'caption-preview-bounce'
      : style.animation === 'scale-in' || style.animation === 'pop'
        ? 'caption-preview-pop'
        : '';

  const baseStyle: React.CSSProperties = {
    fontFamily: fontStack(style.fontFamily),
    fontWeight: style.fontWeight || 900,
    fontSize,
    lineHeight: style.lineHeight || 1.05,
    letterSpacing: style.letterSpacing || 0,
    color: style.textColor || '#FFFFFF',
    textTransform,
    WebkitTextStroke: strokeWidth ? `${strokeWidth}px ${style.strokeColor || '#000000'}` : undefined,
    textShadow: hasShadow
      ? `${style.shadowOffsetX || 0}px ${style.shadowOffsetY || 4}px ${style.shadowBlur || 8}px ${shadowColor}`
      : undefined,
  };

  const wordNode = (word: string, index: number) => {
    const focused = style.highlightEnabled && (index === 0 || (words.length <= 2 && index === words.length - 1 && highlightMode !== 'label-first-word' && highlightMode !== 'capsule-first-word'));
    if (!focused) return <span key={`${word}-${index}`}>{word}</span>;

    if (highlightMode === 'label-first-word' || highlightMode === 'capsule-first-word') {
      return (
        <span
          key={`${word}-${index}`}
          className="rounded px-1"
          style={{ backgroundColor: style.highlightColor || '#38BDF8', color: style.activeWordColor || '#FFFFFF', WebkitTextStroke: '0px transparent' }}
        >
          {word}
        </span>
      );
    }

    if (highlightMode === 'underline') {
      return (
        <span key={`${word}-${index}`} style={{ color: highlightColor, textDecoration: `underline ${style.highlightColor || '#FACC15'} 3px` }}>
          {word}
        </span>
      );
    }

    return <span key={`${word}-${index}`} style={{ color: highlightColor }}>{word}</span>;
  };

  return (
    <div
      className={`max-w-full text-center ${animationClass}`}
      style={{
        ...baseStyle,
        backgroundColor: isBackground ? style.backgroundColor : undefined,
        borderRadius: isBackground ? style.borderRadius || 12 : undefined,
        padding: isBackground ? '6px 10px' : undefined,
      }}
    >
      {words.map((word, index) => (
        <span key={`${word}-${index}`}>
          {wordNode(word, index)}
          {index < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </div>
  );
}

function fontStack(fontFamily?: string) {
  switch (fontFamily) {
    case 'Anton':
      return '"Anton", Impact, sans-serif';
    case 'Bebas Neue':
      return '"Bebas Neue", "Arial Narrow", sans-serif';
    case 'Luckiest Guy':
      return '"Luckiest Guy", "Arial Black", system-ui, sans-serif';
    case 'Fredoka':
      return '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif';
    case 'Georgia':
      return 'Georgia, "Times New Roman", serif';
    case 'Montserrat':
    default:
      return '"Montserrat", "Arial Black", system-ui, sans-serif';
  }
}
