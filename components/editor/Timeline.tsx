'use client';

import { useEditorStore } from '@/store/editorStore';
import { useRef, useEffect, useState, MouseEvent } from 'react';

export default function Timeline() {
  const { 
    duration, 
    currentTime, 
    setCurrentTime,
    overlayLayers
  } = useEditorStore();
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    updateTimeFromPointer(e);
    // Capture pointer to track outside the element
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      updateTimeFromPointer(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const updateTimeFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration === 0) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    setCurrentTime(newTime);
  };

  // Convert time to percentage for left position
  const getLeftPct = (time: number) => {
    if (duration === 0) return 0;
    return (time / duration) * 100;
  };

  return (
    <footer className="h-64 border-t border-border bg-sidebar flex flex-col select-none">
      <div className="h-8 border-b border-border flex items-center px-4 gap-4 text-xs text-secondary font-medium bg-canvas/50">
        <div className="w-32 border-r border-border h-full flex items-center">Layers</div>
        <div className="flex-1 flex justify-between">
          <span>Timeline (0.0s - {duration.toFixed(1)}s)</span>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Layer Headers */}
        <div className="w-32 border-r border-border bg-sidebar/80 p-2 space-y-1 flex flex-col overflow-y-auto">
          <div className="h-10 bg-canvas rounded flex items-center px-2 text-xs font-semibold truncate border-l-2 border-blue-500">Video</div>
          <div className="h-10 bg-canvas rounded flex items-center px-2 text-xs font-semibold truncate border-l-2 border-yellow-500">Subtitles</div>
          <div className="h-10 bg-canvas rounded flex items-center px-2 text-xs font-semibold truncate border-l-2 border-purple-500">Hook</div>
          
          {overlayLayers.map(layer => (
            <div key={layer.id} className="h-10 bg-canvas rounded flex items-center px-2 text-xs font-semibold truncate border-l-2 border-green-500">
              {layer.type} ({layer.id.substring(0, 4)})
            </div>
          ))}
        </div>
        
        {/* Timeline Tracks */}
        <div 
          className="flex-1 bg-canvas/30 relative overflow-x-auto cursor-text"
          ref={timelineRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Grid lines (10s intervals roughly) */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
             {/* We can add dynamic grid lines here later */}
          </div>

          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-energy z-20 pointer-events-none transition-all duration-75 ease-linear" 
            style={{ left: `${getLeftPct(currentTime)}%` }}
          >
            <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-energy rotate-45" />
          </div>
          
          {/* Tracks */}
          <div className="p-2 space-y-1 pointer-events-none min-w-[800px]">
            {/* Video Track */}
            <div className="h-10 relative">
              <div className="absolute top-0 bottom-0 left-0 bg-blue-900/30 border border-blue-500/50 rounded" style={{ width: '100%' }} />
            </div>
            
            {/* Subtitles Track (stub) */}
            <div className="h-10 relative">
              <div className="absolute top-0 bottom-0 bg-yellow-900/30 border border-yellow-500/50 rounded" style={{ left: '0%', width: '100%' }} />
            </div>
            
            {/* Hook Track (stub) */}
            <div className="h-10 relative">
              <div className="absolute top-0 bottom-0 bg-purple-900/30 border border-purple-500/50 rounded" style={{ left: '0%', width: '10%' }} />
            </div>

            {/* Custom Overlay Tracks */}
            {overlayLayers.map(layer => {
               const leftPct = getLeftPct(layer.startTime);
               const widthPct = getLeftPct(layer.endTime) - leftPct;
               return (
                 <div key={layer.id} className="h-10 relative">
                   <div 
                     className="absolute top-0 bottom-0 bg-green-900/30 border border-green-500/50 rounded" 
                     style={{ left: `${leftPct}%`, width: `${widthPct}%` }} 
                   />
                 </div>
               );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}
