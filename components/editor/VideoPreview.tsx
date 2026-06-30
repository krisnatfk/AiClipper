'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { 
    videoUrl, 
    isPlaying, 
    currentTime, 
    setDuration, 
    setCurrentTime,
    layoutConfig,
    overlayLayers,
    captionStyle,
    hookStyle
  } = useEditorStore();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Sync current time only if it's out of sync by more than a small delta
    // to avoid stuttering when the video is playing naturally
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    
    // If playing naturally, update the store's current time
    if (isPlaying) {
      setCurrentTime(video.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  return (
    <div 
      className="relative w-full h-full flex items-center justify-center overflow-hidden p-4"
      style={{
        backgroundColor: '#0a0a0a',
        backgroundImage: 'radial-gradient(#222 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}
    >
      <div 
        className="relative bg-sidebar border border-border shadow-xl overflow-hidden flex items-center justify-center"
        style={{
          aspectRatio: layoutConfig.aspectRatio === '9:16' ? '9/16' : '16/9',
          height: '100%',
          maxHeight: '100%',
        }}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-cover pointer-events-none"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => useEditorStore.getState().setIsPlaying(false)}
            crossOrigin="anonymous"
          />
        ) : (
          <div className="text-secondary text-sm">No Video Source</div>
        )}

        {/* OVERLAYS */}

        {/* Reframe / safe-area visualization */}
        {layoutConfig.aspectRatio === '9:16' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-[8%] right-[8%] top-[10%] h-[16%] border border-sky-400/40 bg-sky-400/5" />
            <div className="absolute left-[8%] right-[8%] bottom-[12%] h-[18%] border border-emerald-400/40 bg-emerald-400/5" />
            {layoutConfig.reframeMode === 'manual-crop' && layoutConfig.manualCrop && (
              <div
                className="absolute border-2 border-primary bg-primary/10"
                style={{
                  left: `${layoutConfig.manualCrop.x}%`,
                  top: `${layoutConfig.manualCrop.y}%`,
                  width: `${layoutConfig.manualCrop.width}%`,
                  height: `${layoutConfig.manualCrop.height}%`,
                }}
              />
            )}
          </div>
        )}
        
        {/* Layout Split Visualization (MVP) */}
        {layoutConfig.mode === 'split-top-bottom' && (
          <div className="absolute inset-0 pointer-events-none border-4 border-dashed border-red-500/50 flex flex-col">
             <div className="flex-1 border-b-4 border-dashed border-red-500/50 relative bg-red-500/10">
                <span className="absolute top-2 left-2 text-xs bg-red-500 text-white px-2 py-1 rounded">Top Region</span>
             </div>
             <div className="flex-1 relative bg-blue-500/10">
                <span className="absolute top-2 left-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">Bottom Region</span>
             </div>
          </div>
        )}

        {/* Highlight Overlays */}
        {overlayLayers
          .filter(layer => layer.type === 'highlight' && currentTime >= layer.startTime && currentTime <= layer.endTime)
          .map(layer => {
            // Interpolation Logic
            let { x, y, width, height } = layer.config;
            const kfs = layer.config.keyframes || [];
            
            if (kfs.length > 0) {
              // Find bounding keyframes
              const before = [...kfs].reverse().find((k: any) => k.time <= currentTime);
              const after = kfs.find((k: any) => k.time > currentTime);

              if (before && after) {
                // Interpolate
                const progress = (currentTime - before.time) / (after.time - before.time);
                x = before.x + (after.x - before.x) * progress;
                y = before.y + (after.y - before.y) * progress;
                width = before.width + (after.width - before.width) * progress;
                height = before.height + (after.height - before.height) * progress;
              } else if (before) {
                // Use last keyframe
                x = before.x; y = before.y; width = before.width; height = before.height;
              } else if (after) {
                // Use first keyframe
                x = after.x; y = after.y; width = after.width; height = after.height;
              }
            }

            return (
              <div 
                key={layer.id}
                className="absolute pointer-events-none flex items-start justify-start transition-all duration-75"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  border: `${layer.config.borderWidth}px solid ${layer.config.borderColor}`,
                  zIndex: layer.zIndex,
                }}
              >
                {layer.config.label && (
                  <span 
                    className="text-xs text-black px-1 -mt-5"
                    style={{ backgroundColor: layer.config.borderColor }}
                  >
                    {layer.config.label}
                  </span>
                )}
              </div>
            );
          })}

        {/* Hook Overlay */}
        {hookStyle.text && currentTime >= hookStyle.startTime && currentTime <= hookStyle.endTime && (
          <div 
            className="absolute w-full px-8 text-center"
            style={{
              top: hookStyle.position === 'top' ? '15%' : hookStyle.position === 'middle' ? '50%' : 'auto',
              bottom: hookStyle.position === 'bottom' ? '15%' : 'auto',
              transform: hookStyle.position === 'middle' ? 'translateY(-50%)' : 'none',
            }}
          >
            <span 
              style={{
                fontSize: `${hookStyle.fontSize / 2.5}px`,
                fontWeight: hookStyle.fontWeight,
                color: hookStyle.textColor,
                backgroundColor: hookStyle.backgroundColor !== '#00000000' ? hookStyle.backgroundColor : 'transparent',
                WebkitTextStroke: hookStyle.strokeWidth ? `${hookStyle.strokeWidth / 2.5}px ${hookStyle.strokeColor}` : 'none',
                lineHeight: 1.2,
                display: 'inline-block',
                padding: '0.2em 0.4em',
                borderRadius: '8px',
              }}
            >
              {hookStyle.text}
            </span>
          </div>
        )}

        {/* Dummy Captions Overlay (for previewing styles) */}
        <div 
          className="absolute w-full px-8 text-center"
          style={{
            top: captionStyle.position === 'top' ? '25%' : captionStyle.position === 'middle' ? '50%' : 'auto',
            bottom: captionStyle.position === 'bottom' ? '25%' : 'auto',
            transform: captionStyle.position === 'middle' ? 'translateY(-50%)' : 'none',
          }}
        >
          <span 
            style={{
              fontFamily: captionStyle.fontFamily,
              fontSize: `${captionStyle.fontSize / 2.5}px`,
              fontWeight: captionStyle.fontWeight,
              color: captionStyle.textColor,
              WebkitTextStroke: captionStyle.strokeWidth ? `${captionStyle.strokeWidth / 2.5}px ${captionStyle.strokeColor}` : 'none',
              textTransform: captionStyle.uppercase ? 'uppercase' : 'none',
              textShadow: captionStyle.shadow ? `2px 2px 0px ${captionStyle.shadowColor}` : 'none',
              lineHeight: 1.2,
              display: 'inline-block',
            }}
          >
            Preview <span style={{ color: captionStyle.highlightColor }}>Caption</span> Style
          </span>
        </div>
      </div>
    </div>
  );
}
