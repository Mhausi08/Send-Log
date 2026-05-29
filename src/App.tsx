import { useState, useEffect, useRef } from "react";
import { supabase, getDeviceId } from "./supabase";

const GRADES = ['5','5+','6A','6A+','6B','6B+','6C','6C+','7A','7A+','7B','7B+'];
const HOLD_COLORS = [
  {name:'Red',hex:'#F52727'},{name:'Blue',hex:'#3F7EF2'},
  {name:'Green',hex:'#2CDE53'},{name:'Yellow',hex:'#F5C827'},
  {name:'Purple',hex:'#9B3FF2'},{name:'Orange',hex:'#F59527'},
  {name:'Pink',hex:'#F757D2'},{name:'Teal',hex:'#3DF2D0'},{name:'Black',hex:'#141414'},
  {name:'Gray',hex:'#757575'},{name:'White',hex:'#F0EDE9',dark:true},
];

const gradeColor = (g: string) => {
  const i = GRADES.indexOf(g);
  if (i <= 1) return '#43B565';
  if (i <= 3) return '#97DE5B'
  if (i <= 5) return '#F4CB35';
  if (i <= 7) return '#F49B35';
  if (i <= 9) return '#F45835'
  return '#F43555';
};

const formatTime = (s: number) => {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};

const avgGrade = (boulders: Boulder[]) => {
  // Count both sent and flashed as completed
  const completed = boulders.filter(b => b.status !== 'project');
  if (!completed.length) return null;
  const avg = completed.reduce((sum,b) => sum + GRADES.indexOf(b.grade), 0) / completed.length;
  return GRADES[Math.round(avg)];
};

type BoulderStatus = 'sent' | 'project' | 'flashed';

interface Boulder {
  id: number;
  grade: string;
  color: string;
  status: BoulderStatus;
}

interface FitnessData {
  duration: string;
  avgHR: string;
  maxHR: string;
  calories: string;
  load: string;
}

interface Session {
  id: number;
  startTime: number;
  endTime?: number;
  boulders: Boulder[];
  fitness?: FitnessData;
  elapsed?: number;
  notes?: string;
}

export default function App() {
  const [screen, setScreen]               = useState('home');
  const [sessions, setSessions]           = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showSheet, setShowSheet]         = useState(false);
  const [newBoulder, setNewBoulder]       = useState<{grade:string,color:string,status:BoulderStatus}>({grade:'5', color:'Red', status:'sent'});
  const [fitness, setFitness]             = useState<FitnessData>({duration:'', avgHR:'', maxHR:'', calories:'', load:''});
  const [summaryImg, setSummaryImg]       = useState<string | null>(null);
  const [elapsed, setElapsed]             = useState(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (currentSession && screen === 'session') {
      const timer = setTimeout(() => { saveSession(currentSession); }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentSession, screen]);

  useEffect(() => {
    if (screen === 'session' && startTimeRef.current) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [screen]);

  const loadData = async () => {
    const deviceId = getDeviceId();
    const { data, error } = await supabase
      .from('climb_sessions')
      .select('*')
      .eq('device_id', deviceId)
      .order('start_time', { ascending: false });
    if (!error && data) {
      const sessions_list: Session[] = [];
      let active: Session | null = null;
      data.forEach(row => {
        const s: Session = {
          id: row.id,
          startTime: row.start_time,
          endTime: row.end_time ?? undefined,
          boulders: row.boulders as Boulder[],
          fitness: row.fitness as FitnessData ?? undefined,
          elapsed: row.elapsed ?? undefined,
        };
        if (!row.end_time) {
          active = s;
          startTimeRef.current = row.start_time;
          setElapsed(Math.floor((Date.now() - row.start_time) / 1000));
          setScreen('session');
        } else {
          sessions_list.push(s);
        }
      });
      setSessions(sessions_list);
      if (active) setCurrentSession(active);
    }
  };

  const saveSession = async (session: Session) => {
    const deviceId = getDeviceId();
    await supabase.from('climb_sessions').upsert({
      id: session.id,
      device_id: deviceId,
      start_time: session.startTime,
      end_time: session.endTime ?? null,
      boulders: session.boulders,
      fitness: session.fitness ?? null,
      elapsed: session.elapsed ?? null,
    });
  };

  const deleteSession = async (sessionId: number) => {
    const deviceId = getDeviceId();
    await supabase.from('climb_sessions').delete().eq('id', sessionId).eq('device_id', deviceId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setSelectedSession(null);
    setScreen('home');
  };

  const startSession = () => {
    const now = Date.now();
    startTimeRef.current = now;
    setCurrentSession({ id: now, startTime: now, boulders: [] });
    setElapsed(0);
    setNewBoulder({grade:'5', color:'Red', status:'sent'});
    setScreen('session');
  };

  const addBoulder = () => {
    setCurrentSession(prev => prev ? ({
      ...prev,
      boulders: [...prev.boulders, { ...newBoulder, id: Date.now() }]
    }) : prev);
    setShowSheet(false);
  };

  const removeBoulder = (id: number) => {
    setCurrentSession(prev => prev ? ({ ...prev, boulders: prev.boulders.filter(b => b.id !== id) }) : prev);
  };

  const goToFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const mins = Math.floor(elapsed / 60);
    setFitness({ duration: mins > 0 ? String(mins) : '', avgHR:'', maxHR:'', calories:'', load:'' });
    setScreen('finish');
  };

  const generateSummary = () => {
    if (!currentSession) return;
    const session = { ...currentSession, endTime: Date.now(), fitness: { ...fitness }, elapsed };
    const img = drawCollage(session);
    setSummaryImg(img);
    setSessions(prev => [session, ...prev]);
    saveSession(session);
    setCurrentSession(null);
    setScreen('summary');
  };

  const downloadImg = () => {
    if (!summaryImg) return;
    const a = document.createElement('a');
    a.href = summaryImg;
    a.download = `sendlog-${new Date().toISOString().split('T')[0]}.png`;
    a.click();
  };

  const statusLabel = (status: BoulderStatus) => {
    if (status === 'sent')    return { text: '✓ Sent',     color: '#3FB950' };
    if (status === 'flashed') return { text: '★ Flashed',  color: '#b69e19' };
    return                           { text: '◌ Project',  color: '#E05C3A' };
  };

  const drawCollage = (session: Session) => {
    const W = 1080, H = 1720;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const rr = (x: number,y: number,w: number,h: number,r: number) => {
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    };

    const PAD = 64;

    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#15191F';
    ctx.lineWidth = 1;
    for (let x=0; x<W; x+=54) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=0; y<H; y+=54) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    const gb = ctx.createLinearGradient(0,0,W,0);
    gb.addColorStop(0,'#A578CC'); gb.addColorStop(1,'#8F89D9');
    ctx.fillStyle = gb; ctx.fillRect(0,0,W,7);

    ctx.fillStyle = '#A578CC';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('SEND LOG', PAD, 52);

    const date = new Date(session.startTime);
    ctx.fillStyle = '#E6EDF3';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}), PAD, 114);

    const sentCount    = session.boulders.filter(b => b.status === 'sent').length;
    const flashedCount = session.boulders.filter(b => b.status === 'flashed').length;
    const projectCount = session.boulders.filter(b => b.status === 'project').length;
    const mins = parseInt(session.fitness?.duration || '0') || Math.floor((session.elapsed||0)/60);

    ctx.fillStyle = '#7D8590';
    ctx.font = '18px monospace';
    ctx.fillText(`${mins} min  ·  ${session.boulders.length} climbs  ·  ${sentCount+flashedCount} sends`, PAD, 150);

    ctx.fillStyle = '#21262D'; ctx.fillRect(PAD, 174, W-PAD*2, 1);

    ctx.fillStyle = '#7D8590'; ctx.font = 'bold 13px monospace';
    ctx.fillText('GRADES', PAD, 208);

    const gradeCount: Record<string,number> = {};
    session.boulders.forEach(b => { gradeCount[b.grade] = (gradeCount[b.grade]||0)+1; });
    const usedGrades = GRADES.filter(g => gradeCount[g]);
    const maxCount = usedGrades.length > 0 ? Math.max(...usedGrades.map(g=>gradeCount[g])) : 1;
    const chartBottom = 450, chartH = 180;
    const innerW = W - PAD*2;
    const barW = usedGrades.length > 0
      ? Math.min(72, (innerW - (usedGrades.length-1)*14) / usedGrades.length)
      : 72;

    usedGrades.forEach((grade, i) => {
      const x = PAD + i*(barW+14);
      const bH = (gradeCount[grade]/maxCount)*chartH;
      const y = chartBottom - bH;
      const g = ctx.createLinearGradient(x,y,x,chartBottom);
      g.addColorStop(0,'#A578CC'); g.addColorStop(1,'#8F89D9');
      ctx.fillStyle = g; rr(x,y,barW,bH,6); ctx.fill();
      ctx.fillStyle='#7D8590'; ctx.font='15px monospace'; ctx.textAlign='center';
      ctx.fillText(grade, x+barW/2, chartBottom+22);
      ctx.fillStyle='#E6EDF3'; ctx.font='bold 16px monospace';
      ctx.fillText(String(gradeCount[grade]), x+barW/2, y-8);
    });
    if (!usedGrades.length) {
      ctx.fillStyle='#30363D'; ctx.font='18px monospace'; ctx.textAlign='center';
      ctx.fillText('No boulders logged', W/2, 360);
    }
    ctx.textAlign='left';

    ctx.fillStyle='#21262D'; ctx.fillRect(PAD, 484, W-PAD*2, 1);

    ctx.fillStyle='#7D8590'; ctx.font='bold 13px monospace';
    ctx.fillText('HOLD COLORS', PAD, 518);

    const colorCount: Record<string,number> = {};
    session.boulders.forEach(b => { colorCount[b.color]=(colorCount[b.color]||0)+1; });
    const colorEntries = Object.entries(colorCount).sort((a,b)=>b[1]-a[1]);

    const circleR = 24, circleSpacing = 78;
    colorEntries.forEach(([color, count], i) => {
      const co = HOLD_COLORS.find(c=>c.name===color);
      const cx2 = PAD + circleR + i*circleSpacing, cy = 562;
      ctx.shadowColor = co?.hex||'#888'; ctx.shadowBlur=14;
      ctx.fillStyle = co?.hex||'#888';
      ctx.beginPath(); ctx.arc(cx2, cy, circleR, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      if (color==='White') {
        ctx.strokeStyle='#555'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(cx2, cy, circleR, 0, Math.PI*2); ctx.stroke();
      }
      ctx.fillStyle='#7D8590'; ctx.font='13px monospace'; ctx.textAlign='center';
      ctx.fillText(`×${count}`, cx2, cy+42);
    });
    if (!colorEntries.length) {
      ctx.fillStyle='#30363D'; ctx.font='18px monospace'; ctx.textAlign='center';
      ctx.fillText('No colors', W/2, 562);
    }
    ctx.textAlign='left';

    ctx.fillStyle='#21262D'; ctx.fillRect(PAD, 622, W-PAD*2, 1);

    ctx.fillStyle='#7D8590'; ctx.font='bold 13px monospace';
    ctx.fillText('SESSION STATS', PAD, 658);

    const stats = [
      {label:'DURATION',       value: session.fitness?.duration  ? `${session.fitness.duration} min` : '—'},
      {label:'AVG HEART RATE', value: session.fitness?.avgHR     ? `${session.fitness.avgHR} bpm`   : '—'},
      {label:'MAX HEART RATE', value: session.fitness?.maxHR     ? `${session.fitness.maxHR} bpm`   : '—'},
      {label:'CALORIES',       value: session.fitness?.calories  ? `${session.fitness.calories} kcal`: '—'},
      {label:'TRAINING LOAD',  value: session.fitness?.load      || '—'},
    ];

    const cW = (innerW - 20) / 2;
    const rowH = 114, cardH = 96;
    stats.forEach((stat, i) => {
      const isLast = i === 4, col = i % 2, row = Math.floor(i/2);
      const sx = PAD + col*(cW+20), sy = 678 + row*rowH;
      const sw = (isLast && col===0) ? innerW : cW;
      ctx.fillStyle='#161B22'; rr(sx,sy,sw,cardH,12); ctx.fill();
      ctx.fillStyle='#7D8590'; ctx.font='12px monospace';
      ctx.fillText(stat.label, sx+18, sy+24);
      ctx.fillStyle = stat.value==='—' ? '#2D333B' : '#E6EDF3';
      ctx.font='bold 32px sans-serif';
      ctx.fillText(stat.value, sx+18, sy+72);
    });

    const statsBottom = 678 + 3*rowH + 12;
    ctx.fillStyle='#21262D'; ctx.fillRect(PAD, statsBottom, W-PAD*2, 1);

    ctx.fillStyle='#7D8590'; ctx.font='bold 13px monospace';
    ctx.fillText('SENDS', PAD, statsBottom+36);

    // Three pills: SENT, FLASHED, PROJECT
    const pillW = (innerW - 24*2) / 3;
    const pillH = 80;
    ([
      [sentCount,    'SENT',    '#3FB950'],
      [flashedCount, 'FLASHED', '#b69e19'],
      [projectCount, 'PROJECT', '#E05C3A'],
    ] as [number,string,string][]).forEach(([count,label,color],i) => {
      const px = PAD + i*(pillW+24), py = statsBottom+52;
      ctx.fillStyle=color+'18'; rr(px,py,pillW,pillH,40); ctx.fill();
      ctx.strokeStyle=color+'55'; ctx.lineWidth=2; rr(px,py,pillW,pillH,40); ctx.stroke();
      ctx.fillStyle=color; ctx.font='bold 38px sans-serif'; ctx.textAlign='center';
      ctx.fillText(String(count), px+pillW/2, py+46);
      ctx.fillStyle='#7D8590'; ctx.font='12px monospace';
      ctx.fillText(label, px+pillW/2, py+68);
    });
    ctx.textAlign='left';

    const sendsBottom = statsBottom + 52 + pillH + 32;
    ctx.fillStyle='#21262D'; ctx.fillRect(PAD, sendsBottom, W-PAD*2, 1);

    if (session.notes) {
      ctx.fillStyle='#7D8590'; ctx.font='bold 13px monospace';
      ctx.fillText('NOTES', PAD, sendsBottom+36);
      ctx.fillStyle='#161B22'; rr(PAD, sendsBottom+50, innerW, 100, 12); ctx.fill();
      ctx.fillStyle='#E6EDF3'; ctx.font='16px sans-serif';
      const words = session.notes.split(' ');
      let line = '', ny = sendsBottom+82;
      for (const word of words) {
        const test = line ? line+' '+word : word;
        if (ctx.measureText(test).width > innerW-36 && line) {
          ctx.fillText(line, PAD+18, ny); ny+=24; line=word;
        } else { line=test; }
      }
      if (line) ctx.fillText(line, PAD+18, ny);
    }

    ctx.fillStyle='#0D1117'; ctx.fillRect(0,H-50,W,50);
    ctx.fillStyle='#2D333B'; ctx.font='13px monospace'; ctx.textAlign='right';
    ctx.fillText(`SEND LOG  ·  ${date.toISOString().split('T')[0]}`, W-PAD, H-18);
    ctx.textAlign='left';

    return canvas.toDataURL('image/png');
  };

  const C = {
    bg:     { background:'#0D1117', minHeight:'100vh', color:'#E6EDF3', fontFamily:"'Barlow','Segoe UI',sans-serif", overflowX:'hidden' as const },
    card:   { background:'#1C2128', borderRadius:12, padding:'14px 16px', border:'1px solid #21262D' },
    accent: { color:'#A18DC9' },
    muted:  { color:'#7D8590' },
    label:  { color:'#7D8590', fontFamily:'monospace', fontSize:11, fontWeight:700, letterSpacing:'0.12em', marginBottom:10, display:'block' as const },
    btn:    { background:'linear-gradient(135deg,#A578CC,#8F89D9)', color:'#fff', border:'none', borderRadius:12, padding:'15px 24px', fontWeight:700, fontSize:16, cursor:'pointer', width:'100%', transition:'opacity 0.15s' },
    btnSec: { background:'#161B22', color:'#E6EDF3', border:'1px solid #30363D', borderRadius:12, padding:'14px 24px', fontWeight:600, fontSize:15, cursor:'pointer', width:'100%' },
  };

  const GlobalStyle = () => (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { display: none; }
      input:focus { outline: none; border-color: #A578CC !important; box-shadow: 0 0 0 3px #A578CC22; }
      input { -webkit-appearance: none; }
    `}</style>
  );

  if (screen === 'home') return (
    <div style={C.bg}>
      <GlobalStyle />
      <div style={{padding:'56px 24px 24px', background:'linear-gradient(180deg,#161B22,#0D1117)', position:'relative'}}>
        <a href="https://forms.gle/ZuyG29fjs41EJNM96" target="_blank" rel="noopener noreferrer" style={{
          position:'absolute', top:20, right:20, width:40, height:40,
          borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', transition:'all 0.15s', boxShadow:'0 0px 8px rgba(100,100,100,0.5)'
        }} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 0px 12px rgba(200,200,200,0.8)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='0 0px 8px rgba(100,100,100,0.5)'}>
          <img src="https://img.icons8.com/?size=60&id=98686&format=png&color=FFFFFF" alt="Feedback" style={{width:22, height:22}} />
        </a>
        <div style={{...C.accent, fontFamily:'monospace', fontWeight:700, fontSize:11, letterSpacing:'0.18em', marginBottom:10}}>United Studios</div>
        <div style={{fontSize:28, fontWeight:700, marginBottom:4}}>SEND LOG</div>
        <div style={{color:'#383838', position:'absolute', top:32, right:60, fontFamily:'monospace', fontWeight:700, fontSize:11, letterSpacing:'0.18em'}}>Feedback →</div>
      </div>

      <div style={{padding:'0 16px 40px'}}>
        <button style={{...C.btn, marginBottom:32, padding:'18px', fontSize:17, borderRadius:14}} onClick={startSession}>
          + Start New Session
        </button>

        {sessions.length > 0 && (
          <>
            <span style={C.label}>RECENT SESSIONS</span>
            {sessions.slice(0,8).map(s => {
              const ag = avgGrade(s.boulders);
              const d = new Date(s.startTime);
              const mins = parseInt(s.fitness?.duration || '0') || Math.floor((s.elapsed||0)/60);
              return (
                <div key={s.id} onClick={() => { setSelectedSession(s); setScreen('detail'); }}
                  style={{...C.card, marginBottom:10, display:'flex', alignItems:'center', gap:12, cursor:'pointer', transition:'background-color 0.15s', backgroundColor:'#1C2128'}}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor='#21262D'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor='#1C2128'}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600, fontSize:15, marginBottom:2}}>
                      {d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
                    </div>
                    <div style={{...C.muted, fontSize:13}}>
                      {s.boulders.length} climbs · {mins} min
                    </div>
                  </div>
                  {ag && (
                    <div style={{
                      background:gradeColor(ag)+'22', color:gradeColor(ag),
                      padding:'5px 13px', borderRadius:20, fontWeight:700, fontSize:13,
                      border:`1px solid ${gradeColor(ag)}44`, flexShrink:0
                    }}>{ag} avg</div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {sessions.length === 0 && (
          <div style={{textAlign:'center', padding:'48px 0'}}>
            <div style={{fontFamily:'monospace', fontSize:13, color:'#30363D'}}>No sessions yet.</div>
          </div>
        )}
      </div>
    </div>
  );

  if (screen === 'session') return (
    <div style={{...C.bg, display:'flex', flexDirection:'column', minHeight:'100vh'}}>
      <GlobalStyle />
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'52px 20px 16px', background:'#161B22', borderBottom:'1px solid #21262D',
        position:'sticky', top:0, zIndex:10
      }}>
        <div>
          <div style={{...C.accent, fontFamily:'monospace', fontWeight:700, fontSize:10, letterSpacing:'0.14em'}}>ACTIVE SESSION</div>
          <div style={{fontFamily:'monospace', fontSize:28, fontWeight:700, marginTop:2}}>{formatTime(elapsed)}</div>
        </div>
        <button onClick={goToFinish} style={{
          background:'#FA624122', color:'#FA6241', border:'1px solid #FA624144',
          borderRadius:10, padding:'10px 18px', fontWeight:700, cursor:'pointer', fontSize:14
        }}>Finish →</button>
      </div>

      <div style={{flex:1, padding:'16px', paddingBottom:120, overflowY:'auto'}}>
        {currentSession?.boulders.length === 0 && (
          <div style={{textAlign:'center', padding:'60px 20px'}}>
            <div style={{fontFamily:'monospace', fontSize:13, color:'#30363D'}}>
              No boulders yet.<br/>Tap + to log your first climb.
            </div>
          </div>
        )}
        {currentSession && currentSession.boulders.length > 0 && (
          <span style={{...C.label, marginBottom:12}}>
            {currentSession.boulders.length} BOULDER{currentSession.boulders.length !== 1 ? 'S' : ''}
          </span>
        )}
        {currentSession?.boulders.map(b => {
          const co = HOLD_COLORS.find(c=>c.name===b.color);
          const sl = statusLabel(b.status);
          return (
            <div key={b.id} style={{...C.card, marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
              <div style={{
                width:38, height:38, borderRadius:'50%', background:co?.hex||'#888', flexShrink:0,
                border:b.color==='White'?'1.5px solid #555':'none',
                boxShadow:`0 0 14px ${co?.hex||'#888'}50`
              }}/>
              <div style={{flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontWeight:700, fontSize:17, color:gradeColor(b.grade)}}>{b.grade}</span>
                  <span style={{...C.muted, fontSize:13}}>{b.color}</span>
                </div>
                <div style={{fontSize:12, marginTop:2, color:sl.color}}>{sl.text}</div>
              </div>
              <button onClick={()=>removeBoulder(b.id)} style={{
                background:'none', border:'none', color:'#30363D', cursor:'pointer',
                fontSize:20, padding:'4px 8px', lineHeight:1, borderRadius:6
              }}>×</button>
            </div>
          );
        })}
      </div>

      <div style={{position:'fixed', bottom:0, left:0, right:0, padding:'16px', background:'linear-gradient(0deg,#0D1117 65%,transparent)'}}>
        <button onClick={()=>setShowSheet(true)} style={{...C.btn, borderRadius:14, padding:'16px'}}>
          + Add Boulder
        </button>
      </div>

      {showSheet && (
        <div
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'flex-end', zIndex:100, backdropFilter:'blur(4px)'}}
          onClick={e => e.target===e.currentTarget && setShowSheet(false)}
        >
          <div style={{background:'#161B22', borderRadius:'20px 20px 0 0', width:'100%', padding:'20px 20px 44px', border:'1px solid #30363D', borderBottom:'none'}}>
            <div style={{width:36, height:4, background:'#30363D', borderRadius:2, margin:'0 auto 22px'}}/>
            <div style={{fontWeight:700, fontSize:18, marginBottom:20}}>Log a Boulder</div>

            <span style={C.label}>GRADE</span>
            <div style={{display:'flex', gap:7, overflowX:'auto', paddingBottom:12, marginBottom:20}}>
              {GRADES.map(g => (
                <button key={g} onClick={()=>setNewBoulder(p=>({...p,grade:g}))} style={{
                  flexShrink:0, padding:'8px 13px', borderRadius:20,
                  background:newBoulder.grade===g?gradeColor(g)+'33':'#1C2128',
                  color:newBoulder.grade===g?gradeColor(g):'#7D8590',
                  border:`1.5px solid ${newBoulder.grade===g?gradeColor(g)+'99':'#21262D'}`,
                  fontWeight:700, fontSize:13, cursor:'pointer', transition:'all 0.15s'
                }}>{g}</button>
              ))}
            </div>

            <span style={C.label}>HOLD COLOR</span>
            <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:20}}>
              {HOLD_COLORS.map(c => (
                <button key={c.name} onClick={()=>setNewBoulder(p=>({...p,color:c.name}))} style={{
                  width:42, height:42, borderRadius:'50%', background:c.hex, cursor:'pointer',
                  border:`3px solid ${newBoulder.color===c.name?'#FFFFFF':'transparent'}`,
                  outline:c.name==='White'?'1px solid #444':'none',
                  boxShadow:newBoulder.color===c.name?`0 0 14px #A578CC77`:'none',
                  transition:'all 0.15s'
                }} title={c.name}/>
              ))}
            </div>

            <span style={C.label}>STATUS</span>
            <div style={{display:'flex', gap:10, marginBottom:24}}>
              {([
                {label:'✓  Sent',    val:'sent'    as BoulderStatus, color:'#3FB950'},
                {label:'◌  Project', val:'project' as BoulderStatus, color:'#E05C3A'},
                {label:'★ Flashed',  val:'flashed' as BoulderStatus, color:'#b69e19'},
              ]).map(({label,val,color}) => (
                <button key={val} onClick={()=>setNewBoulder(p=>({...p,status:val}))} style={{
                  flex:1, padding:'12px', borderRadius:10,
                  background:newBoulder.status===val?color+'22':'#1C2128',
                  color:newBoulder.status===val?color:'#7D8590',
                  border:`1.5px solid ${newBoulder.status===val?color+'77':'#21262D'}`,
                  fontWeight:700, fontSize:14, cursor:'pointer', transition:'all 0.15s'
                }}>{label}</button>
              ))}
            </div>

            <button onClick={addBoulder} style={{...C.btn, borderRadius:12}}>Add Boulder</button>
          </div>
        </div>
      )}
    </div>
  );

  if (screen === 'finish') return (
    <div style={{...C.bg, padding:'52px 20px 48px'}}>
      <GlobalStyle />
      <div style={{...C.accent, fontFamily:'monospace', fontWeight:700, fontSize:11, letterSpacing:'0.14em', marginBottom:10}}>FINISH SESSION</div>
      <div style={{fontSize:26, fontWeight:700, marginBottom:4}}>Great work! 💪</div>
      <div style={{...C.muted, fontSize:15, marginBottom:28}}>Add your stats — all fields are optional.</div>

      {([
        {key:'duration', label:'Duration',           unit:'min',  placeholder:'e.g. 60'},
        {key:'avgHR',    label:'Average Heart Rate',  unit:'bpm',  placeholder:'e.g. 145'},
        {key:'maxHR',    label:'Max Heart Rate',      unit:'bpm',  placeholder:'e.g. 178'},
        {key:'calories', label:'Calories Burned',     unit:'kcal', placeholder:'e.g. 520'},
        {key:'load',     label:'Training Load',       unit:'',     placeholder:'e.g. 85'},
      ] as {key: keyof FitnessData, label:string, unit:string, placeholder:string}[]).map(({key,label,unit,placeholder}) => (
        <div key={key} style={{marginBottom:14}}>
          <span style={C.label}>{label.toUpperCase()}</span>
          <div style={{position:'relative'}}>
            <input
              type="number"
              value={fitness[key]}
              onChange={e => setFitness(p=>({...p,[key]:e.target.value}))}
              placeholder={placeholder}
              style={{
                width:'100%', background:'#161B22', border:'1px solid #30363D',
                borderRadius:10, padding:`14px ${unit?'54px':'14px'} 14px 14px`,
                color:'#E6EDF3', fontSize:16, transition:'border-color 0.2s, box-shadow 0.2s'
              }}
            />
            {unit && (
              <span style={{
                position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
                ...C.muted, fontSize:13, fontFamily:'monospace', pointerEvents:'none'
              }}>{unit}</span>
            )}
          </div>
        </div>
      ))}

      <button onClick={generateSummary} style={{...C.btn, marginTop:20, padding:'16px', fontSize:17, borderRadius:14}}>
        Generate Summary →
      </button>
    </div>
  );

  if (screen === 'summary') return (
    <div style={{...C.bg, padding:'52px 20px 48px'}}>
      <GlobalStyle />
      <div style={{...C.accent, fontFamily:'monospace', fontWeight:700, fontSize:11, letterSpacing:'0.14em', marginBottom:10}}>SESSION COMPLETE</div>
      <div style={{fontSize:26, fontWeight:700, marginBottom:4}}>Your summary is ready.</div>
      <div style={{...C.muted, fontSize:15, marginBottom:24}}>Save the image to share or keep.</div>
      {summaryImg && (
        <div style={{width:'100%', borderRadius:14, overflow:'hidden', border:'1px solid #30363D', marginBottom:20, boxShadow:'0 8px 40px rgba(0,0,0,0.6)'}}>
          <img src={summaryImg} alt="Session summary card" style={{width:'100%', display:'block'}} />
        </div>
      )}
      <button onClick={downloadImg} style={{...C.btn, borderRadius:14, padding:'16px', fontSize:17, marginBottom:12}}>
        ↓ Save Image
      </button>
      <button onClick={()=>setScreen('home')} style={{...C.btnSec, borderRadius:14, padding:'14px'}}>
        Back to Home
      </button>
    </div>
  );

  if (screen === 'detail' && selectedSession) {
    const s = selectedSession;
    const d = new Date(s.startTime);
    const mins = parseInt(s.fitness?.duration || '0') || Math.floor((s.elapsed||0)/60);
    const sentCount    = s.boulders.filter(b => b.status === 'sent').length;
    const flashedCount = s.boulders.filter(b => b.status === 'flashed').length;
    const ag = avgGrade(s.boulders);

    const handleDelete = () => {
      if (confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
        deleteSession(s.id);
      }
    };

    return (
      <div style={{...C.bg, display:'flex', flexDirection:'column', minHeight:'100vh'}}>
        <GlobalStyle />
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'52px 20px 16px', background:'#161B22', borderBottom:'1px solid #21262D',
          position:'sticky', top:0, zIndex:10, gap:12
        }}>
          <div>
            <div style={{...C.muted, fontFamily:'monospace', fontWeight:700, fontSize:10, letterSpacing:'0.14em'}}>SESSION DETAILS</div>
            <div style={{fontSize:20, fontWeight:700, marginTop:2}}>{d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button onClick={handleDelete} style={{
              background:'none', color:'#E05C3A', border:'1px solid #E05C3A44',
              borderRadius:10, padding:'10px 14px', fontWeight:700, cursor:'pointer', fontSize:13
            }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#E05C3A88'; e.currentTarget.style.backgroundColor='#E05C3A11';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#E05C3A44'; e.currentTarget.style.backgroundColor='transparent';}}>
              Delete
            </button>
            <button onClick={()=>{setSelectedSession(null); setScreen('home');}} style={{
              background:'none', color:'#7D8590', border:'1px solid #30363D',
              borderRadius:10, padding:'10px 18px', fontWeight:700, cursor:'pointer', fontSize:14
            }} onMouseEnter={e=>e.currentTarget.style.color='#E6EDF3'} onMouseLeave={e=>e.currentTarget.style.color='#7D8590'}>
              ← Back
            </button>
          </div>
        </div>

        <div style={{flex:1, padding:'24px', paddingBottom:120, overflowY:'auto'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24}}>
            <div style={{...C.card}}>
              <div style={{...C.muted, fontSize:11, fontFamily:'monospace', fontWeight:700, marginBottom:6}}>CLIMBS</div>
              <div style={{fontSize:28, fontWeight:700}}>{s.boulders.length}</div>
            </div>
            <div style={{...C.card}}>
              <div style={{...C.muted, fontSize:11, fontFamily:'monospace', fontWeight:700, marginBottom:6}}>DURATION</div>
              <div style={{fontSize:28, fontWeight:700}}>{mins} min</div>
            </div>
            <div style={{...C.card}}>
              <div style={{...C.muted, fontSize:11, fontFamily:'monospace', fontWeight:700, marginBottom:6}}>SENT</div>
              <div style={{fontSize:28, fontWeight:700, color:'#3FB950'}}>{sentCount}</div>
            </div>
            <div style={{...C.card}}>
              <div style={{...C.muted, fontSize:11, fontFamily:'monospace', fontWeight:700, marginBottom:6}}>FLASHED</div>
              <div style={{fontSize:28, fontWeight:700, color:'#b69e19'}}>{flashedCount}</div>
            </div>
            <div style={{...C.card, gridColumn:'1 / -1'}}>
              <div style={{...C.muted, fontSize:11, fontFamily:'monospace', fontWeight:700, marginBottom:6}}>AVG GRADE</div>
              <div style={{fontSize:28, fontWeight:700, color:ag?gradeColor(ag):'#7D8590'}}>{ag || '—'}</div>
            </div>
          </div>

          {s.fitness && (
            <div style={{marginBottom:24}}>
              <span style={C.label}>FITNESS METRICS</span>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                {s.fitness.avgHR    && <div style={{...C.card}}><div style={{...C.muted, fontSize:11, marginBottom:4}}>AVG HR</div><div style={{fontSize:16, fontWeight:700}}>{s.fitness.avgHR} bpm</div></div>}
                {s.fitness.maxHR    && <div style={{...C.card}}><div style={{...C.muted, fontSize:11, marginBottom:4}}>MAX HR</div><div style={{fontSize:16, fontWeight:700}}>{s.fitness.maxHR} bpm</div></div>}
                {s.fitness.calories && <div style={{...C.card}}><div style={{...C.muted, fontSize:11, marginBottom:4}}>CALORIES</div><div style={{fontSize:16, fontWeight:700}}>{s.fitness.calories} kcal</div></div>}
                {s.fitness.load     && <div style={{...C.card}}><div style={{...C.muted, fontSize:11, marginBottom:4}}>TRAINING LOAD</div><div style={{fontSize:16, fontWeight:700}}>{s.fitness.load}</div></div>}
              </div>
            </div>
          )}

          <span style={C.label}>BOULDERS LOGGED</span>
          {s.boulders.length === 0 ? (
            <div style={{textAlign:'center', padding:'40px 20px'}}>
              <div style={{fontFamily:'monospace', fontSize:13, color:'#30363D'}}>No boulders logged.</div>
            </div>
          ) : s.boulders.map(b => {
            const co = HOLD_COLORS.find(c=>c.name===b.color);
            const sl = statusLabel(b.status);
            return (
              <div key={b.id} style={{...C.card, marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
                <div style={{
                  width:38, height:38, borderRadius:'50%', background:co?.hex||'#888', flexShrink:0,
                  border:b.color==='White'?'1.5px solid #555':'none',
                  boxShadow:`0 0 14px ${co?.hex||'#888'}50`
                }}/>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontWeight:700, fontSize:17, color:gradeColor(b.grade)}}>{b.grade}</span>
                    <span style={{...C.muted, fontSize:13}}>{b.color}</span>
                  </div>
                  <div style={{fontSize:12, marginTop:2, color:sl.color}}>{sl.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}