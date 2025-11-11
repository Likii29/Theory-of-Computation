import React, { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";

const API = "http://127.0.0.1:5000/convert";

export default function App() {
  const cyRef = useRef(null);
  const containerRef = useRef(null);
  const [regex, setRegex] = useState("(a|b)*a");
  const [dfa, setDfa] = useState(null);
  const [test, setTest] = useState("");
  const [speed, setSpeed] = useState(600);
  const [status, setStatus] = useState("Idle");
  const [postfixExpr, setPostfixExpr] = useState("");

  async function convert() {
    setStatus("Converting...");
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regex }),
      });
      const data = await res.json();
      if (!data.success) {
        setStatus("Error: " + data.error);
        return;
      }
      setDfa(data.dfa_json);
      setPostfixExpr(data.postfix);
      setStatus("✅ Converted: " + data.postfix);
    } catch (err) {
      setStatus("Error: backend unreachable");
    }
  }

  useEffect(() => {
    if (!dfa || !containerRef.current) return;

    if (cyRef.current) {
      try { cyRef.current.destroy(); } catch (e) {}
      cyRef.current = null;
    }

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        { selector: "node", style: { "background-color": "#e0e7ef", label: "data(label)", color: "#222", "text-valign": "center", "text-halign": "center", "font-size": 16, width: 72, height: 72, "border-width": 2, "border-color": "#b0b8c1" } },
        { selector: ".accept", style: { "background-color": "#b6f5d8", "border-width": 4, "border-color": "#4ade80", "outline-width": 3, "outline-color": "#4ade80", "outline-offset": 4 } },
        { selector: "edge", style: { width: 3, "line-color": "#9aa6b0", "target-arrow-color": "#9aa6b0", "target-arrow-shape": "triangle", "curve-style": "unbundled-bezier", label: "data(label)", "font-size": 13, "text-background-color": "#fff", "text-background-opacity": 0.9, "text-background-padding": 4, color: "#222", "control-point-distance": "data(controlPointDistance)", "control-point-step-size": "data(controlPointStep)" } },
        { selector: "edge[source = target]", style: { width: 6, "line-color": "#22c55e", "target-arrow-color": "#22c55e", "target-arrow-shape": "triangle", "curve-style": "unbundled-bezier", "control-point-step-size": 80, "control-point-distance": 80, label: "data(label)", "font-size": 14, "font-weight": "bold", "text-background-color": "#fff", "text-background-opacity": 1, "text-background-padding": 6, color: "#222", "z-index": 10 } },
        { selector: "node.active", style: { "background-color": "#f59e0b", "border-width": 4, "border-color": "#d97706" } },
        { selector: "edge.active", style: { "line-color": "#dc2626", "target-arrow-color": "#dc2626", width: 5, "z-index": 11 } },
      ],
    });

    const elements = [];
    const containerWidth = containerRef.current.clientWidth || 1000;
    const containerHeight = containerRef.current.clientHeight || 600;
    const nodeCount = dfa.states.length;

    const SMALL_DFA_MAX = 18;
    const useLine = nodeCount <= SMALL_DFA_MAX;

    if (useLine) {
      const minGap = 120;
      let gap = Math.max(minGap, Math.floor(containerWidth / (Math.max(1, nodeCount) + 1)));
      const sidePadding = 160;
      if (gap * (Math.max(0, nodeCount - 1)) + sidePadding > containerWidth) {
        gap = Math.max(80, Math.floor((containerWidth - sidePadding) / Math.max(1, nodeCount - 1)));
      }
      const totalWidth = gap * (Math.max(0, nodeCount - 1));
      const startX = Math.max(40, Math.floor((containerWidth - totalWidth) / 2));
      const centerY = Math.floor(containerHeight / 2);

      dfa.states.forEach((s, i) => {
        elements.push({ data: { id: s, label: s }, classes: dfa.accepting.includes(s) ? "accept" : "", position: { x: startX + i * gap, y: centerY } });
      });
    } else {
      dfa.states.forEach((s) => elements.push({ data: { id: s, label: s }, classes: dfa.accepting.includes(s) ? "accept" : "" }));
    }

    // compute bulges for outgoing edges from same source
    const outMap = {};
    dfa.transitions.forEach((t) => { if (t.from !== t.to) { outMap[t.from] = outMap[t.from] || []; outMap[t.from].push(t); } });
    Object.values(outMap).forEach((list) => {
      list.sort((a,b) => (a.to > b.to ? 1 : a.to < b.to ? -1 : 0));
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const band = Math.floor(i / 2);
        const base = 80 + band * 50; // primary bulge
        const step = 38 + band * 10;
        const sign = i % 2 === 0 ? 1 : -1;
        t.controlPointDistance = sign * base;
        t.controlPointStep = step;
      }
    });

    dfa.transitions.forEach((t) => {
      const data = { id: t.id, source: t.from, target: t.to, label: t.symbol };
      if (t.from !== t.to && t.controlPointDistance !== undefined) {
        data.controlPointDistance = t.controlPointDistance;
        data.controlPointStep = t.controlPointStep;
      }
      elements.push({ data });
    });

    cy.add(elements);

    if (useLine) {
      cy.layout({ name: "preset" }).run();
      setTimeout(() => cy.fit(40), 50);
    } else {
      const layoutOptions = { name: "cose", animate: true, animationDuration: 700, nodeRepulsion: 22000, idealEdgeLength: 260, edgeElasticity: 0.2, nestingFactor: 1.2, gravity: 0.3, numIter: 3000, padding: 80 };
      cy.layout(layoutOptions).run();
      setTimeout(() => cy.fit(60), 80);
    }

    cyRef.current = cy;

    return () => { if (cyRef.current) { try { cyRef.current.destroy(); } catch (e) {} cyRef.current = null; } };
  }, [dfa]);

  async function simulate() {
    if (!dfa) { setStatus("❗ Convert a regex first."); return; }
    const cy = cyRef.current; if (!cy) return;
    const edges = {};
    for (let t of dfa.transitions) { edges[t.from] = edges[t.from] || {}; edges[t.from][t.symbol] = t; }

    let cur = dfa.start;
    cy.elements().removeClass("active");
    cy.$id(cur).addClass("active");

    for (let i = 0; i < test.length; i++) {
      const sym = test[i];
      const trans = edges[cur]?.[sym];
      if (!trans) { setStatus(`❌ Rejected: no transition from ${cur} on '${sym}'`); return; }
      cy.$id(trans.id).addClass("active");
      cy.$id(trans.to).addClass("active");
      cur = trans.to;
      await new Promise((r) => setTimeout(r, speed));
    }

    if (dfa.accepting.includes(cur)) setStatus(`✅ Accepted (ended in ${cur})`);
    else setStatus(`❌ Rejected (ended in ${cur})`);
  }

  function minimizeDFA() {
    if (!dfa) return;

    // Build transition map and alphabet
    const states = Array.from(dfa.states);
    const acceptingSet = new Set(dfa.accepting);
    const trans = {}; // trans[state][symbol] = to
    const alphabet = new Set();

    states.forEach((s) => (trans[s] = {}));
    dfa.transitions.forEach((t) => {
      trans[t.from] = trans[t.from] || {};
      trans[t.from][t.symbol] = t.to;
      alphabet.add(t.symbol);
    });

    // If the DFA is not complete, add a dead state that loops to itself
    const deadState = "__dead__";
    let hasDead = false;
    states.forEach((s) => {
      alphabet.forEach((sym) => {
        if (!Object.prototype.hasOwnProperty.call(trans[s], sym)) {
          trans[s][sym] = deadState;
          hasDead = true;
        }
      });
    });

    if (hasDead) {
      trans[deadState] = {};
      alphabet.forEach((sym) => (trans[deadState][sym] = deadState));
      if (!states.includes(deadState)) states.push(deadState);
    }

    // Hopcroft's algorithm
    const Sigma = Array.from(alphabet);
    const F = new Set(dfa.accepting);
    const NF = new Set(states.filter((s) => !F.has(s)));

    // Initial partition
    let P = [];
    if (F.size > 0) P.push(new Set(F));
    if (NF.size > 0) P.push(new Set(NF));

    // Worklist
    let W = P.slice();

    while (W.length > 0) {
      const A = W.pop();
      for (const c of Sigma) {
        // X = { q | delta(q,c) in A }
        const X = new Set();
        for (const q of states) {
          const to = trans[q] && trans[q][c];
          if (to && A.has(to)) X.add(q);
        }

        const newP = [];
        for (const Y of P) {
          // intersect = X ∩ Y; difference = Y \ X
          const inter = new Set([...Y].filter((x) => X.has(x)));
          const diff = new Set([...Y].filter((x) => !X.has(x)));
          if (inter.size > 0 && diff.size > 0) {
            newP.push(inter);
            newP.push(diff);

            // replace Y in W appropriately
            const idx = W.findIndex((s) => s === Y);
            if (idx !== -1) {
              // replace Y with both
              W.splice(idx, 1, inter, diff);
            } else {
              // add smaller one
              W.push(inter.size <= diff.size ? inter : diff);
            }
          } else {
            newP.push(Y);
          }
        }
        P = newP;
      }
    }

    // Build mapping from state -> representative partition id
    const partMap = new Map();
    P.forEach((set, idx) => {
      for (const s of set) partMap.set(s, idx);
    });

    // Construct minimized DFA
    const minStates = P.map((set, i) => "S" + i);
    const minAccepting = [];
    const minTransitions = [];
    let minStart = partMap.get(dfa.start);
    if (minStart === undefined) minStart = partMap.get(deadState);

    P.forEach((set, i) => {
      for (const s of set) {
        if (acceptingSet.has(s)) {
          minAccepting.push("S" + i);
          break;
        }
      }
    });

    // For each partition and each symbol, add transition to partition of delta(rep, sym)
    let tid = 0;
    P.forEach((set, i) => {
      // pick any representative
      const rep = [...set][0];
      Sigma.forEach((sym) => {
        const to = trans[rep] && trans[rep][sym];
        if (to !== undefined) {
          const toPart = partMap.get(to);
          if (toPart !== undefined) {
            minTransitions.push({ id: `t${tid++}`, from: "S" + i, to: "S" + toPart, symbol: sym });
          }
        }
      });
    });

    const minimizedDfa = {
      states: minStates,
      transitions: minTransitions,
      accepting: [...new Set(minAccepting)],
      start: "S" + minStart,
    };

    // Optional: remove unreachable states from minimized DFA
    const reachable2 = new Set();
    const q2 = [minimizedDfa.start];
    reachable2.add(minimizedDfa.start);
    while (q2.length) {
      const cur = q2.shift();
      minimizedDfa.transitions.forEach((t) => {
        if (t.from === cur && !reachable2.has(t.to)) {
          reachable2.add(t.to);
          q2.push(t.to);
        }
      });
    }

    minimizedDfa.states = minimizedDfa.states.filter((s) => reachable2.has(s));
    minimizedDfa.transitions = minimizedDfa.transitions.filter((t) => reachable2.has(t.from) && reachable2.has(t.to));
    minimizedDfa.accepting = minimizedDfa.accepting.filter((s) => reachable2.has(s));

    setDfa(minimizedDfa);
    setStatus(`✅ Minimized: ${dfa.states.length} → ${minimizedDfa.states.length} states`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#f3f6fa] to-[#e6ecf3] text-gray-900 p-6">
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex justify-between items-center gap-4 mb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent flex-1">Regular Expression to DFA Live Visualizer</h1>
          <div className="relative group">
            <button className="px-4 py-2 bg-blue-400 text-white rounded-md font-semibold hover:bg-blue-500 transition">ℹ️ Tips</button>
            <div className="absolute right-0 top-12 w-80 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <h3 className="font-bold text-gray-900 mb-2">Features & Tips:</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>✓ Small DFAs are shown in a straight line automatically</li>
                <li>✓ Outgoing transitions bulge apart for clarity</li>
                <li>✓ Green double-circle indicates accepting states</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input className="flex-1 bg-[#f3f6fa] text-gray-900 p-3 rounded-md border border-gray-200" placeholder="Enter regex pattern..." value={regex} onChange={(e) => setRegex(e.target.value)} />
          <button onClick={convert} className="bg-gradient-to-r from-green-400 to-blue-400 px-5 py-3 rounded-md text-white font-semibold hover:shadow-lg transition">Convert</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="w-full bg-white p-4 rounded-xl shadow-lg border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-green-500 font-semibold">DFA Graph</h2>
            <button onClick={minimizeDFA} className="px-3 py-1 bg-orange-400 text-white text-sm rounded hover:bg-orange-500 transition">🔧 Minimize DFA</button>
          </div>
          <div ref={containerRef} style={{ width: "100%", height: "600px", borderRadius: "10px", background: "#f3f6fa", border: "1px solid #e0e7ef" }}></div>
        </div>

        <div className="flex gap-6">
          <div className="flex-1 bg-white p-4 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-green-500 font-semibold mb-3">Regex Parsing</h2>
            {postfixExpr ? (
              <div className="space-y-2 text-sm">
                <div><p className="font-semibold text-gray-900">Original:</p><p className="text-gray-700 font-mono bg-gray-50 p-2 rounded">{regex}</p></div>
                <div><p className="font-semibold text-gray-900">Postfix Notation:</p><p className="text-gray-700 font-mono bg-gray-50 p-2 rounded">{postfixExpr}</p></div>
              </div>
            ) : (<p className="text-gray-500 text-sm">Convert a regex to see parsing</p>)}
          </div>

          <div className="flex-1 bg-white p-4 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-green-500 font-semibold mb-3">Performance Stats</h2>
            {dfa ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p><span className="font-semibold">States:</span> {dfa.states.length}</p>
                <p><span className="font-semibold">Transitions:</span> {dfa.transitions.length}</p>
                <p><span className="font-semibold">Accept States:</span> {dfa.accepting.length}</p>
                <p><span className="font-semibold">Start State:</span> {dfa.start}</p>
                <p><span className="font-semibold">Density:</span> {(dfa.transitions.length / (dfa.states.length * dfa.states.length)).toFixed(2)}</p>
              </div>
            ) : (<p className="text-gray-500">Convert a regex to see stats</p>)}
          </div>

          <div className="w-80 bg-white p-4 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-green-500 font-semibold mb-3">Simulation</h2>
            <input className="w-full bg-[#f3f6fa] text-gray-900 p-3 rounded-md mb-3 border border-gray-200" placeholder="Enter test string..." value={test} onChange={(e) => setTest(e.target.value)} />
            <div className="text-gray-500 text-sm mb-2">Simulation Speed: {speed}ms</div>
            <input type="range" min="200" max="1500" step="100" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-green-400" />
            <button onClick={simulate} className="mt-4 w-full py-2 bg-green-400 text-white font-semibold rounded-md hover:bg-green-300 transition">▶ Run Simulation</button>
            <div className="mt-4 text-gray-600 text-sm">Status: {status}</div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Legend</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-center gap-3"><div className="w-16 h-16 rounded-full bg-[#e0e7ef] border-2 border-[#b0b8c1]"></div><div><p className="font-semibold text-gray-900">Regular State</p><p className="text-sm text-gray-600">Normal node</p></div></div>
          <div className="flex items-center gap-3"><div className="w-16 h-16 rounded-full bg-[#b6f5d8] border-4 border-[#4ade80]" style={{ outline: '3px solid #4ade80', outlineOffset: '4px' }}></div><div><p className="font-semibold text-gray-900">Accepting State</p><p className="text-sm text-gray-600">Final/accept node</p></div></div>
          <div className="flex items-center gap-3"><div className="w-16 h-16 rounded-full bg-[#f59e0b] border-4 border-[#d97706]"></div><div><p className="font-semibold text-gray-900">Active State</p><p className="text-sm text-gray-600">Current state</p></div></div>
          <div className="flex items-center gap-3"><div className="h-1 w-12 bg-[#dc2626]" style={{ position: 'relative' }}><div style={{ position: 'absolute', right: '-4px', top: '-6px', width: '0', height: '0', borderLeft: '6px solid transparent', borderRight: '0', borderTop: '8px solid #dc2626' }}></div></div><div><p className="font-semibold text-gray-900">Active Edge</p><p className="text-sm text-gray-600">Current transition</p></div></div>
        </div>
      </div>
    </div>
  );
}
