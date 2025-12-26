import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppNode, AppEdge, NodeType, PipeSize } from './types';
import { PIPE_SPECS, COLORS, DEFAULT_APPLIANCES } from './constants';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { auditSystem } from './services/geminiService';

const RECENTS_KEY = 'proflex_draw_recents_v2';

interface RecentProject {
  id: string;
  name: string;
  timestamp: number;
  data: {
    nodes: AppNode[];
    edges: AppEdge[];
  };
}

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'designer'>('home');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<AppEdge[]>([]);
  const [projectName, setProjectName] = useState('New Project');
  const [selectedTool, setSelectedTool] = useState<'pipe' | 'select'>('select');
  const [selectedPipeSize, setSelectedPipeSize] = useState<PipeSize>(PipeSize.HALF);
  const [validation, setValidation] = useState<Record<string, { isValid: boolean; flow: number; capacity: number }>>({});
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMobileEdit, setShowMobileEdit] = useState(false); 
  const [showSummary, setShowSummary] = useState(false);
  const [showAddMenuMobile, setShowAddMenuMobile] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    const storedRecents = localStorage.getItem(RECENTS_KEY);
    if (storedRecents) {
      try { setRecentProjects(JSON.parse(storedRecents)); } catch (e) {}
    }
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const calculateCapacity = useCallback((size: PipeSize, length: number): number => {
    const spec = PIPE_SPECS[size];
    if (!spec || length <= 0) return 0;
    const pressureDrop = 0.5;
    const cfh = Math.pow((pressureDrop / length) / spec.coeff, 1 / spec.exp);
    return Math.floor(cfh) * 1000;
  }, []);

  const validateSystem = useCallback(() => {
    const results: Record<string, { isValid: boolean; flow: number; capacity: number }> = {};
    const getFlow = (edgeId: string): number => {
      const edge = edges.find(e => e.id === edgeId);
      if (!edge) return 0;
      const targetNode = nodes.find(n => n.id === edge.to);
      if (!targetNode) return 0;
      let flow = 0;
      if (targetNode.type === NodeType.APPLIANCE) flow += targetNode.btu;
      edges.filter(e => e.from === targetNode.id).forEach(out => { flow += getFlow(out.id); });
      return flow;
    };
    edges.forEach(edge => {
      const flow = getFlow(edge.id);
      const capacity = calculateCapacity(edge.size, edge.length);
      results[edge.id] = { isValid: flow <= capacity, flow, capacity };
    });
    setValidation(results);
  }, [nodes, edges, calculateCapacity]);

  useEffect(() => { validateSystem(); }, [nodes, edges, validateSystem]);

  const handleRunAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    try {
      const report = await auditSystem(nodes, edges);
      setAiReport(report);
    } catch (e) {
      setAiReport("Safety & Compliance Audit\n- Connection error.\n- Verify API key.\n- Check network.\n- Ensure valid nodes.\n- Please try again.\n\nPerformance & Optimization\n- Insufficient data.\n- Calculation interrupted.\n- Try smaller segments.\n- Link all appliances.\n- Refresh and retry.");
    } finally { setIsAuditing(false); }
  };

  const handleSave = () => {
    const id = currentProjectId || Math.random().toString(36).substr(2, 9);
    const newProject: RecentProject = {
      id, name: projectName, timestamp: Date.now(),
      data: { nodes, edges }
    };
    const updated = [newProject, ...recentProjects.filter(p => p.id !== id)].slice(0, 15);
    setRecentProjects(updated);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
    setCurrentProjectId(id);
    alert('Design Saved');
  };

  const handleSaveAs = (name: string) => {
    if (!name.trim()) return;
    const newId = Math.random().toString(36).substr(2, 9);
    setProjectName(name);
    setCurrentProjectId(newId);
    handleSave();
    setShowSaveAsModal(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target?.result as string);
        setNodes(d.nodes || []); setEdges(d.edges || []); setProjectName(d.projectName || 'Imported Design'); setView('designer');
      } catch(e) { alert("Invalid .proflex file"); }
    }; reader.readAsText(file);
  };

  const handleAddNode = (type: NodeType, btu: number = 0, name?: string) => {
    const newNode: AppNode = {
      id: Math.random().toString(36).substr(2, 9),
      type, x: 500, y: 500, btu,
      name: name || (type === NodeType.METER ? 'Gas Meter' : type === NodeType.JUNCTION ? 'T-Junction' : type === NodeType.MANIFOLD ? 'Manifold' : 'Appliance'),
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedId(newNode.id);
    if (isMobile) setShowMobileEdit(true);
    setShowAddMenuMobile(false);
  };

  if (view === 'home') {
    return (
      <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center space-y-12">
        <header>
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white font-black text-4xl shadow-2xl mx-auto mb-8 animate-pulse">PF</div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter">ProFlex Draw</h1>
          <p className="text-slate-500 font-medium text-lg mt-4">Professional Gas Piping Designer</p>
        </header>
        <div className="w-full max-w-sm flex flex-col gap-4">
          <button onClick={() => { setNodes([]); setEdges([]); setProjectName('New Project'); setView('designer'); }} className="bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-indigo-700 transition-all">New Project</button>
          <button onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-slate-200 text-slate-600 py-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:border-indigo-400 hover:text-indigo-600 transition-all">Load Design</button>
        </div>
        {recentProjects.length > 0 && (
          <div className="w-full max-w-sm text-left">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Recent Local Projects</h3>
            <div className="space-y-2">
              {recentProjects.map(p => (
                <button key={p.id} onClick={() => { setNodes(p.data.nodes); setEdges(p.data.edges); setProjectName(p.name); setCurrentProjectId(p.id); setView('designer'); }} className="w-full flex justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-500 transition-colors">
                  <span className="font-bold text-slate-800">{p.name}</span>
                  <span className="text-[10px] text-slate-400">{new Date(p.timestamp).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-30 shadow-sm shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={() => setView('home')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="font-black text-slate-900 bg-transparent border-none outline-none text-lg md:text-xl w-48 md:w-96 focus:text-indigo-600 transition-colors" />
        </div>
        
        <div className="flex items-center gap-2">
          {!isMobile && (
            <div className="flex items-center gap-2 border-r border-slate-200 pr-4 mr-2">
              <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-slate-500 font-bold text-sm hover:text-slate-900 transition-colors">Load</button>
              <button onClick={handleSave} className="px-4 py-2 text-indigo-600 font-bold text-sm hover:text-indigo-700 transition-colors">Save</button>
              <button onClick={() => { setSaveAsName(`${projectName} Copy`); setShowSaveAsModal(true); }} className="px-4 py-2 text-slate-400 font-bold text-sm hover:text-slate-900 transition-colors">Save As</button>
            </div>
          )}
          <button onClick={() => setShowSummary(true)} className="hidden md:block px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors">Parts</button>
          <button onClick={handleRunAudit} className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${isAuditing ? 'bg-slate-200 text-slate-400 cursor-wait' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg active:scale-95'}`}>
            {isAuditing ? 'Auditing...' : 'Audit System'}
          </button>
        </div>
      </header>

      <main className="flex-1 relative flex overflow-hidden">
        {!isMobile && (
          <Toolbar 
            onAddNode={handleAddNode} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
            selectedPipeSize={selectedPipeSize} setSelectedPipeSize={setSelectedPipeSize}
            templates={[]} onLoadTemplate={() => {}}
          />
        )}
        
        <Canvas 
          nodes={nodes} edges={edges} pressureDrop={0.5} onUpdateNodes={setNodes}
          onAddEdge={(f, t) => setEdges([...edges, { id: Math.random().toString(36).substr(2, 9), from: f, to: t, size: selectedPipeSize, length: 10 }])}
          onDeleteEdge={(id) => setEdges(edges.filter(e => e.id !== id))}
          onDeleteNode={(id) => { setNodes(nodes.filter(n => n.id !== id)); setEdges(edges.filter(e => e.from !== id && e.to !== id)); }}
          selectedTool={selectedTool} validation={validation} selectedId={selectedId} onSelect={setSelectedId}
          onEdit={(id) => { setSelectedId(id); if (isMobile) setShowMobileEdit(true); }} isMobile={isMobile}
        />

        {/* Audit Report Modal */}
        {aiReport && (
          <div className="fixed inset-0 bg-slate-900/80 z-[100] modal-backdrop flex items-center justify-center p-6" onClick={() => setAiReport(null)}>
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">System Audit Results</h2>
                <button onClick={() => setAiReport(null)} className="text-3xl font-light text-slate-300 hover:text-slate-900 transition-colors">×</button>
              </div>
              <div className="overflow-y-auto pr-2 no-scrollbar space-y-12">
                {aiReport.split(/(?=Safety & Compliance Audit|Performance & Optimization)/).filter(s => s.trim()).map((section, idx) => {
                  const lines = section.trim().split('\n');
                  const title = lines[0];
                  const bullets = lines.slice(1).filter(l => l.trim()).slice(0, 5); // Ensure max 5 bullets
                  return (
                    <div key={idx} className="space-y-6">
                      <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] border-b border-indigo-50 pb-2">{title}</h3>
                      <div className="space-y-4">
                        {bullets.map((b, i) => (
                          <div key={i} className="flex gap-4 items-start">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"></div>
                            <p className="text-slate-700 text-sm font-semibold leading-relaxed">{b.replace(/^[-*|0-9.]+\s*/, '')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setAiReport(null)} className="mt-12 py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-[0.3em] active:scale-95 transition-all">Close Audit</button>
            </div>
          </div>
        )}

        {/* Save As Modal */}
        {showSaveAsModal && (
          <div className="fixed inset-0 bg-slate-900/60 z-[110] flex items-center justify-center p-6 modal-backdrop" onClick={() => setShowSaveAsModal(false)}>
            <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-black mb-2 text-slate-900">Save Copy As</h3>
              <p className="text-slate-500 text-sm mb-8">Enter a new name for this project version.</p>
              <input autoFocus type="text" value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-slate-900 text-lg mb-8 outline-none focus:border-indigo-500 transition-all" />
              <div className="flex gap-4">
                <button onClick={() => setShowSaveAsModal(false)} className="flex-1 py-4 font-bold text-slate-400 uppercase tracking-widest text-xs">Cancel</button>
                <button onClick={() => handleSaveAs(saveAsName)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Toolbar */}
        {isMobile && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-white border-t border-slate-200 flex items-center justify-around z-40 px-6 pb-safe shadow-2xl">
             <button onClick={() => setSelectedTool('select')} className={`flex flex-col items-center gap-1 ${selectedTool === 'select' ? 'text-indigo-600' : 'text-slate-300'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
                <span className="text-[9px] font-black uppercase tracking-tighter">Edit</span>
             </button>
             <button onClick={() => setShowAddMenuMobile(true)} className="w-16 h-16 bg-indigo-600 text-white rounded-3xl flex items-center justify-center -translate-y-8 shadow-2xl shadow-indigo-200 border-4 border-white active:scale-90 transition-all">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
             </button>
             <button onClick={() => setSelectedTool('pipe')} className={`flex flex-col items-center gap-1 ${selectedTool === 'pipe' ? 'text-indigo-600' : 'text-slate-300'}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg>
                <span className="text-[9px] font-black uppercase tracking-tighter">Pipe</span>
             </button>
          </div>
        )}
      </main>
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
    </div>
  );
};

export default App;