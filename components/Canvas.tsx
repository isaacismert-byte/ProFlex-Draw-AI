
import React, { useRef, useState, useEffect } from 'react';
import { AppNode, AppEdge, NodeType, PipeSize } from '../types';
import { COLORS } from '../constants';

interface CanvasProps {
  nodes: AppNode[];
  edges: AppEdge[];
  pressureDrop: number;
  onUpdateNodes: (nodes: AppNode[]) => void;
  onAddEdge: (from: string, to: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
  selectedTool: 'pipe' | 'select';
  validation: Record<string, { isValid: boolean; flow: number; capacity: number; error?: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onEdit?: (id: string) => void;
  isMobile: boolean;
}

const Canvas: React.FC<CanvasProps> = ({ 
  nodes, 
  edges, 
  pressureDrop,
  onUpdateNodes, 
  onAddEdge, 
  onDeleteNode,
  selectedTool,
  validation,
  selectedId,
  onSelect,
  onEdit,
  isMobile
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [pipingFrom, setPipingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [hasMovedSignificant, setHasMovedSignificant] = useState(false);
  
  // Persistent source for "Tap-Tap" piping mode
  const [tapPipingSource, setTapPipingSource] = useState<string | null>(null);

  const interactionState = useRef({
    lastId: '',
    lastTime: 0,
    tapCount: 0
  });

  // Reset piping source if the tool changes
  useEffect(() => {
    if (selectedTool === 'select') {
      setTapPipingSource(null);
    }
  }, [selectedTool]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    
    let clientX, clientY;
    // Fix: Use 'any' to bridge React Synthetic events and Native events in the union
    const ev = e as any;
    if (ev.touches && ev.touches.length > 0) {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    } else {
      clientX = ev.clientX;
      clientY = ev.clientY;
    }
    
    return {
      x: (clientX - CTM.e) / CTM.a,
      y: (clientY - CTM.f) / CTM.d
    };
  };

  const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent, id: string, isNode: boolean) => {
    if (isMobile && e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();
    
    const coords = getCoordinates(e);
    setDragStartPos(coords);
    setHasMovedSignificant(false);
    
    if (selectedTool === 'select') {
      if (isNode) setDraggingNode(id);
    } else if (selectedTool === 'pipe' && isNode) {
      setPipingFrom(id);
    }
  };

  const handleInteractionMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    setMousePos(coords);

    const threshold = isMobile ? 30 : 8;
    if (Math.abs(coords.x - dragStartPos.x) > threshold || Math.abs(coords.y - dragStartPos.y) > threshold) {
      setHasMovedSignificant(true);
    }

    if (draggingNode) {
      const updatedNodes = nodes.map(n => 
        n.id === draggingNode ? { ...n, x: coords.x, y: coords.y } : n
      );
      onUpdateNodes(updatedNodes);
    }
  };

  const handleInteractionEnd = (e: React.MouseEvent | React.TouchEvent, id: string, isNode: boolean = true) => {
    e.stopPropagation();
    const now = Date.now();
    const state = interactionState.current;

    let clientX = 0;
    let clientY = 0;
    // Fix: Use 'any' cast to avoid incompatible cast between React Synthetic and native events
    const ev = e as any;
    if (ev.changedTouches && ev.changedTouches.length > 0) {
      clientX = ev.changedTouches[0].clientX;
      clientY = ev.changedTouches[0].clientY;
    } else {
      clientX = ev.clientX;
      clientY = ev.clientY;
    }

    // PIPING TOOL LOGIC
    if (selectedTool === 'pipe') {
      let targetId = id;

      // ElementFromPoint fix for mobile 'captured' touch targets
      if (isMobile && hasMovedSignificant) {
        const elementUnderFinger = document.elementFromPoint(clientX, clientY);
        const nodeG = elementUnderFinger?.closest('g[data-node-id]');
        if (nodeG) {
          targetId = nodeG.getAttribute('data-node-id') || id;
        }
      }

      const isTargetNode = nodes.some(n => n.id === targetId);

      if (isTargetNode) {
        if (!tapPipingSource) {
          // LOCK SOURCE
          setTapPipingSource(targetId);
          onSelect(null);
        } else if (tapPipingSource === targetId && !hasMovedSignificant) {
          // UNLOCK IF SAME
          setTapPipingSource(null);
        } else if (tapPipingSource !== targetId) {
          // COMPLETE CONNECTION
          onAddEdge(tapPipingSource, targetId);
          setTapPipingSource(null);
        }
      }
      
      setDraggingNode(null);
      setPipingFrom(null);
      return;
    }

    // SELECT TOOL LOGIC
    if (selectedTool === 'select' && !hasMovedSignificant) {
      if (id === state.lastId && (now - state.lastTime < 500)) {
        state.tapCount++;
      } else {
        state.tapCount = 1;
      }

      state.lastId = id;
      state.lastTime = now;

      if (state.tapCount >= 2) {
        onEdit?.(id);
        state.tapCount = 0;
      } else {
        onSelect(id);
      }
    }
    
    setDraggingNode(null);
    setPipingFrom(null);
  };

  const renderPipe = (edge: AppEdge) => {
    const from = nodes.find(n => n.id === edge.from);
    const to = nodes.find(n => n.id === edge.to);
    if (!from || !to) return null;

    const val = validation[edge.id] || { isValid: true, flow: 0, capacity: 0 };
    const isSelected = selectedId === edge.id;
    const strokeColor = val.isValid ? (isSelected ? '#6366f1' : COLORS.PIPE) : COLORS.ERROR;
    const strokeWidth = 4 + (Object.values(PipeSize).indexOf(edge.size) * 2);

    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    return (
      <g 
        key={edge.id} 
        className="cursor-pointer group select-none touch-none" 
        onMouseDown={(e) => handleInteractionStart(e, edge.id, false)}
        onTouchStart={(e) => handleInteractionStart(e, edge.id, false)}
        onMouseUp={(e) => handleInteractionEnd(e, edge.id, false)}
        onTouchEnd={(e) => handleInteractionEnd(e, edge.id, false)}
      >
        <line 
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="transparent" strokeWidth={isMobile ? 60 : 40} strokeLinecap="round"
        />
        <line 
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"
          className={isSelected ? 'filter drop-shadow-md' : ''}
        />
        <rect x={midX - 25} y={midY - 10} width="50" height="20" rx="10" fill="white" stroke={strokeColor} strokeWidth="1" />
        <text x={midX} y={midY + 4} textAnchor="middle" fontSize="10" fontWeight="bold" fill={strokeColor} className="pointer-events-none">{edge.length}ft</text>
      </g>
    );
  };

  const renderNode = (node: AppNode) => {
    let color = COLORS.METER;
    let size = 24;
    const isSelected = selectedId === node.id;
    const isPipingSource = tapPipingSource === node.id;
    const isPipeToolActive = selectedTool === 'pipe';

    if (node.type === NodeType.JUNCTION) { color = COLORS.JUNCTION; size = 12; }
    else if (node.type === NodeType.MANIFOLD) { color = COLORS.MANIFOLD; size = 16; }
    else if (node.type === NodeType.APPLIANCE) { color = COLORS.APPLIANCE; size = 20; }

    return (
      <g 
        key={node.id} 
        data-node-id={node.id}
        transform={`translate(${node.x}, ${node.y})`}
        onMouseDown={(e) => handleInteractionStart(e, node.id, true)}
        onTouchStart={(e) => handleInteractionStart(e, node.id, true)}
        onMouseUp={(e) => handleInteractionEnd(e, node.id, true)}
        onTouchEnd={(e) => handleInteractionEnd(e, node.id, true)}
        className="cursor-pointer group select-none touch-none"
      >
        {/* Visual Cues for Connections */}
        {isPipeToolActive && (
          <g>
            <circle 
              r={size + 24} 
              fill="none" 
              stroke={isPipingSource ? "#6366f1" : "#cbd5e1"} 
              strokeWidth={isPipingSource ? "8" : "2"} 
              strokeDasharray={isPipingSource ? "" : "6 4"}
              className={isPipingSource ? "animate-pulse" : "opacity-30"}
            />
            {isPipingSource && (
               <circle 
                r={size + 32} 
                fill="none" 
                stroke="#6366f1" 
                strokeWidth="2" 
                className="animate-ping opacity-30"
              />
            )}
          </g>
        )}

        {/* Large touch target */}
        <circle r={size + 45} fill="transparent" />

        {node.type === NodeType.JUNCTION ? (
          <circle r={size} fill={color} stroke={isSelected ? "#6366f1" : "white"} strokeWidth={isSelected ? "4" : "2"} />
        ) : (
          <rect x={-size} y={-size} width={size*2} height={size*2} rx="4" fill={color} stroke={isSelected ? "#6366f1" : "white"} strokeWidth={isSelected ? "4" : "2"} />
        )}
        
        <text y={size + 18} textAnchor="middle" fontSize="11" fontWeight="800" className="fill-slate-900 pointer-events-none drop-shadow-sm uppercase tracking-tighter">{node.name}</text>
        
        {/* Delete Indicator */}
        {selectedTool === 'select' && isSelected && (
          <g onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}>
            <circle cx={size + 14} cy={-size - 14} r="18" fill="#ef4444" className="shadow-lg" />
            <text x={size + 14} y={-size - 8} textAnchor="middle" fontSize="22" fill="white" fontWeight="bold">×</text>
          </g>
        )}
      </g>
    );
  };

  const activePipeSourceId = tapPipingSource || (hasMovedSignificant ? pipingFrom : null);
  const sourceNode = nodes.find(n => n.id === activePipeSourceId);

  return (
    <div 
      className="flex-1 h-full bg-slate-100 relative overflow-hidden select-none touch-none" 
      onMouseMove={handleInteractionMove} 
      onTouchMove={handleInteractionMove}
      onMouseUp={() => { setDraggingNode(null); setPipingFrom(null); }} 
      onTouchEnd={() => { setDraggingNode(null); setPipingFrom(null); }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        className="w-full h-full"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1"/>
          </pattern>
        </defs>

        {/* Background interactions */}
        <rect 
          width="1000" height="1000" 
          fill="url(#grid)" 
          onMouseDown={() => { if (selectedTool === 'select') onSelect(null); setTapPipingSource(null); }}
          onTouchStart={() => { if (selectedTool === 'select') onSelect(null); setTapPipingSource(null); }}
        />

        {edges.map(renderPipe)}
        {nodes.map(renderNode)}
        
        {/* Connection Preview Ghost Line */}
        {sourceNode && (
          <line 
            x1={sourceNode.x} 
            y1={sourceNode.y} 
            x2={mousePos.x} 
            y2={mousePos.y} 
            stroke="#6366f1" 
            strokeWidth="4" 
            strokeDasharray="12,8" 
            className="pointer-events-none opacity-60"
          >
            <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.4s" repeatCount="indefinite" />
          </line>
        )}
      </svg>

      {/* Floating Instructions */}
      {selectedTool === 'pipe' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-8 py-4 rounded-full text-[12px] font-black uppercase tracking-[0.2em] shadow-2xl border-2 border-indigo-400 whitespace-nowrap z-50 animate-in slide-in-from-top duration-500">
          {tapPipingSource ? "STEP 2: TAP DESTINATION" : "STEP 1: TAP SOURCE"}
        </div>
      )}

      {selectedTool === 'select' && selectedId && (
         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-[0.2em] pointer-events-none backdrop-blur-md shadow-2xl z-50">
            Double {isMobile ? 'tap' : 'click'} to edit
         </div>
      )}
    </div>
  );
};

export default Canvas;
