
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppNode, AppEdge, NodeType, PipeSize } from './types';
import { PIPE_SPECS, COLORS, DEFAULT_APPLIANCES } from './constants';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { auditSystem } from './services/geminiService';

const TEMPLATE_KEY = 'proflex_draw_templates';
const RECENTS_KEY = 'proflex_draw_recents_index';

interface RecentProject {
  id: string;
  name: string;
  timestamp: number;
  nodeCount: number;
  pipeCount: number;
  data: {
    nodes: AppNode[];
    edges: AppEdge[];
    pressureDrop: number;
  };
}

const App: React.FC = () => {
  // Navigation & Responsiveness
  const [view, setView] = useState<'home' | 'designer'>('home');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Project Data State
  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<AppEdge[]>([]);
  const [pressureDrop, setPressureDrop] = useState<number>(0.5); 
  const [projectName, setProjectName] = useState('New Project');

  // UI State
  const [selectedTool, setSelectedTool] = useState<'pipe' | 'select'>('select');
  const [selectedPipeSize, setSelectedPipeSize] = useState<PipeSize>(PipeSize.HALF);
  const [validation, setValidation] = useState<Record<string, { isValid: boolean; flow: number; capacity: number; error?: string }>>({});
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMobileEdit, setShowMobileEdit] = useState(false); 
  const [showSummary, setShowSummary] = useState(false);
  const [showAddMenuMobile, setShowAddMenuMobile] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  
  // Template & Recents States
  const [templates, setTemplates] = useState<(any | null)[]>(new Array(5).fill(null));
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedNode = nodes.find(n => n.id === selectedId);
  const selectedEdge = edges.find(e => e.id === selectedId);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const storedTemplates = localStorage.getItem(TEMPLATE_KEY);
    if (storedTemplates) {
      try {
        const parsed = JSON.parse(storedTemplates);
        if (Array.isArray(parsed)) setTemplates(parsed);
      } catch (e) { console.error("Templates load failed", e); }
    }
    const storedRecents = localStorage.getItem(RECENTS_KEY);
    if (storedRecents) {
      try {
        const parsed = JSON.parse(storedRecents);
        if (Array.isArray(parsed)) setRecentProjects(parsed);
      } catch (e) { console.error("Recents load failed", e); }
    }
  }, []);

  const calculateCapacity = useCallback((size: PipeSize, length: number): number => {
    const spec = PIPE_SPECS[size];
    if (!spec || length <= 0) return 0;
    const cfh = Math.pow((pressureDrop / length) / spec.coeff, 1 / spec.exp);
    return Math.floor(cfh) * 1000;
  }, [pressureDrop]);

  const validateSystem = useCallback(() => {
    const results: Record<string, { isValid: boolean; flow: number; capacity: number; error?: string }> = {};
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
      let isValid = flow <= capacity;
      results[edge.id] = { isValid, flow, capacity };
    });
    setValidation(results);
  }, [nodes, edges, calculateCapacity]);

  useEffect(() => { validateSystem(); }, [nodes, edges, validateSystem]);

  const handleRunAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    try {
      const report = await auditSystem(nodes, edges);
      setAiReport(report || "No audit report generated.");
    } catch (error) {
      setAiReport("Failed to generate AI audit report.");
    } finally {
      setIsAuditing(false);
    }
  };

  const getSummary = useCallback(() => {
    const pipeTotals: Record<string, number> = {};
    edges.forEach(edge => {
      pipeTotals[edge.size] = (pipeTotals[edge.size] || 0) + edge.length;
    });
    return { pipeTotals };
  }, [edges]);

  const saveToStorage = (id: string, name: string) => {
    const newRecent: RecentProject = {
      id, name, timestamp: Date.now(),
      nodeCount: nodes.length, pipeCount: edges.length,
      data: { nodes, edges, pressureDrop }
    };
    const updatedRecents = [newRecent, ...recentProjects.filter(p => p.id !== id)].slice(0, 15);
    setRecentProjects(updatedRecents);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updatedRecents));
  };

  const handleSave = () => {
    const id = currentProjectId || Math.random().toString(36).substr(2, 9);
    saveToStorage(id, projectName);
    if (!currentProjectId) setCurrentProjectId(id);
    alert('Project saved successfully!');
  };

  const handleSaveAs = (newName: string) => {
    if (!newName.trim()) return;
    const newId = Math.random().toString(36).substr(2, 9);
    setProjectName(newName);
    setCurrentProjectId(newId);
    saveToStorage(newId, newName);
    setShowSaveAsModal(false);
  };

  const handleAddNode = (type: NodeType, btu: number = 0, name?: string) => {
    const newNode: AppNode = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: 500,
      y: 500,
      name: name || (type === NodeType.METER ? 'Gas Meter' : type === NodeType.JUNCTION ? 'T-Junction' : type === NodeType.MANIFOLD ? 'Manifold' : 'Appliance'),
      btu,
      gasType: type === NodeType.METER ? 'Natural' : undefined
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedId(newNode.id);
    if (isMobile) {
      setShowMobileEdit(true); 
    }
    setShowAddMenuMobile(false);
  };

  const updateNode = (id: string, updates: Partial<AppNode>) => setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  const updateEdge = (id: string, updates: Partial<AppEdge>) => setEdges(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  const handleDeleteNode = (id: string) => { setNodes(nodes.filter(n => n.id !== id)); setEdges(edges.filter(e => e.from !== id && e.to !== id)); setSelectedId(null); setShowMobileEdit(false); };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target?.result as string);
        setNodes(d.nodes || []); setEdges(d.edges || []); setProjectName(d.projectName || 'Imported Design'); setView('designer');
      } catch(e) { console.error("Parse Error", e); }
    }; reader.readAsText(file);
  };

  const renderMobileHome = () => (
    <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col items-center p-6 overflow-y-auto pb-20">
      <div className="w-full max-w-lg flex flex-col gap-8 mt-10">
        <header className="text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white font-bold text-3xl shadow-xl mx-auto mb-6">PF</div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">ProFlex Draw</h1>
          <p className="text-slate-500 font-medium text-base mt-2">Gas Piping Designer</p>
        </header>
        <div className="flex flex-col gap-4">
          <button onClick={() => { setNodes([]); setEdges([]); setProjectName('New Project'); setView('designer'); setCurrentProjectId(null); }} className="bg-indigo-600 text-white px-8 py-5 rounded-2xl font-bold text-base shadow-xl hover:bg-indigo-700 transition-all active:scale-95">New Project</button>
          <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-200 text-slate-700 px-6 py-5 rounded-2xl font-bold text-base shadow-sm hover:border-indigo-300 transition-all">Load Design (.proflex)</button>
        </div>
        <section>
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1">Recent Projects</h3>
          <div className="space-y-4">
            {recentProjects.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center opacity-60">
                <p className="text-sm font-bold text-slate-500">No Recent Projects</p>
              </div>
            ) : (
              recentProjects.map(p => (
                <button key={p.id} onClick={() => { setNodes(p.data.nodes); setEdges(p.data.edges); setPressureDrop(p.data.pressureDrop); setProjectName(p.name); setCurrentProjectId(p.id); setView('designer'); }} className="w-full bg-white p-6 rounded-[1.5rem] border border-slate-200 text-left shadow-sm active:bg-slate-50 transition-colors">
                  <h4 className="font-bold text-slate-800 text-lg mb-1">{p.name}</h4>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-400 font-medium">{new Date(p.timestamp).toLocaleDateString()}</p>
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md">{p.pipeCount} Pipes</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );

  const renderDesktopHome = () => (
    <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col items-center p-8 overflow-y-auto">
      <div className="w-full max-w-6xl flex flex-col gap-12 mt-16 mb-20">
        <header className="flex justify-between items-end">
          <div>
            <div className="w-16 h-16 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white font-bold text-3xl shadow-xl shadow-indigo-200 mb-6">PF</div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tighter">ProFlex Draw</h1>
            <p className="text-slate-500 font-medium text-xl mt-3">Professional Gas Piping Designer & Validator</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-200 hover:border-slate-300 text-slate-700 px-8 py-4 rounded-2xl font-bold text-base shadow-sm transition-all flex items-center gap-2">Load Design</button>
            <button onClick={() => { setNodes([]); setEdges([]); setProjectName('New Project'); setView('designer'); setCurrentProjectId(null); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl font-bold text-base shadow-lg shadow-indigo-100 transition-all flex items-center gap-2">Start Design</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-12">
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Recent Projects</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {recentProjects.length === 0 ? (
                  <div className="col-span-2 bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-16 text-center opacity-60">
                    <p className="text-lg font-bold text-slate-500">No recent projects found</p>
                    <p className="text-sm text-slate-400 mt-1">Start a new project to see it here</p>
                  </div>
                ) : (
                  recentProjects.map(p => (
                    <button key={p.id} onClick={() => { setNodes(p.data.nodes); setEdges(p.data.edges); setPressureDrop(p.data.pressureDrop); setProjectName(p.name); setCurrentProjectId(p.id); setView('designer'); }} className="bg-white p-8 rounded-[2rem] border border-slate-200 hover:border-indigo-400 hover:shadow-2xl transition-all text-left group shadow-sm">
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 2v-4m3 2v-4m3 2v-6m0 10h.01M3 21h18a2 2 0 002-2V5a2 2 0 00-2-2H3a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="text-xs font-semibold text-slate-400">{new Date(p.timestamp).toLocaleDateString()}</span>
                      </div>
                      <h4 className="text-xl font-black text-slate-800 mb-3 truncate group-hover:text-indigo-600 transition-colors">{p.name}</h4>
                      <div className="flex gap-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight bg-slate-100 px-2 py-1 rounded-md">{p.nodeCount} Components</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight bg-slate-100 px-2 py-1 rounded-md">{p.pipeCount} Pipes</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="text-2xl font-black mb-4 leading-tight">Safety & Compliance</h3>
              <p className="text-slate-400 text-base leading-relaxed mb-8">System calculations use NFPA 54 / IFGC standards. Ensure all designs are reviewed by a licensed professional.</p>
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 font-bold">1</div>
                  <p className="text-sm font-medium text-slate-300">Maintain minimum clearance from electrical lines and high-heat sources.</p>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 font-bold">2</div>
                  <p className="text-sm font-medium text-slate-300">Account for pressure drop across regulators and manifold systems.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
    </div>
  );

  if (view === 'home') return isMobile ? renderMobileHome() : renderDesktopHome();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50 touch-none">
      <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-3.5 flex justify-between items-center z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={() => setView('home')} className="w-10 h-10 bg-indigo-600 rounded-[0.75rem] flex items-center justify-center text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 shrink-0 active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          </button>
          <div className="relative group max-w-[200px] md:max-w-[400px]">
            <input 
              type="text" 
              value={projectName} 
              onChange={(e) => setProjectName(e.target.value)} 
              className="text-sm md:text-base font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none w-full truncate transition-all" 
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          {!isMobile && (
            <div className="flex items-center gap-2 border-r border-slate-200 pr-4 mr-2">
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors"
              >
                Load
              </button>
              <button 
                onClick={handleSave} 
                className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl font-bold text-sm transition-colors"
              >
                Save
              </button>
              <button 
                onClick={() => { setSaveAsName(`${projectName} Copy`); setShowSaveAsModal(true); }} 
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors"
              >
                Save As
              </button>
            </div>
          )}

          {!isMobile && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSummary(true)} className="bg-slate-100 border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors active:scale-95">Summary</button>
              <button onClick={handleRunAudit} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 active:scale-95">Audit System</button>
            </div>
          )}

          {isMobile && (
             <div className="flex items-center gap-2">
               <button onClick={() => fileInputRef.current?.click()} className="bg-slate-100 text-slate-600 p-2.5 rounded-xl active:scale-90 transition-transform">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4m0 0l-4 4m4-4v12" /></svg>
               </button>
               <button onClick={handleSave} className="bg-indigo-600 text-white p-2.5 rounded-xl active:scale-90 transition-transform">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
               </button>
             </div>
          )}
        </div>
      </header>

      <main className="flex-1 relative flex overflow-hidden">
        {!isMobile && (
          <Toolbar 
            onAddNode={handleAddNode} selectedTool={selectedTool} setSelectedTool={setSelectedTool}
            selectedPipeSize={selectedPipeSize} setSelectedPipeSize={setSelectedPipeSize}
            templates={templates} onLoadTemplate={(t) => { setNodes(t.data.nodes); setEdges(t.data.edges); setPressureDrop(t.data.pressureDrop); setProjectName(t.name); setCurrentProjectId(null); }}
          />
        )}
        
        <Canvas 
          nodes={nodes} edges={edges} pressureDrop={pressureDrop} onUpdateNodes={setNodes}
          onAddEdge={(f, t) => { setEdges([...edges, { id: Math.random().toString(36).substr(2, 9), from: f, to: t, size: selectedPipeSize, length: 10 }]); }}
          onDeleteEdge={(id) => setEdges(edges.filter(e => e.id !== id))}
          onDeleteNode={handleDeleteNode} selectedTool={selectedTool} validation={validation}
          selectedId={selectedId} onSelect={setSelectedId}
          onEdit={(id) => { setSelectedId(id); if (isMobile) setShowMobileEdit(true); }}
          isMobile={isMobile}
        />

        {/* Desktop Sidebar Properties */}
        {!isMobile && selectedId && (selectedNode || selectedEdge) && (
          <div className="absolute top-6 right-6 w-80 bg-white/95 modal-backdrop rounded-[1.75rem] shadow-2xl border border-slate-200 overflow-hidden z-40 animate-in slide-in-from-right duration-300">
             <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] px-2">Configuration</h3>
                <button onClick={() => setSelectedId(null)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors text-xl font-light">×</button>
             </div>
             <div className="p-6 space-y-6">
                {selectedNode && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Label</label>
                      <input type="text" value={selectedNode.name} onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition-all" />
                    </div>
                    {selectedNode.type === NodeType.APPLIANCE && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Consumption (BTU)</label>
                        <input type="number" step="1000" value={selectedNode.btu} onChange={(e) => updateNode(selectedNode.id, { btu: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-mono font-black text-slate-900 focus:bg-white focus:border-indigo-500 outline-none transition-all" />
                      </div>
                    )}
                  </>
                )}
                {selectedEdge && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Length (Feet)</label>
                      <input type="number" min="1" value={selectedEdge.length} onChange={(e) => updateEdge(selectedEdge.id, { length: parseInt(e.target.value) || 1 })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-mono font-black text-slate-900 focus:bg-white focus:border-indigo-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nominal Diameter</label>
                      <select value={selectedEdge.size} onChange={(e) => updateEdge(selectedEdge.id, { size: e.target.value as PipeSize })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition-all">
                        {Object.values(PipeSize).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <button onClick={() => { selectedNode ? handleDeleteNode(selectedId) : setEdges(edges.filter(e => e.id !== selectedId)); setSelectedId(null); }} className="w-full py-3.5 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95">Delete Entry</button>
             </div>
          </div>
        )}

        {/* Mobile Navbar */}
        {isMobile && (
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-white/95 modal-backdrop border-t border-slate-200 flex items-center justify-around z-30 shadow-2xl px-4 shrink-0 pb-safe">
            <button onClick={() => setSelectedTool('select')} className={`flex flex-col items-center gap-1.5 transition-colors ${selectedTool === 'select' ? 'text-indigo-600' : 'text-slate-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Select</span>
            </button>
            <button onClick={() => setSelectedTool('pipe')} className={`flex flex-col items-center gap-1.5 transition-colors ${selectedTool === 'pipe' ? 'text-indigo-600' : 'text-slate-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Pipe</span>
            </button>
            <button onClick={() => setShowAddMenuMobile(true)} className="w-14 h-14 bg-indigo-600 text-white rounded-[1.25rem] flex items-center justify-center -translate-y-6 shadow-2xl shadow-indigo-200 active:scale-90 transition-all border-4 border-slate-50">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
            </button>
            <button onClick={() => setShowSummary(true)} className="flex flex-col items-center gap-1.5 text-slate-400">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4m3 2v-4m3 2v-6m0 10h.01M3 21h18a2 2 0 002-2V5a2 2 0 00-2-2H3a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
               <span className="text-[10px] font-black uppercase tracking-widest">Parts</span>
            </button>
            <button onClick={handleRunAudit} className="flex flex-col items-center gap-1.5 text-slate-400">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
               <span className="text-[10px] font-black uppercase tracking-widest">Audit</span>
            </button>
          </div>
        )}

        {/* Mobile Edit Sheet */}
        {selectedId && (selectedNode || selectedEdge) && isMobile && showMobileEdit && (
          <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-end animate-in fade-in" onClick={() => setShowMobileEdit(false)}>
            <div className="bg-white w-full rounded-t-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8"></div>
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-[0.2em] mb-8 text-center">Modify {selectedNode ? 'Component' : 'Segment'}</h3>
              <div className="space-y-8">
                {selectedNode && (
                  <>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Label Name</label>
                       <input type="text" value={selectedNode.name} onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:bg-white focus:border-indigo-500 transition-all text-lg" />
                    </div>
                    {selectedNode.type === NodeType.APPLIANCE && (
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Consumption (BTU/hr)</label>
                         <input type="number" value={selectedNode.btu} onChange={(e) => updateNode(selectedNode.id, { btu: parseInt(e.target.value) || 0 })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-2xl font-black text-slate-900" />
                      </div>
                    )}
                  </>
                )}
                {selectedEdge && (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Length (ft)</label>
                       <input type="number" value={selectedEdge.length} onChange={(e) => updateEdge(selectedEdge.id, { length: parseInt(e.target.value) || 1 })} className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-black text-slate-900 text-xl" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Size</label>
                       <select value={selectedEdge.size} onChange={(e) => updateEdge(selectedEdge.id, { size: e.target.value as PipeSize })} className="w-full px-4 py-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 text-base appearance-none text-center">
                         {Object.values(PipeSize).map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                    </div>
                  </div>
                )}
                <div className="flex gap-4 pt-4 pb-safe">
                  <button onClick={() => setShowMobileEdit(false)} className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl active:scale-95 transition-all">Apply Changes</button>
                  <button onClick={() => { selectedNode ? handleDeleteNode(selectedId) : setEdges(edges.filter(e => e.id !== selectedId)); setSelectedId(null); setShowMobileEdit(false); }} className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center active:bg-red-600 active:text-white transition-all">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Save As Modal */}
      {showSaveAsModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-6 modal-backdrop" onClick={() => setShowSaveAsModal(false)}>
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="text-2xl font-black mb-2 text-slate-900 tracking-tight">Save Project As</h3>
            <p className="text-slate-500 text-sm mb-8 font-medium">Create a copy of this design with a new name.</p>
            <div className="space-y-6">
              <input 
                autoFocus
                type="text" 
                value={saveAsName} 
                onChange={(e) => setSaveAsName(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all text-lg"
                placeholder="Name your copy..."
              />
              <div className="flex gap-4">
                <button onClick={() => setShowSaveAsModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200">Cancel</button>
                <button onClick={() => handleSaveAs(saveAsName)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100">Save Copy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end md:items-center justify-center p-0 md:p-6 modal-backdrop" onClick={() => setShowSummary(false)}>
          <div className="bg-white w-full max-w-2xl rounded-t-[3rem] md:rounded-[2.5rem] p-10 animate-in slide-in-from-bottom md:zoom-in-95 shadow-2xl duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black uppercase tracking-widest text-slate-900 px-1">Bill of Materials</h2>
              <button onClick={() => setShowSummary(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all text-3xl font-light">×</button>
            </div>
            <div className="space-y-4 mb-10 overflow-y-auto max-h-[50vh] no-scrollbar pr-2">
              {Object.entries(getSummary().pipeTotals).map(([s, l]) => (l as number) > 0 && (
                <div key={s} className="flex justify-between items-center bg-slate-50 p-6 rounded-3xl border border-slate-100 group hover:border-indigo-200 transition-colors">
                  <div>
                    <span className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] block mb-1">Nominal Pipe Size</span>
                    <span className="text-slate-900 font-black text-lg">{s} ProFlex</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] block mb-1">Total Length</span>
                    <span className="text-indigo-600 text-2xl font-black">{l as number} <span className="text-sm font-bold ml-1">FT</span></span>
                  </div>
                </div>
              ))}
              {Object.values(getSummary().pipeTotals).every(l => (l as number) === 0) && (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-[2rem]">
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No materials added yet</p>
                </div>
              )}
            </div>
            <button onClick={() => setShowSummary(false)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.25em] text-xs hover:bg-slate-800 transition-colors shadow-2xl active:scale-[0.98] mt-2">Close Materials List</button>
          </div>
        </div>
      )}

      {/* AI Audit View */}
      {aiReport && (
        <div className="fixed inset-0 bg-slate-900/70 modal-backdrop z-[130] flex items-end md:items-center justify-center p-0 md:p-6" onClick={() => setAiReport(null)}>
           <div className="bg-white w-full max-w-2xl rounded-t-[3rem] md:rounded-[3rem] shadow-2xl p-8 md:p-12 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-500" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6 shrink-0">
                 <div>
                   <h3 className="font-black text-[10px] uppercase tracking-[0.3em] text-indigo-600 mb-1">Intelligent Design Audit</h3>
                   <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Powered by Gemini AI</span>
                 </div>
                 <button onClick={() => setAiReport(null)} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all text-4xl font-light">×</button>
              </div>
              <div className="overflow-y-auto no-scrollbar md:px-2">
                <div className="audit-content text-base text-slate-700 leading-relaxed font-medium">
                  {aiReport.split('\n').map((line, i) => {
                    if (line.trim().startsWith('#') || line.trim().match(/^[0-9]\./)) {
                      return <h2 key={i}>{line.replace(/^[#|0-9|\.]/g, '').trim()}</h2>;
                    }
                    if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
                      return <li key={i} className="ml-4">{line.replace(/^[*|-]/, '').trim()}</li>;
                    }
                    return line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>;
                  })}
                </div>
              </div>
              <button onClick={() => setAiReport(null)} className="mt-10 w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.25em] hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-200 active:scale-[0.98] shrink-0">Understood & Close</button>
           </div>
        </div>
      )}

      {/* Mobile Add Menu */}
      {showAddMenuMobile && isMobile && (
        <div className="fixed inset-0 bg-slate-900/60 z-[110] animate-in fade-in duration-300 modal-backdrop" onClick={() => setShowAddMenuMobile(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-10 shadow-2xl animate-in slide-in-from-bottom duration-500 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
             <div className="w-14 h-1.5 bg-slate-200 rounded-full mx-auto mb-10 shrink-0"></div>
             <h3 className="font-black text-slate-900 uppercase text-xs tracking-[0.25em] mb-8 shrink-0 text-center">Add Design Element</h3>
             <div className="grid grid-cols-3 gap-4 mb-10 shrink-0">
               <button onClick={() => handleAddNode(NodeType.METER)} className="p-4 bg-emerald-50 text-emerald-800 rounded-3xl border border-emerald-100 flex flex-col items-center font-black text-[10px] gap-3 active:scale-95 transition-all shadow-sm">
                 <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                 Meter
               </button>
               <button onClick={() => handleAddNode(NodeType.JUNCTION)} className="p-4 bg-indigo-50 text-indigo-800 rounded-3xl border border-indigo-100 flex flex-col items-center font-black text-[10px] gap-3 active:scale-95 transition-all shadow-sm">
                 <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg></div>
                 Junction
               </button>
               <button onClick={() => handleAddNode(NodeType.MANIFOLD)} className="p-4 bg-cyan-50 text-cyan-800 rounded-3xl border border-cyan-100 flex flex-col items-center font-black text-[10px] gap-3 active:scale-95 transition-all shadow-sm">
                 <div className="w-12 h-12 rounded-2xl bg-cyan-500 flex items-center justify-center text-white shadow-lg shadow-cyan-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
                 Manifold
               </button>
             </div>
             <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 no-scrollbar pb-10">
               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1">Common Appliances</div>
               {DEFAULT_APPLIANCES.map(app => (
                 <button key={app.name} onClick={() => handleAddNode(NodeType.APPLIANCE, app.btu, app.name)} className="w-full p-5 bg-slate-50 rounded-2xl flex justify-between items-center font-black text-slate-800 text-sm border border-slate-100 active:bg-white active:border-indigo-400 active:shadow-lg transition-all">
                   <span>{app.name}</span>
                   <span className="text-indigo-600 font-mono text-xs">{(app.btu/1000).toFixed(0)}k BTU/h</span>
                 </button>
               ))}
             </div>
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" />
    </div>
  );
};

export default App;
