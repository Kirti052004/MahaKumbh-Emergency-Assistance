'use client'

import { useState, useEffect, useRef } from 'react'
import { processAndLogIncident } from './actions/triage'
import { createClient } from '@supabase/supabase-js'

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

interface IssueType {
  id: string;
  titleEn: string;
  titleHi: string;
  icon: string;
  color: string;
  category: string;
  placeholder: string;
  safetyTip: string;
}

const EMERGENCY_ISSUES: IssueType[] = [
  {
    id: 'lost',
    titleEn: 'Lost & Found / Missing Person',
    titleHi: 'खोया-पाया / लापता व्यक्ति',
    icon: '👥',
    color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100/70',
    category: 'Medical', // Maps to Medical/General Assistance in triage
    placeholder: '[Lost & Found] Missing relative details: Name, age, wearing clothes, lost near Ghat Sector...',
    safetyTip: 'Report immediately to the nearest "Lost & Found" (खोया-पाया) booth in Sector 4 to initiate public speaker announcements.'
  },
  {
    id: 'medical',
    titleEn: 'Medical / Heat Stroke / Trauma',
    titleHi: 'चिकित्सा सहायता / लू लगना',
    icon: '🚑',
    color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100/70',
    category: 'Medical',
    placeholder: '[Medical Emergency] Dehydration/Heat stroke/Injury details: Number of victims, symptoms, near camp...',
    safetyTip: 'Look for nearest sector medical post marked with green flags. Keep the patient in shade and hydrate.'
  },
  {
    id: 'crowd',
    titleEn: 'Crowd Congestion / Stampede Risk',
    titleHi: 'भारी भीड़ / भगदड़ का खतरा',
    icon: '🚨',
    color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/70',
    category: 'Infrastructure', // Maps to infrastructure safety in database
    placeholder: '[Crowd Safety Alert] Stampede risk or heavy congestion spotted near Pontoon Bridge Sector...',
    safetyTip: 'Move continuously with the flow of the crowd. Keep hands up near your chest; do not stand still or fight currents.'
  },
  {
    id: 'fire',
    titleEn: 'Camp Fire / Tent Smoke',
    titleHi: 'तंबू में आग / धुआं',
    icon: '🔥',
    color: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100/70',
    category: 'Fire',
    placeholder: '[Fire Emergency] Smoke/Fire detected in tents near Sector Sector camp, gas cylinder risk...',
    safetyTip: 'Evacuate canvas tents immediately, move to wide open sandbanks, and keep away from cooking gas cylinders.'
  },
  {
    id: 'water',
    titleEn: 'Sangam River Safety / Drowning',
    titleHi: 'नदी स्नान खतरा / जल सुरक्षा',
    icon: '🌊',
    color: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100/70',
    category: 'Medical',
    placeholder: '[River Safety Alert] Person crossing safety rope/swept away in River Sangam near Ghat...',
    safetyTip: 'Only take holy baths in designated ghat areas. Do not cross the floating red safety boundary rope.'
  },
  {
    id: 'security',
    titleEn: 'Police / Theft / Harassment',
    titleHi: 'पुलिस सहायता / चोरी',
    icon: '👮',
    color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100/70',
    category: 'Security',
    placeholder: '[Police Assistance] Theft/Fighting/Valuables stolen near sector checking point...',
    safetyTip: 'Contact the nearest Police Patrolling squad or walk to the Sector Police Chowki.'
  }
]

export default function PilgrimPortal() {
  const [coords, setCoords] = useState({ lat: 25.4300, lng: 81.8900 }) // Sangam, Prayagraj coordinates default
  const [gpsLocked, setGpsLocked] = useState(false)
  const [description, setDescription] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('Medical')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState<'report' | 'tracking'>('report')
  const [myIncidents, setMyIncidents] = useState<any[]>([])
  const [globalAlerts, setGlobalAlerts] = useState<any[]>([])
  
  // Audio Walkie Talkie state
  const [isRecording, setIsRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const timerRef = useRef<any>(null)
  
  const formRef = useRef<HTMLDivElement | null>(null)

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGpsLocked(true)
        },
        (err) => {
          console.warn('Geolocation failed, using default Prayagraj Sangam coordinates', err)
          setGpsLocked(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [])

  // Sync with Supabase
  useEffect(() => {
    // 1. Fetch system warnings (category = 'SystemAlert')
    supabase
      .from('incidents')
      .select('*')
      .eq('category', 'SystemAlert')
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setGlobalAlerts(data)
      })

    // 2. Fetch my incidents from localStorage
    const savedIds = JSON.parse(localStorage.getItem('my_incident_ids') || '[]')
    if (savedIds.length > 0) {
      supabase
        .from('incidents')
        .select('*')
        .in('id', savedIds)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (data) {
            const decoded = data.map(item => clientDecode(item))
            setMyIncidents(decoded)
          }
        })
    }

    // 3. Realtime subscription
    const channel = supabase
      .channel('pilgrim-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new.category === 'SystemAlert') {
          setGlobalAlerts(prev => [payload.new, ...prev.slice(0, 2)])
        }
        
        const updatedItem = payload.new as any
        const savedIdsCurrent = JSON.parse(localStorage.getItem('my_incident_ids') || '[]')
        
        if (savedIdsCurrent.includes(updatedItem.id)) {
          setMyIncidents(prev => {
            const decoded = clientDecode(updatedItem)
            const exists = prev.some((item: any) => item.id === updatedItem.id)
            if (exists) {
              return prev.map((item: any) => item.id === updatedItem.id ? decoded : item)
            } else {
              return [decoded, ...prev]
            }
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Waveform animation
  useEffect(() => {
    if (isRecording) {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      let phase = 0
      const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.strokeStyle = '#ea580c'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        for (let x = 0; x < canvas.width; x++) {
          const y = (canvas.height / 2) + Math.sin(x * 0.07 + phase) * 12 * Math.sin(x * 0.015)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        phase += 0.2
        animRef.current = requestAnimationFrame(render)
      }
      render()

      timerRef.current = setInterval(() => {
        setRecordTime(t => t + 1)
      }, 1000)
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      setRecordTime(0)
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  const selectIssueCard = (issue: IssueType) => {
    setSelectedIssueId(issue.id)
    setActiveCategory(issue.category)
    setDescription(issue.placeholder)
    
    // Smooth scroll to form
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleWalkieTalkie = () => {
    if (isRecording) {
      setIsRecording(false)
      const mockTranscripts = [
        "[Voice Pilgrim Dispatch]: Lost my kid wearing a yellow kurta near sector 3 ghat. Praying for help.",
        "[Voice Pilgrim Dispatch]: Elder person collapsed near Pontoon Bridge 4 due to heat stroke. Needs stretcher.",
        "[Voice Pilgrim Dispatch]: Pontoon Bridge 2 is shaking, crowd is rushing forward. Stampede danger.",
        "[Voice Pilgrim Dispatch]: Small fire sparks from tent wire in Sector 5 camp zone. Smoke rising.",
        "[Voice Pilgrim Dispatch]: Bather crossed red safety buoy in Ganges River at Sector 4 Sangam ghat.",
        "[Voice Pilgrim Dispatch]: Valuables and bag stolen from checking post 2 near the bathing zone."
      ]
      const randomText = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)]
      setDescription(prev => prev ? prev + "\n" + randomText : randomText)
    } else {
      setIsRecording(true)
    }
  }

  const handleTransmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return

    setStatus('Triage link initiating (पंजीकरण चालू है)...')
    const formData = new FormData()
    formData.append('description', description)
    formData.append('latitude', coords.lat.toString())
    formData.append('longitude', coords.lng.toString())

    try {
      const res = await processAndLogIncident(formData)
      if (res.success && res.incident) {
        setStatus('Complaint Registered! (शिकायत दर्ज कर ली गई है!)')
        setDescription('')
        setSelectedIssueId(null)
        
        // Save ID to localStorage
        const savedIds = JSON.parse(localStorage.getItem('my_incident_ids') || '[]')
        savedIds.push(res.incident.id)
        localStorage.setItem('my_incident_ids', JSON.stringify(savedIds))

        setMyIncidents(prev => [res.incident, ...prev])
        
        setTimeout(() => {
          setActiveTab('tracking')
          setStatus('')
        }, 1500)
      } else {
        setStatus('Transmission error. (त्रुटि: पुनः प्रयास करें)')
      }
    } catch (err) {
      console.error(err)
      setStatus('Transmission failed.')
    }
  }

  return (
    <main className="min-h-screen bg-[#fdfcf7] text-[#292524] flex flex-col items-center p-4 md:p-8 relative holy-waves">
      
      {/* Global Alerts Banner */}
      {globalAlerts.length > 0 && (
        <div className="w-full max-w-3xl mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm animate-pulse">
          <span className="bg-red-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider animate-bounce mt-0.5">
            घोषणा / ALERT
          </span>
          <div className="flex-1 text-xs">
            <p className="font-bold text-red-800 uppercase tracking-wide">MAHAKUMBH OFFICIAL SAFETY ANNOUNCEMENT</p>
            <p className="text-red-700 mt-1 font-semibold">{globalAlerts[0].description}</p>
            <span className="text-[10px] text-red-400 block mt-1">{new Date(globalAlerts[0].created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-3xl bg-white border border-[#e7e3d4]/70 rounded-2xl shadow-xl overflow-hidden relative">
        {/* Spiritual Saffron Top Header Accent */}
        <div className="h-2 bg-gradient-to-r from-orange-500 via-yellow-500 to-sky-500" />
        
        <div className="p-6">
          
          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600 pulse-saffron" />
                <h1 className="text-xl font-black text-slate-850 font-sans tracking-wide uppercase">
                  महाकुंभ आपातकालीन पोर्टल <span className="text-orange-600 text-sm font-semibold block md:inline font-sans">(Mahakumbh Emergency Link)</span>
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Prayagraj Sangam • Pilgrim Safety & Rapid Response Dispatch</p>
            </div>
            
            <div className="flex bg-[#faf9f4] border border-[#e8e4d5] rounded-xl p-0.5 font-mono text-xs shadow-inner">
              <button 
                onClick={() => setActiveTab('report')}
                className={`px-4 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${activeTab === 'report' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Register Complain
              </button>
              <button 
                onClick={() => setActiveTab('tracking')}
                className={`px-4 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'tracking' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Track Complaint
                {myIncidents.filter(x => x.status !== 'Resolved').length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                )}
              </button>
            </div>
          </header>

          {activeTab === 'report' ? (
            <div className="space-y-6">
              
              {/* Divided Category Selector Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-sans">
                  Select your specific issue to report / अपनी समस्या चुनें:
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {EMERGENCY_ISSUES.map((issue) => {
                    const isSelected = selectedIssueId === issue.id
                    return (
                      <div
                        key={issue.id}
                        onClick={() => selectIssueCard(issue)}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between h-32 ${issue.color} ${
                          isSelected ? 'ring-4 ring-orange-500/20 border-orange-600 scale-[1.02]' : 'shadow-sm'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-2xl">{issue.icon}</span>
                          {isSelected && <span className="text-xs font-bold text-orange-600 bg-white px-2 py-0.5 rounded-full border border-orange-500/20">Selected</span>}
                        </div>
                        <div className="mt-2 text-left">
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{issue.titleEn}</p>
                          <p className="text-sm font-black text-slate-800 mt-0.5">{issue.titleHi}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Form and report area */}
              <div ref={formRef} className="pt-4 border-t border-slate-100">
                {selectedIssueId ? (
                  <div className="bg-[#fffdf9] border border-orange-100 rounded-xl p-4 mb-4">
                    <span className="text-[9px] font-bold text-orange-600 uppercase block tracking-wider font-mono">Quick Advice for Selected Issue</span>
                    <p className="text-xs text-orange-800 font-semibold mt-1">
                      {EMERGENCY_ISSUES.find(x => x.id === selectedIssueId)?.safetyTip}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl mb-4 text-xs text-slate-500">
                    💡 Click one of the category cards above to fill out your details rapidly.
                  </div>
                )}

                {/* GPS LOCK */}
                <div className="bg-[#faf9f3] border border-[#e8e4d5] rounded-xl p-4 mb-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-3.5 w-3.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${gpsLocked ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                      <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${gpsLocked ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-700">
                        {gpsLocked ? 'Kumbh GPS Satellite Link Active' : 'Approximate GPS Satellite Link'}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Prayagraj Coordinates: Lat {coords.lat.toFixed(5)} • Lng {coords.lng.toFixed(5)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${gpsLocked ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-orange-200 text-orange-600 bg-orange-50'}`}>
                    {gpsLocked ? 'GPS Verified' : 'Standard Lock'}
                  </span>
                </div>

                <form onSubmit={handleTransmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 block">Provide Complaint/Incident Details (विवरण दर्ज करें)</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      placeholder="Write details of the issue here (e.g. details of the person missing, description of fire, heat stroke case)..."
                      className="w-full p-4 h-28 bg-[#fafaf8] border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 text-slate-800 placeholder-slate-400 resize-none text-xs transition-all focus:ring-2 focus:ring-orange-100"
                    />
                  </div>

                  {/* Sacred Walkie Talkie Voice Dispatcher */}
                  <div className="border border-[#e9e4d5] rounded-xl p-4 bg-[#fcfbfa] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex-1">
                      <h4 className="text-xs font-bold text-slate-750 flex items-center gap-1.5 uppercase">
                        🎤 Audio Walkie-Talkie (वाकी-टॉकी)
                        {isRecording && <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping" />}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {isRecording 
                          ? `Transcribing pilgrim voice command: ${recordTime}s`
                          : 'Simulate transmitting emergency voice report directly to command.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isRecording && (
                        <canvas 
                          ref={canvasRef} 
                          width="90" 
                          height="25" 
                          className="bg-white border border-[#e9e4d5] rounded-lg h-[25px]" 
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleWalkieTalkie}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${isRecording ? 'bg-orange-600 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                      >
                        {isRecording ? 'Stop & Append' : 'Pilgrim Radio Link'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white py-3.5 rounded-xl font-bold transition-all shadow-md shadow-orange-500/10 text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    🚩 REGISTER COMPLAINT / शिकायत दर्ज करें
                  </button>
                </form>

                {status && (
                  <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg text-center mt-4 animate-pulse">
                    <p className="text-xs text-orange-700 font-bold">{status}</p>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Tracked Pilgrimage Vectors (आपकी शिकायतें)</h3>
              
              {myIncidents.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
                  <p className="text-slate-400 text-sm">No complaints registered on this device.</p>
                  <p className="text-slate-500 text-xs mt-1">Select a category and submit a form to track status.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myIncidents.map((inc) => {
                    const isCrit = inc.severity === 'Critical' || inc.severity === 'High';
                    const activeStep = 
                      inc.status === 'Resolved' ? 4 : 
                      inc.status === 'Dispatched' ? 3 : 
                      inc.status === 'Pending' ? 2 : 1;

                    return (
                      <div key={inc.id} className={`p-5 rounded-2xl border bg-white shadow-sm border-slate-100 ${isCrit ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-orange-500'}`}>
                        {/* Title block */}
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase bg-[#faf9f4] text-slate-700 border border-[#e8e4d5] px-2.5 py-0.5 rounded-full">
                                {inc.category}
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${isCrit ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                                {inc.severity}
                              </span>
                            </div>
                            <h4 className="text-[10px] text-slate-400 mt-2 font-mono">Uplink ID: {inc.id.slice(0, 8)}</h4>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{new Date(inc.created_at).toLocaleTimeString()}</span>
                        </div>

                        {/* Status tracker steps */}
                        <div className="mb-6">
                          <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 mb-2 font-mono">
                            <span className={activeStep >= 1 ? 'text-orange-600 font-black' : ''}>REGISTERED</span>
                            <span className={activeStep >= 2 ? 'text-orange-600 font-black' : ''}>AI TRIAGED</span>
                            <span className={activeStep >= 3 ? 'text-sky-600 font-black' : ''}>OFFICER ASSIGNED</span>
                            <span className={activeStep >= 4 ? 'text-emerald-600 font-black' : ''}>RESOLVED</span>
                          </div>
                          
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <div className={`h-full rounded-full transition-all duration-700 ${
                              inc.status === 'Resolved' ? 'w-full bg-emerald-500' :
                              inc.status === 'Dispatched' ? 'w-3/4 bg-sky-500' :
                              inc.status === 'Pending' ? 'w-1/2 bg-orange-400 animate-pulse' :
                              'w-1/4 bg-orange-500 animate-pulse'
                            }`} />
                          </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-3 text-xs">
                          <div>
                            <span className="text-slate-400 text-[9px] uppercase font-bold block">Complaint Details (शिकायत)</span>
                            <p className="text-slate-700 mt-0.5 font-medium">{inc.raw_description}</p>
                          </div>

                          {inc.assigned_resource && (
                            <div className="bg-sky-50 border border-sky-100 p-3 rounded-xl flex items-center justify-between">
                              <div>
                                <span className="text-sky-600 text-[9px] uppercase font-bold block">Assigned Responder (तैनात अधिकारी)</span>
                                <span className="text-slate-800 font-bold mt-0.5 block">{inc.assigned_resource}</span>
                              </div>
                              <span className="text-2xl animate-bounce">🚩</span>
                            </div>
                          )}

                          {inc.dispatcher_notes && (
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                              <span className="text-amber-700 text-[9px] uppercase font-bold block">Control Room Directive (निर्देश)</span>
                              <p className="text-slate-700 mt-1 italic">"{inc.dispatcher_notes}"</p>
                            </div>
                          )}

                          {/* Survival Instruction from Gemini */}
                          <div className="bg-orange-50/50 border border-orange-100 p-4 rounded-xl">
                            <span className="text-orange-700 text-[9px] uppercase font-bold block">Recommended Action (सलाह)</span>
                            <p className="text-orange-850 mt-1 font-semibold leading-relaxed font-sans">{inc.survival_instructions}</p>
                          </div>
                        </div>

                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      <footer className="mt-8 text-center text-[10px] text-slate-400 font-mono">
        MAHAKUMBH RAPID SECTOR COORDINATION GRID • 2026 PRAYAGRAJ
      </footer>
    </main>
  )
}