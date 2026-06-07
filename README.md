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

---

## 📂 Project Architecture & Codebase

```bash
├── emergency-app
│   ├── app
│   │   ├── actions
│   │   │   └── triage.ts      # Server Actions (Gemini Triage & Supabase status updates)
│   │   ├── dashboard
│   │   │   └── page.tsx       # Dispatcher Command Center UI & SVG tactical map
│   │   ├── globals.css        # Saffron/Gold/Triveni Blue styles & animations
│   │   ├── layout.tsx         # Next.js global layout
│   │   └── page.tsx           # Pilgrim Portal (6-issue grid, Walkie talkie, Live tracker)
│   ├── .env.local             # Secrets configuration (API keys & Supabase tokens)
│   └── package.json
├── schema.sql                 # SQL schema and Postgres Realtime scripts
└── README.md                  # Project overview (this file)
```

---

## 🚀 Local Setup & Configuration

### Prerequisites
* [Node.js](https://nodejs.org/en) (v20+ recommended)
* A [Supabase](https://supabase.com) project
* A [Gemini AI API Key](https://ai.google.dev/)

### 1. Database Setup
Copy the contents of the [schema.sql](schema.sql) file and run it inside the **SQL Editor** on your Supabase dashboard. This will:
* Create the `incidents` table.
* Enable postgres realtime listeners.
* Set up Row Level Security (RLS) policies allowing public inserts and updates.

### 2. Setup Environment Variables
Inside the `emergency-app` folder, create a `.env.local` file and paste the following configuration, replacing the values with your project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-private-service-role-key
GEMINI_API_KEY=your-google-gemini-api-key
```

### 3. Install and Run
Open your terminal in the `emergency-app` directory and execute:
```bash
# Install packages
npm install

# Start local server
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** for the Pilgrim Portal and **[http://localhost:3000/dashboard](http://localhost:3000/dashboard)** for the Command Center.

---

## 🌎 Deployment to Vercel

To deploy your own version:
1. Log into your Vercel CLI: `npx vercel login`
2. Run the deployment command from the `emergency-app` folder:
   ```bash
   npx vercel deploy --prod --yes \
     -e NEXT_PUBLIC_SUPABASE_URL=your_supabase_url \
     -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key \
     -e SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key \
     -e GEMINI_API_KEY=your_gemini_api_key \
     --build-env NEXT_PUBLIC_SUPABASE_URL=your_supabase_url \
     --build-env NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key \
     --build-env SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key \
     --build-env GEMINI_API_KEY=your_gemini_api_key
   ```
