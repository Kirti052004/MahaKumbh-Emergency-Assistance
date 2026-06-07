'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getLiveIncidents, updateIncidentStatus } from '../actions/triage'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
)

// Helper to decode JSON-metadata from incidents
function clientDecode(item: any) {
  if (!item) return null;
  try {
    const parsed = JSON.parse(item.description);
    if (parsed && typeof parsed === 'object' && 'text' in parsed) {
      return {
        ...item,
        raw_description: parsed.text,
        status: parsed.status || 'Pending',
        assigned_resource: parsed.assigned_resource || null,
        dispatcher_notes: parsed.dispatcher_notes || '',
        resolved_at: parsed.resolved_at || null,
        recommended_unit: parsed.recommended_unit || 'Ambulance 1',
        survival_instructions: parsed.survival_instructions || 'Please stay calm. Responders are being dispatched.'
      };
    }
  } catch (e) {
    // Normal text
  }
  return {
    ...item,
    raw_description: item.description,
    status: 'Pending',
    assigned_resource: null,
    dispatcher_notes: '',
    resolved_at: null,
    recommended_unit: item.category === 'Fire' ? 'Fire Engine 1' : item.category === 'Security' ? 'Police Cruiser 1' : 'Ambulance 1',
    survival_instructions: 'Please stay calm. Responders are being dispatched.'
  };
}

// Initial Emergency Services resources (Patrol officers / Medical responders in Kumbh)
const BASE_RESOURCES = [
  { id: 'amb1', name: 'Ambulance 1 (Sector 3)', type: 'Medical', base: { x: 60, y: 70 } },
  { id: 'amb2', name: 'Ambulance 2 (Sector 5)', type: 'Medical', base: { x: 70, y: 110 } },
  { id: 'amb3', name: 'Medical Team 3 (Sangam)', type: 'Medical', base: { x: 50, y: 140 } },
  { id: 'eng1', name: 'Fire Engine 1 (Camp A)', type: 'Fire', base: { x: 440, y: 270 } },
  { id: 'eng2', name: 'Fire Rescue 2 (Camp B)', type: 'Fire', base: { x: 420, y: 310 } },
  { id: 'cru1', name: 'Police Patrol 1 (Sector 2)', type: 'Security', base: { x: 230, y: 40 } },
  { id: 'cru2', name: 'Police Patrol 2 (Sector 4)', type: 'Security', base: { x: 260, y: 55 } },
  { id: 'cru3', name: 'Ghat Security 3 (Sangam)', type: 'Security', base: { x: 240, y: 95 } },
  { id: 'haz1', name: 'Disaster Squad 1', type: 'HAZMAT', base: { x: 90, y: 280 } },
  { id: 'res1', name: 'Sangam Boat Rescue 1', type: 'Infrastructure', base: { x: 130, y: 300 } },
]

export default function CommandCenter() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('All')
  const [filterCategory, setFilterCategory] = useState('All')
  
  // Dashboard inputs
  const [dispatcherNotes, setDispatcherNotes] = useState('')
  const [alertText, setAlertText] = useState('')
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [commandStatus, setCommandStatus] = useState('')

  // Map settings: convert Prayagraj GPS bounds into local SVG coordinate space (500x350)
  const getMapCoords = (lat: number, lng: number) => {
    // Sector-9 Prayagraj Sangam bounding box mapping
    const centerLat = 25.4300
    const centerLng = 81.8900
    
    // Scale delta coordinates
    let dx = (lng - centerLng) * 2800 + 250
    let dy = -(lat - centerLat) * 2800 + 175

    if (lat === 0 && lng === 0) {
      return { x: 250, y: 175, isAlert: true }
    }

    return {
      x: Math.max(30, Math.min(470, dx)),
      y: Math.max(30, Math.min(320, dy)),
      isAlert: false
    }
  }

  // Load incidents and subscribe
  useEffect(() => {
    getLiveIncidents().then((res) => {
      if (res.success && res.incidents) {
        setIncidents(res.incidents)
        const active = res.incidents.find(x => x.status !== 'Resolved' && x.category !== 'SystemAlert')
        if (active) {
          setSelectedIncident(active)
          setDispatcherNotes(active.dispatcher_notes || '')
        }
      }
    })

    const channel = supabase
      .channel('kumbh-command-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (payload) => {
        const itemDecoded = clientDecode(payload.new)
        
        if (payload.eventType === 'INSERT') {
          setIncidents(prev => [itemDecoded, ...prev])
          if (itemDecoded.category !== 'SystemAlert') {
            setSelectedIncident(itemDecoded)
            setDispatcherNotes(itemDecoded.dispatcher_notes || '')
          }
        } 
        else if (payload.eventType === 'UPDATE') {
          setIncidents(prev => prev.map(x => x.id === itemDecoded.id ? itemDecoded : x))
          setSelectedIncident((curr: any) => curr && curr.id === itemDecoded.id ? itemDecoded : curr)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Derived resource coordinate locations
  const getResourcesState = () => {
    return BASE_RESOURCES.map(res => {
      const activeIncident = incidents.find(inc => 
        inc.status === 'Dispatched' && 
        inc.assigned_resource === res.name &&
        inc.category !== 'SystemAlert'
      )

      if (activeIncident) {
        const coords = getMapCoords(activeIncident.latitude, activeIncident.longitude)
        return {
          ...res,
          status: 'Dispatched',
          coords: { x: coords.x, y: coords.y },
          assignedIncidentId: activeIncident.id
        }
      }
      return {
        ...res,
        status: 'Available',
        coords: res.base,
        assignedIncidentId: null
      }
    })
  }

  const activeResources = getResourcesState()

  // Filtering
  const filteredIncidents = incidents.filter(inc => {
    if (inc.category === 'SystemAlert' && filterCategory !== 'SystemAlert') {
      return false
    }
    if (filterCategory !== 'SystemAlert' && inc.category === 'SystemAlert') {
      return false
    }

    const matchesSearch = inc.raw_description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inc.category.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesSeverity = filterSeverity === 'All' || inc.severity === filterSeverity
    const matchesCategory = filterCategory === 'All' || inc.category === filterCategory || (filterCategory === 'SystemAlert' && inc.category === 'SystemAlert')

    return matchesSearch && matchesSeverity && matchesCategory
  })

  // Dispatch Action
  const handleDispatch = async (resourceName: string) => {
    if (!selectedIncident) return
    setCommandStatus(`Assigning ${resourceName}...`)

    const res = await updateIncidentStatus(
      selectedIncident.id,
      'Dispatched',
      resourceName,
      dispatcherNotes
    )

    if (res.success && res.incident) {
      setCommandStatus(`Assigned successfully!`)
      setSelectedIncident(res.incident)
    } else {
      setCommandStatus(`Assignment failed: ${res.error}`)
    }
    setTimeout(() => setCommandStatus(''), 3000)
  }

  // Resolve Action
  const handleResolve = async () => {
    if (!selectedIncident) return
    setCommandStatus('Resolving complaint...')

    const res = await updateIncidentStatus(
      selectedIncident.id,
      'Resolved',
      null,
      dispatcherNotes
    )

    if (res.success && res.incident) {
      setCommandStatus('Complaint marked Resolved.')
      setSelectedIncident(res.incident)
    } else {
      setCommandStatus(`Resolution failed: ${res.error}`)
    }
    setTimeout(() => setCommandStatus(''), 3000)
  }

  // Warning Broadcast
  const handleBroadcastAlert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!alertText.trim()) return

    setIsBroadcasting(true)
    const alertPayload = JSON.stringify({
      text: alertText,
      status: 'Active',
      assigned_resource: null,
      dispatcher_notes: 'Kumbh Public Address Broadcast',
      resolved_at: null,
      recommended_unit: 'All Sector patrollers',
      survival_instructions: 'Pilgrims are advised to follow directions of nearby safety officers.'
    })

    const { error } = await supabase.from('incidents').insert([{
      description: alertPayload,
      category: 'SystemAlert',
      severity: 'Critical',
      latitude: 0,
      longitude: 0
    }])

    if (error) {
      setCommandStatus(`Alert failed: ${error.message}`)
    } else {
      setCommandStatus('Public announcement broadcasted!')
      setAlertText('')
    }
    setIsBroadcasting(false)
    setTimeout(() => setCommandStatus(''), 3000)
  }

  // Count metrics
  const statsActive = incidents.filter(x => x.status !== 'Resolved' && x.category !== 'SystemAlert').length
  const statsCritical = incidents.filter(x => x.severity === 'Critical' && x.status !== 'Resolved' && x.category !== 'SystemAlert').length
  const statsDispatched = activeResources.filter(x => x.status === 'Dispatched').length
  const statsAlerts = incidents.filter(x => x.category === 'SystemAlert').length

  return (
    <main className="min-h-screen bg-[#fdfcf7] text-[#292524] flex flex-col p-4 md:p-6 font-sans holy-waves">
      
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#e7e3d4] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
            <h1 className="text-lg font-black tracking-wide text-slate-800 font-sans uppercase">
              महाकुंभ मुख्य नियंत्रण कक्ष (Mahakumbh Command Center)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Sangam Prayagraj Operational Area • Realtime Satellite Telemetry Control
          </p>
        </div>

        {/* System telemetry clock */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-sky-700 bg-sky-50 border border-sky-200 px-3 py-1 rounded-full font-sans font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
            ACTIVE RADAR LINK
          </span>
          <span className="text-slate-600 border border-[#e7e3d4] px-3 py-1 rounded-full bg-white font-sans font-semibold">
            {new Date().toLocaleDateString()}
          </span>
        </div>
      </header>

      {/* KPI Stats widgets */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass-panel p-4 rounded-xl border-l-4 border-l-orange-500 shadow-sm">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-sans">Active Complaints / सक्रिय शिकायतें</h3>
          <p className="text-2xl font-black mt-1 text-slate-800">{statsActive}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border-l-4 border-l-red-500 shadow-sm">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-sans">Critical Cases / गंभीर मामले</h3>
          <p className="text-2xl font-black mt-1 text-red-600">{statsCritical}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border-l-4 border-l-sky-500 shadow-sm">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-sans">Assigned Officers / तैनात कर्मी</h3>
          <p className="text-2xl font-black mt-1 text-sky-600">{statsDispatched}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl border-l-4 border-l-yellow-500 shadow-sm">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-sans">Announcements / घोषणाएं</h3>
          <p className="text-2xl font-black mt-1 text-yellow-600">{statsAlerts}</p>
        </div>
      </section>

      {/* Grid Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
        
        {/* LEFT COLUMN: Complaint Feed (4/12 grid) */}
        <div className="lg:col-span-4 flex flex-col bg-white border border-[#e7e3d4]/70 rounded-2xl p-4 overflow-hidden shadow-sm max-h-[700px]">
          <h2 className="text-xs font-bold font-sans tracking-wide text-slate-500 uppercase mb-3 flex items-center justify-between">
            <span>Pilgrim Complaint Queue (शिकायत सूची)</span>
            <span className="bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] text-slate-650 font-bold">{filteredIncidents.length} Active</span>
          </h2>

          <input 
            type="text" 
            placeholder="Search complaint details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#fafaf8] border border-slate-200 p-2.5 rounded-xl text-xs focus:outline-none focus:border-orange-500 placeholder-slate-400 font-medium mb-3 shadow-inner"
          />

          {/* Severity Filters */}
          <div className="flex flex-wrap gap-1 mb-4 text-[10px] font-bold font-sans">
            {['All', 'Critical', 'High', 'Medium', 'Low'].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-3 py-1 rounded-lg border transition-all cursor-pointer ${filterSeverity === sev ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'}`}
              >
                {sev}
              </button>
            ))}
            <button
              onClick={() => setFilterCategory(filterCategory === 'SystemAlert' ? 'All' : 'SystemAlert')}
              className={`px-3 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${filterCategory === 'SystemAlert' ? 'bg-yellow-650 border-yellow-500 text-white' : 'bg-white border-slate-200 text-slate-550 hover:text-yellow-600'}`}
            >
              ⚠️ Alerts
            </button>
          </div>

          {/* Incidents List */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredIncidents.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-medium">
                No active pilgrim complaint logs matching criteria.
              </div>
            ) : (
              filteredIncidents.map((inc) => {
                const isSelected = selectedIncident && selectedIncident.id === inc.id
                const isCrit = inc.severity === 'Critical' || inc.severity === 'High'
                const isResolved = inc.status === 'Resolved'
                const isAlert = inc.category === 'SystemAlert'

                return (
                  <div
                    key={inc.id}
                    onClick={() => {
                      setSelectedIncident(inc)
                      setDispatcherNotes(inc.dispatcher_notes || '')
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-150 relative overflow-hidden ${
                      isAlert 
                        ? 'bg-yellow-50/40 border-yellow-200 hover:bg-yellow-50' 
                        : isSelected 
                        ? 'bg-orange-50/45 border-orange-400 shadow-sm' 
                        : 'bg-white border-slate-100 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      isAlert ? 'bg-yellow-500' :
                      isResolved ? 'bg-emerald-500' :
                      inc.severity === 'Critical' ? 'bg-red-500' :
                      inc.severity === 'High' ? 'bg-orange-500' :
                      'bg-sky-500'
                    }`} />

                    <div className="flex justify-between items-start gap-2 mb-2 pl-2">
                      <div className="flex gap-1.5">
                        <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-650 px-2 py-0.5 rounded-full border border-slate-200/50">
                          {inc.category}
                        </span>
                        {!isAlert && (
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            inc.severity === 'Critical' ? 'bg-red-50 text-red-650 border border-red-150' :
                            inc.severity === 'High' ? 'bg-orange-50 text-orange-650 border border-orange-150' :
                            'bg-sky-50 text-sky-650 border border-sky-150'
                          }`}>
                            {inc.severity}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{new Date(inc.created_at).toLocaleTimeString()}</span>
                    </div>

                    <p className="text-xs text-slate-700 line-clamp-2 pl-2 mb-2 font-medium">
                      {inc.raw_description}
                    </p>

                    <div className="flex justify-between items-center pl-2 text-[9px] font-mono text-slate-400">
                      <span>ID: {inc.id.slice(0, 6)}</span>
                      <span className={`font-bold uppercase tracking-wider ${
                        isResolved ? 'text-emerald-600' :
                        inc.status === 'Dispatched' ? 'text-sky-650' :
                        'text-orange-500 animate-pulse'
                      }`}>
                        {isAlert ? 'Broadcast Active' : inc.status}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* MIDDLE COLUMN: SVG Tactical Blueprint Map (5/12 grid) */}
        <div className="lg:col-span-5 flex flex-col bg-white border border-[#e7e3d4]/70 rounded-2xl p-4 shadow-sm">
          <header className="flex justify-between items-center border-b border-slate-100 pb-2.5 mb-4">
            <h2 className="text-xs font-bold font-sans tracking-wide text-slate-500 uppercase">
              Tactical Map (त्रिवेणी संगम - सेक्टर 9 ग्रिड)
            </h2>
            <span className="text-[9px] font-bold text-slate-450 font-mono">PRAYAGRAJ BLUEPRINT</span>
          </header>

          {/* Interactive SVG blueprint map */}
          <div className="flex-1 bg-[#fcfbf9] border border-[#e9e4d5] rounded-xl relative overflow-hidden flex items-center justify-center min-h-[350px] shadow-inner">
            
            <svg 
              viewBox="0 0 500 350" 
              className="w-full h-full text-[#ebe7d8] select-none"
            >
              {/* Grid Lines */}
              <defs>
                <pattern id="kumbhGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(231, 227, 212, 0.4)" strokeWidth="0.5" />
                </pattern>
                
                {/* Ganges water wave fill */}
                <pattern id="riverWave" width="40" height="12" patternUnits="userSpaceOnUse">
                  <path d="M 0 6 Q 10 12, 20 6 T 40 6" fill="none" stroke="rgba(2, 132, 199, 0.08)" strokeWidth="1" />
                </pattern>
                
                {/* Glow Filters */}
                <filter id="glowSaffron" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              
              <rect width="100%" height="100%" fill="url(#kumbhGrid)" />
              
              {/* Ganges River & Triveni Sangam flow boundaries */}
              <path d="M 0,220 C 150,230 300,180 500,260 L 500,350 L 0,350 Z" fill="url(#riverWave)" opacity="0.6" />
              <path d="M 0,220 C 150,230 300,180 500,260" fill="none" stroke="rgba(2, 132, 199, 0.3)" strokeWidth="2.5" strokeDasharray="6,4" />
              <text x="350" y="310" fill="rgba(2, 132, 199, 0.35)" fontSize="9" fontWeight="bold" fontFamily="sans-serif">पवित्र त्रिवेणी संगम (Sangam Bathing Zone)</text>
              
              {/* Pontoon Bridge mock vectors */}
              <line x1="160" y1="120" x2="180" y2="280" stroke="#d4cdb9" strokeWidth="4" strokeDasharray="3,1" />
              <text x="135" y="200" fill="#a89f89" fontSize="6.5" fontWeight="bold" transform="rotate(82, 135, 200)">पांटून पुल 2 (Pontoon Bridge 2)</text>

              <line x1="330" y1="130" x2="350" y2="295" stroke="#d4cdb9" strokeWidth="4" strokeDasharray="3,1" />
              <text x="305" y="210" fill="#a89f89" fontSize="6.5" fontWeight="bold" transform="rotate(83, 305, 210)">पांटून पुल 4 (Pontoon Bridge 4)</text>

              {/* Sector Police Headquarters Base */}
              <rect x="235" y="25" width="30" height="20" rx="3" fill="#1e3a8a" opacity="0.1" stroke="#1e3a8a" strokeWidth="0.5" />
              <text x="250" y="37" fill="#1e3a8a" fontSize="6.5" fontWeight="bold" textAnchor="middle">C3 HQ</text>

              {/* Incidents (Plotted Saffron markers) */}
              {incidents.filter(inc => inc.status !== 'Resolved' && inc.category !== 'SystemAlert').map((inc) => {
                const { x, y } = getMapCoords(inc.latitude, inc.longitude)
                const isSelected = selectedIncident && selectedIncident.id === inc.id
                const isCrit = inc.severity === 'Critical' || inc.severity === 'High'
                
                return (
                  <g 
                    key={inc.id} 
                    className="cursor-pointer group"
                    onClick={() => {
                      setSelectedIncident(inc)
                      setDispatcherNotes(inc.dispatcher_notes || '')
                    }}
                  >
                    {/* Pulsing rings */}
                    {isCrit && (
                      <>
                        <circle cx={x} cy={y} r="15" fill="none" stroke="#dc2626" strokeWidth="1" opacity="0.4" className="animate-ping" style={{ transformOrigin: `${x}px ${y}px` }} />
                        <circle cx={x} cy={y} r="7" fill="none" stroke="#dc2626" strokeWidth="1.5" opacity="0.7" className="animate-pulse" style={{ transformOrigin: `${x}px ${y}px` }} />
                      </>
                    )}
                    
                    <circle 
                      cx={x} 
                      cy={y} 
                      r={isSelected ? '6.5' : '4.5'} 
                      fill={isCrit ? '#dc2626' : '#ea580c'} 
                      stroke="#ffffff" 
                      strokeWidth="1.5"
                      filter={isSelected ? 'url(#glowSaffron)' : ''}
                    />

                    {/* Tooltip */}
                    <rect x={x - 45} y={y - 25} width="90" height="18" rx="4" fill="#292524" stroke="#44403c" strokeWidth="0.5" className="opacity-0 group-hover:opacity-100 transition-opacity" pointerEvents="none" />
                    <text x={x} y={y - 13} fill="#ffffff" fontSize="8" textAnchor="middle" fontFamily="sans-serif" className="opacity-0 group-hover:opacity-100 transition-opacity" pointerEvents="none">
                      {inc.category} • {inc.severity}
                    </text>
                  </g>
                )
              })}

              {/* Dynamic Emergency Vehicles (Glide on dispatch) */}
              {activeResources.map((res) => {
                const isDispatched = res.status === 'Dispatched'
                const color = res.type === 'Fire' ? '#ef4444' : res.type === 'Security' ? '#0284c7' : res.type === 'HAZMAT' ? '#ca8a04' : '#f97316'
                
                return (
                  <g 
                    key={res.id} 
                    style={{ transition: 'transform 4s cubic-bezier(0.25, 0.8, 0.25, 1)' }}
                    transform={`translate(${res.coords.x}, ${res.coords.y})`}
                  >
                    {isDispatched && (
                      <circle cx="0" cy="0" r="10.5" fill="none" stroke={color} strokeWidth="1.5" className="animate-ping" />
                    )}

                    <circle cx="0" cy="0" r="6.5" fill={color} stroke="#ffffff" strokeWidth="1.5" />
                    
                    <text x="0" y="2.5" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                      {res.type === 'Fire' ? 'F' : res.type === 'Security' ? 'P' : res.type === 'Medical' ? 'M' : 'D'}
                    </text>

                    {/* Short numeric name label */}
                    <text x="0" y="-9" fill="#44403c" fontSize="7.5" fontFamily="sans-serif" textAnchor="middle" fontWeight="black">
                      {res.name.split(' ')[0][0]}{res.name.split(' ')[1]}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Light Map Legend */}
            <div className="absolute bottom-3 left-3 bg-white/95 border border-[#e7e3d4] rounded-lg p-2.5 font-sans text-[8.5px] text-[#44403c] space-y-1 z-10 shadow-sm">
              <div className="font-bold text-slate-800 border-b border-slate-100 pb-0.5 mb-1 uppercase tracking-wide">MAP GUIDE</div>
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-600" /> Critical Case</div>
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Moderate Case</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-500 rounded-full border border-white" /> Fire Rescue Unit</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-sky-500 rounded-full border border-white" /> Medical Responder</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-900 rounded-full border border-white" /> Police Patroller</div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Dispatch Pane & Alerts Broadcasting (3/12 grid) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Dispatch details console */}
          <div className="bg-white border border-[#e7e3d4]/70 rounded-2xl p-4 shadow-sm flex-1 flex flex-col justify-between min-h-[350px]">
            <div>
              <h2 className="text-xs font-bold font-sans tracking-wide text-slate-500 uppercase border-b border-slate-100 pb-2.5 mb-4">
                Assigned Desk (अधिकारी आवंटन)
              </h2>

              {!selectedIncident ? (
                <div className="text-center py-12 text-slate-400 text-xs font-medium">
                  Select a complaint from the queue to deploy local officers.
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  {/* Status Indicator */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-sans">Current Status</span>
                    <span className={`text-[9px] font-bold uppercase font-sans px-2.5 py-0.5 rounded-full border ${
                      selectedIncident.status === 'Resolved' ? 'border-emerald-200 text-emerald-600 bg-emerald-50' :
                      selectedIncident.status === 'Dispatched' ? 'border-sky-200 text-sky-600 bg-sky-50' :
                      'border-orange-200 text-orange-600 bg-orange-50 animate-pulse'
                    }`}>
                      {selectedIncident.status}
                    </span>
                  </div>

                  {/* Complaint Description */}
                  <div className="bg-[#fafaf8] border border-slate-200 p-3 rounded-xl">
                    <span className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Pilgrim Complaint Details</span>
                    <p className="text-slate-700 italic font-medium">"{selectedIncident.raw_description}"</p>
                  </div>

                  {/* AI Triage analysis card */}
                  <div className="bg-[#fffdf8] border border-orange-100 p-3 rounded-xl space-y-2">
                    <div className="text-orange-700 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                      AI Smart Triage Suggestions
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">Suggested Resource:</span>
                      <span className="text-slate-800 font-bold text-xs">{selectedIncident.recommended_unit}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-bold block">First Aid / Security Tip:</span>
                      <p className="text-slate-650 text-[10px] leading-relaxed mt-0.5 font-semibold">{selectedIncident.survival_instructions}</p>
                    </div>
                  </div>

                  {/* Directives text box */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Directives for Responders</label>
                    <textarea
                      placeholder="Type directions here (e.g. 'Stretcher needed at pontoon bridge 2')..."
                      value={dispatcherNotes}
                      onChange={(e) => setDispatcherNotes(e.target.value)}
                      className="w-full bg-[#fafaf8] border border-slate-200 p-2 h-14 rounded-xl text-xs focus:outline-none focus:border-orange-500 placeholder-slate-400 resize-none font-medium text-slate-700"
                    />
                  </div>
                </div>
              )}
            </div>

            {selectedIncident && (
              <div className="pt-4 border-t border-slate-100 space-y-2 mt-4">
                
                {/* Officer assignment panel */}
                {selectedIncident.status !== 'Resolved' && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Deploy patrol officer / team</span>
                    <div className="grid grid-cols-2 gap-2">
                      {activeResources
                        .filter(res => res.type === selectedIncident.category || (selectedIncident.category === 'HAZMAT' && res.type === 'HAZMAT'))
                        .map(res => (
                          <button
                            key={res.id}
                            onClick={() => handleDispatch(res.name)}
                            disabled={res.status === 'Dispatched'}
                            className={`px-2 py-1.5 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                              res.status === 'Dispatched' 
                                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' 
                                : 'bg-sky-50 border-sky-200 hover:bg-sky-600 hover:text-white hover:border-sky-650 text-sky-700'
                            }`}
                          >
                            {res.name.split(' (')[0]}
                          </button>
                        ))
                      }
                      {activeResources.filter(res => res.type === selectedIncident.category).length === 0 && (
                        <button
                          onClick={() => handleDispatch('Ambulance 1 (Sector 3)')}
                          className="px-2 py-1.5 text-[9px] font-bold rounded-lg border bg-sky-50 border-sky-200 hover:bg-sky-600 hover:text-white text-sky-750 cursor-pointer col-span-2"
                        >
                          Dispatch Ambulance 1
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Mark resolved button */}
                {selectedIncident.status !== 'Resolved' ? (
                  <button
                    onClick={handleResolve}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs tracking-wider transition-all cursor-pointer shadow-sm"
                  >
                    RESOLVE COMPLAINT (शिकायत का समाधान)
                  </button>
                ) : (
                  <div className="text-center py-2 bg-emerald-50 border border-emerald-250 rounded-xl">
                    <p className="text-[10px] text-emerald-650 font-bold uppercase">Complaint Resolved & Closed</p>
                    <p className="text-[8.5px] text-slate-400 mt-0.5">Resolved: {selectedIncident.resolved_at ? new Date(selectedIncident.resolved_at).toLocaleTimeString() : ''}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Broadcast warning center */}
          <div className="bg-white border border-[#e7e3d4]/70 rounded-2xl p-4 shadow-sm">
            <h2 className="text-xs font-bold font-sans tracking-wide text-slate-500 uppercase border-b border-slate-100 pb-2.5 mb-3">
              Announcements Broadcast (घोषणा केंद्र)
            </h2>

            <form onSubmit={handleBroadcastAlert} className="space-y-3">
              <p className="text-[9.5px] text-slate-500 leading-normal">
                Broadcast public address notices directly to all pilgrim mobile screens.
              </p>
              
              <input
                type="text"
                placeholder="Notice: Heat warning, lost child announcement..."
                value={alertText}
                onChange={(e) => setAlertText(e.target.value)}
                required
                className="w-full bg-[#fafaf8] border border-slate-200 p-2.5 rounded-xl text-xs focus:outline-none focus:border-orange-500 placeholder-slate-400 font-medium text-slate-800 shadow-inner"
              />

              <button
                type="submit"
                disabled={isBroadcasting}
                className="w-full bg-orange-50 hover:bg-orange-600 hover:text-white border border-orange-200 hover:border-orange-500 text-orange-700 font-bold py-2 rounded-xl text-xs tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
                {isBroadcasting ? 'Broadcasting...' : 'BROADCAST SYSTEM NOTICE'}
              </button>
            </form>
          </div>

        </div>

      </section>

      {/* Floating telemetry banner alert */}
      {commandStatus && (
        <div className="fixed bottom-4 right-4 bg-white border border-orange-400 text-orange-700 px-4 py-2.5 rounded-xl shadow-lg font-sans text-xs z-50 animate-bounce flex items-center gap-2 font-bold">
          <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping" />
          {commandStatus}
        </div>
      )}

    </main>
  )
}