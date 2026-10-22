import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface SubjectProgress { subject_num:string; name:string; total:number; attempted:number; wrong:number; revision:number; accuracy:number; }
interface Overview {
  testsCompleted:number; totalTests:number; totalAttempts:number; averageScorePct:number; averageAccuracy:number;
  recentAttempts:Array<{attempt_id:string;test_name:string;score:number;max_score:number;percentage:number;submitted_at:string}>;
  pyq:{attempted:number;total:number;remaining:number;wrong:number;revision:number;todayAttempted:number};
  subjects:SubjectProgress[];
  activity:Array<{day:string;count:number}>;
}

export default function Dashboard(){
  const {user}=useAuth(); const navigate=useNavigate();
  const [overview,setOverview]=useState<Overview|null>(null); const [inProgress,setInProgress]=useState<any[]>([]);
  const [dailyTarget,setDailyTarget]=useState(()=>Number(localStorage.getItem('pyqDailyTarget')||25));
  const [starting,setStarting]=useState('');
  const load=()=>{ api.get(`/api/analytics/overview?tz=${-new Date().getTimezoneOffset()}`).then(setOverview).catch(()=>{}); api.get('/api/attempts-in-progress').then(setInProgress).catch(()=>{}); };
  useEffect(load,[]);
  async function practice(mode:'random'|'unattempted'|'wrong'|'revision',subjectNum?:string,count=20){
    setStarting(`${mode}-${subjectNum||'all'}`);
    try { const d=await api.post('/api/practice',{mode,subjectNum:subjectNum||'',count}); navigate(`/exam/${d.attemptId}`); }
    catch(e){ alert(e instanceof Error?e.message:'Could not start practice.'); }
    finally{setStarting('');}
  }
  const pct=overview?.pyq.total?Math.round(overview.pyq.attempted/overview.pyq.total*1000)/10:0;
  const target=Number.isFinite(dailyTarget)&&dailyTarget>0?dailyTarget:25;
  const todayPct=Math.min(100,Math.round((overview?.pyq.todayAttempted||0)/target*100));
  return <div>
    <h1 className="font-display text-2xl font-semibold mb-1">Welcome, {user?.displayName||user?.email}</h1>
    <p className="text-slate dark:text-slate-dim mb-8">Your GATE PYQ practice dashboard</p>

    {inProgress.length>0&&<div className="mb-8 space-y-2">{inProgress.map(a=><Link key={a.attempt_id} to={`/exam/${a.attempt_id}`} className="block card p-4 border-amber bg-amber-tint dark:bg-amber-dim/10"><p className="font-medium text-sm">Resume: {a.test_name}</p><p className="text-xs text-slate dark:text-slate-dim mt-0.5">You have a test in progress — click to continue</p></Link>)}</div>}

    <section className="card p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4"><div><p className="text-xs uppercase tracking-wide font-mono text-slate dark:text-slate-dim">Total PYQ Coverage</p><p className="font-display text-4xl font-semibold mt-1">{overview?`${overview.pyq.attempted} / ${overview.pyq.total}`:'—'}</p><p className="text-sm text-slate dark:text-slate-dim mt-1">{pct}% completed · {overview?.pyq.remaining??'—'} remaining</p></div><div className="text-right text-xs font-mono text-slate dark:text-slate-dim">{overview?.pyq.total??'—'} scoreable PYQs tracked</div></div>
      <div className="h-3 rounded-bubble bg-paper-2 dark:bg-graphite-2 overflow-hidden"><div className="h-full bg-teal transition-all" style={{width:`${pct}%`}} /></div>
    </section>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <StatCard label="Attempted" value={overview?.pyq.attempted??'—'} />
      <StatCard label="Remaining" value={overview?.pyq.remaining??'—'} />
      <StatCard label="Wrong PYQs" value={overview?.pyq.wrong??'—'} />
      <StatCard label="Revision" value={overview?.pyq.revision??'—'} />
    </div>

    <section className="card p-5 mb-8">
      <div className="flex items-center justify-between gap-4 mb-4"><div><h2 className="font-display font-semibold">Today’s PYQ Target</h2><p className="text-xs text-slate dark:text-slate-dim mt-1">Counts only new unique PYQs first attempted today.</p></div><div className="flex items-center gap-2"><input type="number" min="1" value={dailyTarget} onChange={e=>{const v=Math.max(1,Number(e.target.value)||1);setDailyTarget(v);localStorage.setItem('pyqDailyTarget',String(v));}} className="input w-20 text-center"/><span className="text-xs text-slate dark:text-slate-dim">/ day</span></div></div>
      <div className="flex items-center gap-3"><div className="flex-1 h-2 rounded-bubble bg-paper-2 dark:bg-graphite-2 overflow-hidden"><div className="h-full bg-amber" style={{width:`${todayPct}%`}}/></div><span className="font-mono text-sm font-semibold">{overview?.pyq.todayAttempted??0}/{target}</span></div>
    </section>

    <section className="mb-10"><div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold text-lg">Practice</h2><Link to="/progress?type=unattempted" className="text-xs text-amber-dim font-medium">View progress banks →</Link></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <PracticeButton label="Random 20" sub="Any subject" busy={starting==='random-all'} onClick={()=>practice('random',undefined,20)}/>
      <PracticeButton label="Unattempted" sub={`${overview?.pyq.remaining??'—'} remaining`} busy={starting==='unattempted-all'} onClick={()=>practice('unattempted',undefined,20)}/>
      <PracticeButton label="Wrong PYQs" sub={`${overview?.pyq.wrong??'—'} available`} busy={starting==='wrong-all'} onClick={()=>practice('wrong',undefined,20)}/>
      <PracticeButton label="Revision" sub={`${overview?.pyq.revision??'—'} saved`} busy={starting==='revision-all'} onClick={()=>practice('revision',undefined,20)}/>
    </div></section>

    <section className="mb-10"><div className="flex items-center justify-between mb-3"><h2 className="font-display font-semibold text-lg">Subject Progress</h2><Link to="/analytics" className="text-xs text-amber-dim font-medium">Detailed analytics →</Link></div><div className="card divide-y divide-mist dark:divide-graphite-2">{overview?.subjects.map(s=>{const p=s.total?Math.round(s.attempted/s.total*1000)/10:0;return <div key={s.subject_num} className="px-5 py-4"><div className="flex items-center justify-between gap-4 mb-2"><Link to={`/library?subject=${encodeURIComponent(s.subject_num)}`} className="text-sm font-medium hover:text-amber">{s.name}</Link><span className="font-mono text-xs text-slate dark:text-slate-dim">{s.attempted} / {s.total} · {p}%</span></div><div className="flex items-center gap-3"><div className="flex-1 h-2 rounded-bubble bg-paper-2 dark:bg-graphite-2 overflow-hidden"><div className="h-full bg-teal" style={{width:`${p}%`}}/></div><button onClick={()=>practice('unattempted',s.subject_num,20)} className="text-xs text-amber-dim hover:underline">Practice</button></div></div>})}</div></section>

    <section className="card p-5 mb-10"><h2 className="font-display font-semibold mb-4">PYQ Activity</h2><ActivityChart activity={overview?.activity||[]}/></section>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10"><StatCard label="Topics Completed" value={overview?`${overview.testsCompleted}/${overview.totalTests}`:'—'}/><StatCard label="Test Attempts" value={overview?.totalAttempts??'—'}/><StatCard label="Average Score" value={overview?`${overview.averageScorePct}%`:'—'}/><StatCard label="Average Accuracy" value={overview?`${overview.averageAccuracy}%`:'—'}/></div>

    <Link to="/library" className="block card p-5 hover:border-amber transition-colors mb-10 max-w-sm"><p className="font-display font-semibold">Browse Test Library</p><p className="text-sm text-slate dark:text-slate-dim mt-1">Practice PYQs by subject and topic</p></Link>
    <h2 className="font-display font-semibold text-lg mb-3">Recent Attempts</h2>
    {overview&&overview.recentAttempts.length>0?<div className="card divide-y divide-mist dark:divide-graphite-2">{overview.recentAttempts.map(a=><Link key={a.attempt_id} to={`/results/${a.attempt_id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-paper-2 dark:hover:bg-graphite-2"><div><p className="text-sm font-medium">{a.test_name}</p><p className="text-xs text-slate dark:text-slate-dim mt-0.5">{new Date(a.submitted_at).toLocaleString()}</p></div><span className={`font-mono text-sm ${a.percentage>=50?'text-teal-dim':'text-rose-dim'}`}>{a.score}/{a.max_score}</span></Link>)}</div>:<p className="text-sm text-slate dark:text-slate-dim">No attempts yet — start a test from the library.</p>}
  </div>
}
function StatCard({label,value}:{label:string;value:string|number}){return <div className="card p-4"><p className="text-xs uppercase tracking-wide text-slate dark:text-slate-dim font-mono">{label}</p><p className="font-display text-2xl font-semibold mt-1.5">{value}</p></div>}
function PracticeButton({label,sub,busy,onClick}:{label:string;sub:string;busy:boolean;onClick:()=>void}){return <button onClick={onClick} disabled={busy} className="card p-4 text-left hover:border-amber transition-colors disabled:opacity-60"><p className="font-display font-semibold text-sm">{busy?'Starting…':label}</p><p className="text-xs text-slate dark:text-slate-dim mt-1">{sub}</p></button>}
function ActivityChart({activity}:{activity:Array<{day:string;count:number}>}){const max=Math.max(1,...activity.map(a=>a.count));return <div className="flex items-end gap-1 h-28">{activity.length===0?<p className="text-sm text-slate dark:text-slate-dim">No activity yet.</p>:activity.map(a=><div key={a.day} title={`${a.day}: ${a.count} new PYQs`} className="flex-1 max-w-[28px] h-full flex items-end"><div className="w-full bg-teal rounded-t" style={{height:`${Math.max(4,a.count/max*100)}%`}}/></div>)}</div>}
