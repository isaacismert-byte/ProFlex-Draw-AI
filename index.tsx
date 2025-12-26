import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
enum NodeType {
  METER = 'METER',
  JUNCTION = 'JUNCTION',
  MANIFOLD = 'MANIFOLD',
  APPLIANCE = 'APPLIANCE'
}

enum PipeSize {
  THREE_EIGHTHS = '3/8"',
  HALF = '1/2"',
  THREE_QUARTERS = '3/4"',
  ONE = '1"',
  ONE_AND_QUARTER = '1-1/4"'
}

interface AppNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  name: string;
  btu: number;
}

interface AppEdge {
  id: string;
  from: string;
  to: string;
  size: PipeSize;
  length: number;
}

// --- CONSTANTS ---
const COLORS = {
  METER: '#10b981',
  JUNCTION: '#6366f1',
  MANIFOLD: '#06b6d4',
  APPLIANCE: '#f59e0b',
  ERROR: '#ef4444',
  PIPE: '#64748b'
};

const PIPE_SPECS: Record<PipeSize, { size: PipeSize; coeff: number; exp: number; capacity: number }> = {
  [PipeSize.THREE_EIGHTHS]: { size: PipeSize.THREE_EIGHTHS, coeff: 0.00002158927, exp: 2.02558185, capacity: 46000 },
  [PipeSize.HALF]: { size: PipeSize.HALF, coeff: 0.00000410606, exp: 2.1590935, capacity: 77000 },
  [PipeSize.THREE_QUARTERS]: { size: PipeSize.THREE_QUARTERS, coeff: 0.00000123682, exp: 2.00156167, capacity: 200000 },
  [PipeSize.ONE]: { size: PipeSize.ONE, coeff: 0.0000010746, exp: 1.77654817, capacity: 423000 },
  [PipeSize.ONE_AND_QUARTER]: { size: PipeSize.ONE_AND_QUARTER, coeff: 1.1678553403503E-07, exp: 1.992081557687, capacity: 662000 },
};

const DEFAULT_APPLIANCES = [
  { name: 'Furnace', btu: 100000 },
  { name: 'Water Heater', btu: 40000 },
  { name: 'Cooktop', btu: 65000 },
  { name: 'Fireplace', btu: 30000 },
  { name: 'Dryer', btu: 20000 }
];

// --- SERVICES ---
async function auditSystem(nodes: AppNode[], edges: AppEdge[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Analyze this gas piping system layout for a professional engineering audit.
    Nodes: ${JSON.stringify(nodes)}
    Edges: ${JSON.stringify(edges)}
    
    STRUCTURE YOUR RESPONSE EXACTLY AS FOLLOWS:
    1. PROVIDE EXACTLY TWO SECTIONS.
    2. SECTION 1 TITLE: "Safety & Compliance Audit"
    3. SECTION 2 TITLE: "Performance & Optimization"
    4. PROVIDE EXACTLY 5 BULLET POINTS PER SECTION.
    
    DO NOT INCLUDE ANY INTRO OR OUTRO TEXT.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.2 }
    });
    return response.text;
  } catch (error) {
    return "Safety & Compliance Audit\n- Connection error.\n- Verify API key.\n- Check network.\n- Ensure valid nodes.\n- Please try again.\n\nPerformance & Optimization\n- Insufficient data.\n- Calculation interrupted.\n- Try smaller segments.\n- Link all appliances.\n- Refresh and retry.";
  }
}

// --- COMPONENTS ---
const Toolbar: React.FC<{
  onAddNode: (type: NodeType, btu?: number, name?: string) => void;
  selectedTool: 'pipe' | 'select';
  setSelectedTool: (tool: 'pipe' | 'select') => void;
  selectedPipeSize: PipeSize;
  setSelectedPipeSize: (size: PipeSize) => void;
}> = ({ onAddNode, selectedTool, setSelectedTool, selectedPipeSize, setSelectedPipeSize }) => (
  <div className="absolute top-4 left-4 bottom-4 flex flex-col gap-3 z-10 w-64 overflow-y-auto pr-2 no-scrollbar pb-12">
    <div className="bg-white rounded-2xl shadow-xl p-4 border border-slate-200">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Modes</h3>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSelectedTool('select')} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${selectedTool === 'select' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
          <span className="text-[9px] font-black uppercase">Edit</span>
        </button>
        <button onClick={() => setSelectedTool('pipe')} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${selectedTool === 'pipe' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg>
          <span className="text-[9px] font-black uppercase">Pipe</span>
        </button>
      </div>
    </div>

    <div className="bg-white rounded-2xl shadow-xl p-4 border border-slate-200">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Add Components</h3>
      <div className="flex flex-col gap-2">
        <button onClick={() => onAddNode(NodeType.METER)} className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-xl border border-emerald-200 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          Gas Meter
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onAddNode(NodeType.JUNCTION)} className="py-3 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-widest rounded-xl border border-indigo-200 flex flex-col items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
            Junction
          </button>
          <button onClick={() => onAddNode(NodeType.MANIFOLD)} className="py-3 px-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-[9px] font-black uppercase tracking-widest rounded-xl border border-cyan-200 flex flex-col items-center gap-1">
            <div className="w-4 h-2 rounded-sm bg-cyan-500"></div>
            Manifold
          </button>
        </div>
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          {DEFAULT_APPLIANCES.map(app => (
            <button key={app.name} onClick={() => onAddNode(NodeType.APPLIANCE, app.btu, app.name)} className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg flex justify-between items-center transition-colors">
              <span>{app.name}</span>
              <span className="text-[9px] font-mono text-slate-400 opacity-60">{(app.btu / 1000)}k</span>
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="bg-white rounded-2xl shadow-xl p-4 border border-slate-200">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Pipe Size Selection</h3>
      <div className="grid grid-cols-1 gap-1.5">
        {Object.values(PipeSize).map(size => (
          <button key={size} onClick={() => setSelectedPipeSize(size)} className={`w-full py-2 px-3 text-[10px] font-black rounded-lg border transition-all flex justify-between items-center ${selectedPipeSize === size ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-[1.02]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
            <span>{size}</span>
            <span className="text-[8px] opacity-60 font-mono">{PIPE_SPECS[size].capacity.toLocaleString()} BTU</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

const Canvas: React.FC<{
  nodes: AppNode[];
  edges: AppEdge[];
  onUpdateNodes: (nodes: AppNode[]) => void;
  onAddEdge: (from: string, to: string) => void;
  onDeleteNode: (id: string) => void;
  selectedTool: 'pipe' | 'select';
  validation: Record<string, { isValid: boolean; flow: number }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ nodes, edges, onUpdateNodes, onAddEdge, onDeleteNode, selectedTool, validation, selectedId, onSelect }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [tapPipingSource, setTapPipingSource] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const getCoords = (e: any) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const CTM = svg.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - CTM.e) / CTM.a, y: (clientY - CTM.f) / CTM.d };
  };

  const handleMouseMove = (e: any) => {
    const pos = getCoords(e);
    setMousePos(pos);
    if (draggingNode) {
      onUpdateNodes(nodes.map(n => n.id === draggingNode ? { ...n, x: pos.x, y: pos.y } : n));
    }
  };

  const handleNodeClick = (id: string) => {
    if (selectedTool === 'pipe') {
      if (!tapPipingSource) setTapPipingSource(id);
      else if (tapPipingSource !== id) {
        onAddEdge(tapPipingSource, id);
        setTapPipingSource(null);
      } else setTapPipingSource(null);
    } else {
      onSelect(id === selectedId ? null : id);
    }
  };

  return (
    <div className="flex-1 bg-slate-100 relative overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={() => setDraggingNode(null)}>
      <svg ref={svgRef} viewBox="0 0 1000 1000" className="w-full h-full">
        <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1"/></pattern></defs>
        <rect width="1000" height="1000" fill="url(#grid)" onClick={() => { onSelect(null); setTapPipingSource(null); }} />
        
        {edges.map(edge => {
          const from = nodes.find(n => n.id === edge.from);
          const to = nodes.find(n => n.id === edge.to);
          if (!from || !to) return null;
          const val = validation[edge.id] || { isValid: true };
          const color = val.isValid ? COLORS.PIPE : COLORS.ERROR;
          return (
            <g key={edge.id} className="cursor-pointer group">
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={selectedId === edge.id ? 8 : 4} strokeLinecap="round" onClick={() => onSelect(edge.id)} />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 10} textAnchor="middle" className="text-[10px] font-black fill-slate-400">{edge.length}ft</text>
            </g>
          );
        })}

        {nodes.map(node => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className="cursor-pointer group" onMouseDown={() => { setDraggingNode(node.id); handleNodeClick(node.id); }}>
            {tapPipingSource === node.id && <circle r="30" fill="none" stroke="#6366f1" strokeWidth="2" className="animate-ping" />}
            <circle r={node.type === NodeType.METER ? 20 : 14} fill={COLORS[node.type as keyof typeof COLORS] || '#000'} stroke={selectedId === node.id ? '#fff' : 'none'} strokeWidth="4" />
            <text y="35" textAnchor="middle" className="text-[11px] font-black fill-slate-900 uppercase tracking-tighter">{node.name}</text>
            {selectedId === node.id && (
              <g transform="translate(20, -20)" onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}>
                <circle r="12" fill="#ef4444" />
                <text y="5" textAnchor="middle" className="fill-white text-[14px] font-black">×</text>
              </g>
            )}
          </g>
        ))}

        {tapPipingSource && (
          <line x1={nodes.find(n => n.id === tapPipingSource)?.x} y1={nodes.find(n => n.id === tapPipingSource)?.y} x2={mousePos.x} y2={mousePos.y} stroke="#6366f1" strokeWidth="2" strokeDasharray="5,5" className="pointer-events-none" />
        )}
      </svg>
      {selectedTool === 'pipe' && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl">
          {tapPipingSource ? "Select Destination Node" : "Select Source Node"}
        </div>
      )}
    </div>
  );
};

// --- MAIN APP ---
const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'designer'>('home');
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<AppEdge[]>([]);
  const [projectName, setProjectName] = useState('New Project');
  const [selectedTool, setSelectedTool] = useState<'pipe' | 'select'>('select');
  const [selectedPipeSize, setSelectedPipeSize] = useState<PipeSize>(PipeSize.HALF);
  const [validation, setValidation] = useState<Record<string, { isValid: boolean; flow: number }>>({});
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(() => {
    const results: Record<string, { isValid: boolean; flow: number }> = {};
    const getFlow = (edgeId: string): number => {
      const edge = edges.find(e => e.id === edgeId);
      if (!edge) return 0;
      const target = nodes.find(n => n.id === edge.to);
      if (!target) return 0;
      let flow = target.btu || 0;
      edges.filter(e => e.from === target.id).forEach(e => flow += getFlow(e.id));
      return flow;
    };
    edges.forEach(e => {
      const flow = getFlow(e.id);
      const cap = PIPE_SPECS[e.size].capacity;
      results[e.id] = { isValid: flow <= cap, flow };
    });
    setValidation(results);
  }, [nodes, edges]);

  useEffect(() => validate(), [nodes, edges, validate]);

  const handleSave = () => {
    const data = JSON.stringify({ nodes, edges, projectName });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${projectName}.proflex`;
    a.click();
  };

  const handleImport = (e: any) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const d = JSON.parse(ev.target?.result as string);
      setNodes(d.nodes || []); setEdges(d.edges || []); setProjectName(d.projectName || 'Imported'); setView('designer');
    };
    reader.readAsText(file);
  };

  if (view === 'home') return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white font-black text-4xl shadow-2xl mb-8 animate-pulse-subtle">PF</div>
      <h1 className="text-5xl font-black text-slate-900 tracking-tighter mb-4">ProFlex Draw</h1>
      <p className="text-slate-400 font-medium mb-12">Industrial Gas Piping Designer</p>
      <div className="flex flex-col w-full max-w-xs gap-3">
        <button onClick={() => setView('designer')} className="bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl hover:bg-indigo-700 transition-all active:scale-95">New Design</button>
        <button onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-slate-200 py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:border-indigo-400 hover:text-indigo-600 transition-all">Load Design</button>
      </div>
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-30 shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={() => setView('home')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} className="font-black text-slate-900 bg-transparent border-none outline-none text-xl w-64 focus:text-indigo-600 transition-colors" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-slate-500 font-bold text-sm hover:text-slate-900">Load</button>
          <button onClick={handleSave} className="px-4 py-2 text-indigo-600 font-bold text-sm hover:text-indigo-700">Save</button>
          <button onClick={handleSave} className="px-4 py-2 text-slate-400 font-bold text-sm hover:text-slate-900">Save As</button>
          <button onClick={async () => { setIsAuditing(true); setAiReport(await auditSystem(nodes, edges)); setIsAuditing(false); }} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isAuditing ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'}`}>
            {isAuditing ? 'Auditing...' : 'Audit Design'}
          </button>
        </div>
      </header>

      <main className="flex-1 relative flex">
        <Toolbar onAddNode={(type, btu, name) => setNodes([...nodes, { id: Math.random().toString(36).substr(2, 9), type, x: 500, y: 500, btu: btu || 0, name: name || type }])} selectedTool={selectedTool} setSelectedTool={setSelectedTool} selectedPipeSize={selectedPipeSize} setSelectedPipeSize={setSelectedPipeSize} />
        <Canvas nodes={nodes} edges={edges} onUpdateNodes={setNodes} onAddEdge={(f, t) => setEdges([...edges, { id: Math.random().toString(36).substr(2, 9), from: f, to: t, size: selectedPipeSize, length: 10 }])} onDeleteNode={id => { setNodes(nodes.filter(n => n.id !== id)); setEdges(edges.filter(e => e.from !== id && e.to !== id)); }} selectedTool={selectedTool} validation={validation} selectedId={selectedId} onSelect={setSelectedId} />
        
        {aiReport && (
          <div className="fixed inset-0 bg-slate-900/80 z-[100] modal-backdrop flex items-center justify-center p-6" onClick={() => setAiReport(null)}>
            <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black text-slate-900 mb-10">Engineering Audit Report</h2>
              <div className="space-y-10">
                {aiReport.split(/(?=Safety & Compliance Audit|Performance & Optimization)/).filter(s => s.trim()).map((s, i) => (
                  <div key={i}>
                    <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-4">{s.split('\n')[0]}</h3>
                    <div className="space-y-3">
                      {s.split('\n').slice(1).filter(l => l.trim()).slice(0, 5).map((l, j) => (
                        <div key={j} className="flex gap-4 items-start">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div>
                          <p className="text-slate-700 text-sm font-semibold">{l.replace(/^[-*|0-9.]+\s*/, '')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setAiReport(null)} className="mt-12 w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all">Close Report</button>
            </div>
          </div>
        )}
      </main>
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);