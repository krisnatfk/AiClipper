const FONT = 'Montserrat';

function style(id, name, overrides = {}) {
  return {
    id,
    name,
    category: 'bold',
    previewText: 'THE QUICK BROWN FOX',
    fontFamily: FONT,
    fontWeight: 900,
    fontSize: 64,
    textTransform: 'uppercase',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 8,
    shadowEnabled: true,
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 8,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    highlightEnabled: false,
    highlightColor: '#FACC15',
    activeWordColor: '#FACC15',
    inactiveWordColor: '#FFFFFF',
    highlightMode: 'active-word',
    backgroundEnabled: false,
    backgroundColor: 'transparent',
    borderRadius: 12,
    letterSpacing: 0,
    lineHeight: 1.05,
    position: 'bottom',
    safeArea: true,
    maxWordsPerSegment: 2,
    maxWordsPerCaption: 2,
    maxLines: 2,
    uppercase: true,
    animation: 'none',
    animationIn: 'none',
    animationLoop: 'none',
    animationOut: 'fade',
    renderEngine: 'ass',
    fallbackRender: 'static',
    renderCompatibility: 'ass-static',
    premium: true,
    ...overrides,
  };
}

export const BUILTIN_CAPTION_TEMPLATES = [
  { id: 'default', name: 'Default Bold', captionStyle: style('default', 'Default Bold', { previewText: 'QUICK BROWN', fontFamily: 'Montserrat', fontWeight: 900, fontSize: 64, strokeWidth: 8, shadowBlur: 8, animation: 'pop', animationIn: 'pop', premium: false }) },
  { id: 'big-white', name: 'Big White', captionStyle: style('big-white', 'Big White', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Montserrat', fontWeight: 900, fontSize: 70, strokeWidth: 8, shadowBlur: 10, animation: 'pop', animationIn: 'pop' }) },
  { id: 'single-word-impact', name: 'Single Word Impact', captionStyle: style('single-word-impact', 'Single Word Impact', { previewText: 'THE', fontFamily: 'Anton', fontWeight: 900, fontSize: 92, strokeWidth: 9, animation: 'pop', animationIn: 'pop' }) },
  { id: 'classic-serif', name: 'Classic Serif', captionStyle: style('classic-serif', 'Classic Serif', { previewText: 'The quick brown fox', fontFamily: 'Georgia', fontWeight: 900, fontSize: 52, uppercase: false, textTransform: 'none', strokeWidth: 3, shadowBlur: 6, premium: false }) },
  { id: 'green-highlight', name: 'Green Highlight', captionStyle: style('green-highlight', 'Green Highlight', { previewText: 'BROWN FOX', highlightEnabled: true, highlightColor: '#8BFF4D', activeWordColor: '#8BFF4D', strokeWidth: 8 }) },
  { id: 'bubble-bold', name: 'Bubble Bold', captionStyle: style('bubble-bold', 'Bubble Bold', { previewText: 'BROWN', fontFamily: 'Luckiest Guy', fontWeight: 900, fontSize: 82, strokeWidth: 12, animation: 'bounce' }) },
  { id: 'condensed-white', name: 'Condensed White', captionStyle: style('condensed-white', 'Condensed White', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Bebas Neue', fontWeight: 900, fontSize: 66, strokeWidth: 6, letterSpacing: 0 }) },
  { id: 'soft-shadow', name: 'Soft Shadow', captionStyle: style('soft-shadow', 'Soft Shadow', { previewText: 'The quick brown fox', fontSize: 50, fontWeight: 800, uppercase: false, textTransform: 'none', strokeWidth: 2, shadowBlur: 12, shadowOffsetY: 5, premium: false }) },
  { id: 'yellow-word-highlight', name: 'Yellow Highlight', captionStyle: style('yellow-word-highlight', 'Yellow Highlight', { previewText: 'QUICK BROWN', highlightEnabled: true, highlightColor: '#FACC15', activeWordColor: '#FACC15', strokeWidth: 7, animation: 'pop', animationIn: 'pop' }) },
  { id: 'blue-label-highlight', name: 'Blue Label Highlight', captionStyle: style('blue-label-highlight', 'Blue Label Highlight', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Montserrat', highlightEnabled: true, highlightMode: 'label-first-word', highlightColor: '#38BDF8', activeWordColor: '#FFFFFF', backgroundEnabled: false, strokeWidth: 5 }) },
  { id: 'yellow-punch', name: 'Yellow Punch', captionStyle: style('yellow-punch', 'Yellow Punch', { previewText: 'BROWN FOX', highlightEnabled: true, highlightColor: '#FDE047', activeWordColor: '#FDE047', fontSize: 74, strokeWidth: 9 }) },
  { id: 'clean-tiny-bold', name: 'Clean Tiny Bold', captionStyle: style('clean-tiny-bold', 'Clean Tiny Bold', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Montserrat', fontSize: 44, fontWeight: 900, strokeWidth: 5, shadowBlur: 5, premium: false }) },
  { id: 'cyan-focus', name: 'Cyan Focus', captionStyle: style('cyan-focus', 'Cyan Focus', { previewText: 'BROWN FOX', highlightEnabled: true, highlightColor: '#22D3EE', activeWordColor: '#22D3EE', strokeWidth: 8 }) },
  { id: 'orange-pop', name: 'Orange Pop', captionStyle: style('orange-pop', 'Orange Pop', { previewText: 'QUICK BROWN', highlightEnabled: true, highlightColor: '#FB923C', activeWordColor: '#FB923C', animation: 'pop', animationIn: 'pop', strokeWidth: 8 }) },
  { id: 'karaoke-green', name: 'Karaoke Green', captionStyle: style('karaoke-green', 'Karaoke Green', { previewText: 'THE QUICK BROWN FOX', highlightEnabled: true, highlightColor: '#22C55E', activeWordColor: '#22C55E', animation: 'karaoke-pop', animationLoop: 'word-highlight' }) },
  { id: 'karaoke-yellow', name: 'Karaoke Yellow', captionStyle: style('karaoke-yellow', 'Karaoke Yellow', { previewText: 'THE QUICK BROWN FOX', highlightEnabled: true, highlightColor: '#FACC15', activeWordColor: '#FACC15', animation: 'karaoke-pop', animationLoop: 'word-highlight' }) },
  { id: 'boxed-white', name: 'Boxed White', captionStyle: style('boxed-white', 'Boxed White', { previewText: 'TO GET STARTED', fontFamily: 'Montserrat', backgroundEnabled: true, backgroundColor: '#000000CC', borderRadius: 10, strokeWidth: 3, shadowEnabled: false, shadow: false }) },
  { id: 'capsule-accent', name: 'Capsule Accent', captionStyle: style('capsule-accent', 'Capsule Accent', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Fredoka', fontWeight: 900, highlightEnabled: true, highlightMode: 'capsule-first-word', highlightColor: '#14B8A6', activeWordColor: '#FFFFFF', strokeWidth: 5 }) },
  { id: 'news-bold', name: 'News Bold', captionStyle: style('news-bold', 'News Bold', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Bebas Neue', fontWeight: 900, fontSize: 68, strokeWidth: 8, backgroundEnabled: false }) },
  { id: 'podcast-clean', name: 'Podcast Clean', captionStyle: style('podcast-clean', 'Podcast Clean', { previewText: 'The quick brown fox', fontSize: 50, fontWeight: 800, uppercase: false, textTransform: 'none', strokeWidth: 4, shadowBlur: 8, premium: false }) },
  { id: 'gaming-pop', name: 'Gaming Pop', captionStyle: style('gaming-pop', 'Gaming Pop', { previewText: 'BROWN FOX', fontFamily: 'Luckiest Guy', fontWeight: 900, highlightEnabled: true, highlightColor: '#A3E635', activeWordColor: '#A3E635', fontSize: 72, strokeWidth: 11, animation: 'shake-light' }) },
  { id: 'viral-zoom', name: 'Viral Zoom', captionStyle: style('viral-zoom', 'Viral Zoom', { previewText: 'QUICK BROWN', fontFamily: 'Anton', fontWeight: 900, fontSize: 76, strokeWidth: 9, animation: 'scale-in', animationIn: 'scale-in' }) },
  { id: 'glitch-impact', name: 'Glitch Impact', captionStyle: style('glitch-impact', 'Glitch Impact', { previewText: 'THE QUICK BROWN FOX', fontFamily: 'Bebas Neue', fontWeight: 900, textColor: '#FFFFFF', highlightEnabled: true, highlightColor: '#22D3EE', activeWordColor: '#22D3EE', strokeWidth: 7, animation: 'glitch', animationIn: 'glitch', fallbackRender: 'static' }) },
  { id: 'underline-focus', name: 'Underline Focus', captionStyle: style('underline-focus', 'Underline Focus', { previewText: 'BROWN FOX', highlightEnabled: true, highlightMode: 'underline', highlightColor: '#FACC15', activeWordColor: '#FACC15', strokeWidth: 7 }) },
  { id: 'creator-bold', name: 'Creator Bold', captionStyle: style('creator-bold', 'Creator Bold', { previewText: 'TO GET STARTED', highlightEnabled: true, highlightColor: '#FACC15', activeWordColor: '#FACC15', fontSize: 68, strokeWidth: 9, animation: 'pop' }) },
  { id: 'no-caption', name: 'No caption', captionStyle: style('no-caption', 'No caption', { previewText: 'No caption', highlightEnabled: false, uppercase: false, textTransform: 'none', animation: 'none', fontSize: 44, strokeWidth: 0, renderCompatibility: 'disabled', premium: false }) },
];

export function getBuiltinCaptionTemplate(id) {
  return BUILTIN_CAPTION_TEMPLATES.find((template) => template.id === id) || null;
}

export function getDefaultCaptionTemplate() {
  return getBuiltinCaptionTemplate('default');
}

export function toRenderTemplateRow(template, index = 0) {
  return {
    id: -1000 - index,
    template_id: template.id,
    name: template.name,
    type: 'caption',
    is_builtin: true,
    is_default: template.id === 'default',
    caption_style: template.captionStyle,
    hook_style: null,
    layout_style: null,
    logo_style: null,
    export_settings: null,
    created_at: '',
    updated_at: '',
  };
}
