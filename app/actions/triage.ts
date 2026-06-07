'use server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Helper to decode incident description JSON
export async function decodeIncident(item: any) {
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
    // If JSON parsing fails, this is a legacy raw text description
  }
  
  // Default values for legacy plain text incidents
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

export async function processAndLogIncident(formData: FormData) {
  const text = formData.get('description') as string
  const lat = parseFloat(formData.get('latitude') as string) || 0
  const lng = parseFloat(formData.get('longitude') as string) || 0

  let category = 'Medical'
  let severity = 'Medium'
  let recommendedUnit = 'Ambulance 1'
  let survivalInstructions = 'Stay calm. Apply pressure to any wounds if bleeding. Ensure the area is safe.'

  const apiKey = process.env.GEMINI_API_KEY
  if (apiKey) {
    try {
      const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
      const prompt = `
        Analyze this emergency situation reported by a civilian: "${text}".
        
        Provide the following details in a JSON format:
        1. "category": Choose exactly one from: "Fire", "Medical", "Security", "HAZMAT", "Infrastructure".
        2. "severity": Choose exactly one from: "Critical", "High", "Medium", "Low".
        3. "recommended_unit": Choose the most appropriate unit to dispatch (e.g. "Ambulance 1", "Fire Engine 1", "Police Cruiser 1", "HAZMAT Unit 1", "Rescue Squad 1").
        4. "survival_instructions": Short, urgent safety/first-aid instructions (maximum 3 bullet points, under 30 words total) for the reporter to perform immediately while waiting.
        
        Reply ONLY with a strict JSON object structure. Do not include markdown code block formatting (no \`\`\`json).
        Example format:
        {"category": "Medical", "severity": "High", "recommended_unit": "Ambulance 1", "survival_instructions": "1. Keep victim warm. 2. Apply pressure to bleeding wounds. 3. Monitor breathing."}
      `;

      const aiResponse = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text }]
          }],
          // Try passing the system instruction in standard body format or simple parts
        })
      });

      // Let's refine the fetch payload to be very compatible. We'll pass the full instructions in prompt:
      const refinedResponse = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      if (refinedResponse.ok) {
        const aiData = await refinedResponse.json()
        const rawAiText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanJsonText = rawAiText.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleanJsonText)
        
        if (parsed.category) category = parsed.category
        if (parsed.severity) severity = parsed.severity
        if (parsed.recommended_unit) recommendedUnit = parsed.recommended_unit
        if (parsed.survival_instructions) survivalInstructions = parsed.survival_instructions
      }
    } catch (err) {
      console.error('Gemini AI Triage Error, using safe fallbacks:', err)
      // Fallback heuristics based on keywords in description
      const lower = text.toLowerCase()
      if (lower.includes('fire') || lower.includes('smoke') || lower.includes('burn')) {
        category = 'Fire'
        severity = 'High'
        recommendedUnit = 'Fire Engine 1'
        survivalInstructions = '1. Evacuate building immediately. 2. Stay low under smoke. 3. Call emergency services.'
      } else if (lower.includes('police') || lower.includes('fight') || lower.includes('weapon') || lower.includes('rob') || lower.includes('threat')) {
        category = 'Security'
        severity = 'High'
        recommendedUnit = 'Police Cruiser 1'
        survivalInstructions = '1. Seek immediate shelter. 2. Lock doors and turn off lights. 3. Remain silent.'
      } else if (lower.includes('chemical') || lower.includes('leak') || lower.includes('gas') || lower.includes('spill')) {
        category = 'HAZMAT'
        severity = 'Critical'
        recommendedUnit = 'HAZMAT Unit 1'
        survivalInstructions = '1. Move upwind and away. 2. Avoid breathing vapors. 3. Cover mouth/nose with a damp cloth.'
      }
      if (lower.includes('bleed') || lower.includes('heart') || lower.includes('unconscious') || lower.includes('breathing')) {
        severity = 'Critical'
      }
    }
  }

  // Create the JSON metadata description payload
  const descriptionPayload = JSON.stringify({
    text: text,
    status: 'Pending',
    assigned_resource: null,
    dispatcher_notes: '',
    resolved_at: null,
    recommended_unit: recommendedUnit,
    survival_instructions: survivalInstructions
  });

  const { data, error } = await supabase
    .from('incidents')
    .insert([{ 
      description: descriptionPayload, 
      category, 
      severity, 
      latitude: lat, 
      longitude: lng 
    }])
    .select()

  if (error) {
    console.error('Database insertion error:', error);
    return { success: false, error: error.message };
  }
  
  const decoded = data && data[0] ? await decodeIncident(data[0]) : null;
  return { success: true, incident: decoded };
}

export async function updateIncidentStatus(
  id: string, 
  status: 'Pending' | 'Dispatched' | 'Resolved', 
  assignedResource: string | null, 
  dispatcherNotes: string
) {
  try {
    // 1. Fetch current incident
    const { data: current, error: fetchErr } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return { success: false, error: fetchErr?.message || 'Incident not found' };
    }

    // 2. Parse current description payload
    let currentPayload = {
      text: current.description,
      status: 'Pending',
      assigned_resource: null,
      dispatcher_notes: '',
      resolved_at: null,
      recommended_unit: 'Ambulance 1',
      survival_instructions: 'Stay calm. Emergency services are responding.'
    };

    try {
      const parsed = JSON.parse(current.description);
      if (parsed && typeof parsed === 'object' && 'text' in parsed) {
        currentPayload = { ...currentPayload, ...parsed };
      }
    } catch (e) {
      // Use text as is
    }

    // 3. Update fields
    const updatedPayload = {
      ...currentPayload,
      status,
      assigned_resource: assignedResource,
      dispatcher_notes: dispatcherNotes,
      resolved_at: status === 'Resolved' ? new Date().toISOString() : currentPayload.resolved_at
    };

    // 4. Update the database
    const { data, error: updateErr } = await supabase
      .from('incidents')
      .update({
        description: JSON.stringify(updatedPayload)
      })
      .eq('id', id)
      .select();

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const decoded = data && data[0] ? await decodeIncident(data[0]) : null;
    return { success: true, incident: decoded };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getLiveIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message, incidents: [] };
  }

  const decoded = await Promise.all((data || []).map(item => decodeIncident(item)));
  return { success: true, incidents: decoded };
}