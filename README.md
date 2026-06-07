# 🚩 Mahakumbh Mela: Pilgrim Emergency Response & Resource Coordination

An innovative, real-time emergency reporting and dispatch dashboard designed to manage pilgrim safety and resources at scale during the **Prayagraj Mahakumbh Mela**. 

This full-stack platform features a client-side **Pilgrim Portal** for rapid category reporting and a dispatcher **Command Control Center** with a dynamic, physical SVG map plotting live incident coordinates and tracking emergency responders.

## 🔗 Live Production Links
* **Pilgrim SOS Portal**: [https://emergency-app-red.vercel.app](https://emergency-app-red.vercel.app)
* **Command Center Control Desk**: [https://emergency-app-red.vercel.app/dashboard](https://emergency-app-red.vercel.app/dashboard)

---

## 🌟 Key Features

### 1. Pilgrim Portal (For Visitors/Pilgrims)
* **Divided Issue Selector**: A grid of 6 cards for common Kumbh emergencies (Lost & Found, Medical/Dehydration, Crowd Congestion, Camp Fire, Sangam water safety, and Security/Theft) featuring localized Hindi translations. Clicking any card pre-fills specific details templates instantly.
* **Pilgrim Walkie-Talkie (Speech Simulator)**: Captures simulated voice dispatches. Includes a canvas-based sound-wave visualizer that appends simulated transcripts to the text.
* **Live Geolocation GPS Lock**: Automatically grabs exact coordinates from the pilgrim's device browser to aid rescue teams.
* **Real-time Incident Progress**: Features a satellite tracker timeline (Registered $\rightarrow$ AI Triaged $\rightarrow$ Officer Dispatched $\rightarrow$ Resolved) that updates live as control room operators assign resources.

### 2. Command Center Dashboard (For Dispatchers/Control Room)
* **Live Database Stream**: Subscribes to Supabase postgres changes via WebSockets, fetching and rendering new cases in the list instantly.
* **Intelligent AI Triage (Gemini 2.5 Flash)**: Processes description text, assigns categorizations (`Fire`, `Medical`, `Security`, etc.) and severities (`Critical`, `High`, etc.), suggests specific vehicles to deploy, and writes first-aid tips.
* **Tactical Blueprint Map**: Plots coordinates on a custom light-mode SVG sector map showing the Sangam banks, pontoon bridges, and patrol base camps.
* **Animated Asset Dispatch**: Tracks active responders (Police, Ambulances, Ghat rescue boats). Selecting a responder glides the vehicle indicator smoothly across the tactical map from its base station to the target incident pin via CSS transitions.
* **Announcements Desk**: Allows dispatchers to broadcast public notices (such as heat warnings or crowding notifications) that instantly display as marquee warnings on all active pilgrim terminals.

---

## 🛠️ Technology Stack
* **Framework**: Next.js 16.2.7 (Turbopack) & React 19
* **Styling**: Tailwind CSS v4 & Custom CSS keyframe animations
* **Database & Realtime WebSockets**: Supabase JS Client
* **AI Engine**: Google Gemini API (via HTTP endpoint Server Actions)
* **Hosting**: Vercel Production Cloud

