const express = require('../lib/mini-express');
const db = require('../db/db');
const router = express.Router();

function round2(n) { return Math.round((n || 0) * 100) / 100; }

// The browser sends its UTC offset (minutes east of UTC) so "today" and the activity chart follow the
// student's own calendar day (e.g. IST), not UTC.
function tzModifier(req) {
  const n = Number(req.query.tz);
  const mins = Number.isFinite(n) ? Math.max(-840, Math.min(840, Math.round(n))) : 0;
  return { mins, mod: `${mins >= 0 ? '+' : '-'}${Math.abs(mins)} minutes` };
}

router.get('/overview', (req, res) => {
  const userId = req.user.userId;
  const { mins, mod } = tzModifier(req);
  const attempts = db.prepare(`SELECT ta.* FROM test_attempts ta WHERE ta.user_id = ? AND ta.status != 'in_progress' AND ta.test_id NOT IN (SELECT test_id FROM practice_sets)`).all(userId);
  const testsCompletedIds = new Set(attempts.map((a) => a.test_id));
  const avgScorePct = attempts.length ? round2(attempts.reduce((s,a)=>s+(a.percentage||0),0)/attempts.length) : 0;
  const avgAccuracy = attempts.length ? round2(attempts.reduce((s,a)=>s+(a.accuracy_pct||0),0)/attempts.length) : 0;
  const recent = db.prepare(`SELECT ta.*, t.name as test_name FROM test_attempts ta JOIN tests t ON ta.test_id=t.test_id WHERE ta.user_id=? AND ta.status!='in_progress' ORDER BY ta.submitted_at DESC LIMIT 10`).all(userId);
  const totalTests = db.prepare(`SELECT COUNT(*) c FROM tests WHERE test_id NOT IN (SELECT test_id FROM practice_sets)`).get().c;
  const totalScoreable = db.prepare(`SELECT COUNT(*) c FROM questions WHERE type != 'DESCRIPTIVE' AND needs_review=0 AND test_id NOT IN (SELECT test_id FROM practice_sets)`).get().c;
  const attempted = db.prepare(`SELECT COUNT(*) c FROM user_question_progress WHERE user_id=? AND first_attempted_at IS NOT NULL`).get(userId).c;
  const wrong = db.prepare(`SELECT COUNT(*) c FROM user_question_progress WHERE user_id=? AND ever_wrong=1`).get(userId).c;
  const revision = db.prepare(`SELECT COUNT(*) c FROM user_question_progress WHERE user_id=? AND revision=1`).get(userId).c;
  const today = new Date(Date.now() + mins * 60000).toISOString().slice(0,10);
  const todayAttempted = db.prepare(`SELECT COUNT(*) c FROM user_question_progress WHERE user_id=? AND first_attempted_at IS NOT NULL AND substr(datetime(first_attempted_at, ?),1,10)=?`).get(userId,mod,today).c;
  const subjectRows = db.prepare(`
    SELECT s.subject_num, s.name, COUNT(q.question_id) total,
           COUNT(CASE WHEN u.first_attempted_at IS NOT NULL THEN 1 END) attempted,
           SUM(CASE WHEN u.ever_wrong=1 THEN 1 ELSE 0 END) wrong,
           SUM(CASE WHEN u.revision=1 THEN 1 ELSE 0 END) revision,
           ROUND(CASE WHEN COUNT(CASE WHEN u.first_attempted_at IS NOT NULL THEN 1 END)=0 THEN 0 ELSE 100.0*SUM(CASE WHEN u.latest_correct=1 AND u.first_attempted_at IS NOT NULL THEN 1 ELSE 0 END)/COUNT(CASE WHEN u.first_attempted_at IS NOT NULL THEN 1 END) END,2) accuracy
    FROM subjects s JOIN tests t ON t.subject_num=s.subject_num JOIN questions q ON q.test_id=t.test_id AND q.type!='DESCRIPTIVE' AND q.needs_review=0
    LEFT JOIN user_question_progress u ON u.question_id=q.question_id AND u.user_id=?
    WHERE s.subject_num!='__practice__' AND t.test_id NOT IN (SELECT test_id FROM practice_sets)
    GROUP BY s.subject_num, s.name, s.sort_order ORDER BY s.sort_order
  `).all(userId);
  const activity = db.prepare(`
    SELECT substr(datetime(first_attempted_at, ?),1,10) day, COUNT(*) count
    FROM user_question_progress WHERE user_id=? AND first_attempted_at IS NOT NULL GROUP BY day ORDER BY day DESC LIMIT 30
  `).all(mod,userId).reverse();
  res.json({ testsCompleted: testsCompletedIds.size, totalTests, totalAttempts: attempts.length, averageScorePct: avgScorePct, averageAccuracy: avgAccuracy, recentAttempts: recent,
    pyq: { attempted, total: totalScoreable, remaining: Math.max(0,totalScoreable-attempted), wrong, revision, todayAttempted }, subjects: subjectRows, activity });
});

router.get('/subject/:subjectNum', (req,res)=>{
  const userId=req.user.userId, {subjectNum}=req.params;
  const topics=db.prepare(`SELECT t.*, te.total_marks FROM topics t JOIN tests te ON t.topic_id=te.test_id WHERE t.subject_num=? ORDER BY t.sort_order`).all(subjectNum);
  const topicStats=topics.map(topic=>{
    const attempts=db.prepare(`SELECT * FROM test_attempts WHERE user_id=? AND test_id=? AND status!='in_progress'`).all(userId,topic.topic_id);
    const coverage=db.prepare(`SELECT COUNT(*) c FROM questions q JOIN user_question_progress u ON u.question_id=q.question_id AND u.user_id=? WHERE q.test_id=? AND q.type!='DESCRIPTIVE' AND q.needs_review=0 AND u.first_attempted_at IS NOT NULL`).get(userId,topic.topic_id).c;
    const total=db.prepare(`SELECT COUNT(*) c FROM questions WHERE test_id=? AND type!='DESCRIPTIVE' AND needs_review=0`).get(topic.topic_id).c;
    if(!attempts.length) return {...topic,attempted:false,pyqAttempted:coverage,pyqTotal:total};
    return {...topic,attempted:true,attemptCount:attempts.length,averagePct:round2(avg(attempts.map(a=>a.percentage))),bestPct:round2(Math.max(...attempts.map(a=>a.percentage))),averageAccuracy:round2(avg(attempts.map(a=>a.accuracy_pct))),pyqAttempted:coverage,pyqTotal:total};
  });
  res.json({topics:topicStats});
});


router.get('/progress/bank', (req,res)=>{
  const userId=req.user.userId;
  const type=req.query.type || 'wrong';
  let condition;
  if(type==='revision') condition='u.revision=1';
  else if(type==='unattempted') condition='u.first_attempted_at IS NULL';
  else condition='u.ever_wrong=1';
  const from=`
    FROM questions q JOIN tests t ON q.test_id=t.test_id JOIN subjects s ON t.subject_num=s.subject_num
    LEFT JOIN user_question_progress u ON u.question_id=q.question_id AND u.user_id=?
    WHERE q.type!='DESCRIPTIVE' AND q.needs_review=0 AND t.test_id NOT IN (SELECT test_id FROM practice_sets) AND ${condition}`;
  const cols=`q.question_id,q.q_num,q.year,q.set_num,q.type,q.question_image_path,
           t.name test_name,s.name subject_name,u.latest_correct,COALESCE(u.ever_wrong,0) ever_wrong,COALESCE(u.revision,0) revision`;
  // Without ?limit the full list is returned (used by the exam/review screens to know the revision set).
  // The Progress Banks page passes limit/offset so a bank of ~3000 questions never renders at once.
  if(req.query.limit!==undefined){
    const limit=Math.max(1,Math.min(200,Number(req.query.limit)||50));
    const offset=Math.max(0,Number(req.query.offset)||0);
    const total=db.prepare(`SELECT COUNT(*) c ${from}`).get(userId).c;
    const rows=db.prepare(`SELECT ${cols} ${from} ORDER BY s.sort_order,t.sort_order,q.q_num LIMIT ${limit} OFFSET ${offset}`).all(userId);
    return res.json({total,rows});
  }
  const rows=db.prepare(`SELECT ${cols} ${from} ORDER BY s.sort_order,t.sort_order,q.q_num`).all(userId);
  res.json(rows);
});

router.put('/progress/:questionId/revision', (req,res)=>{
  const userId=req.user.userId, qid=req.params.questionId, revision=req.body?.revision ? 1 : 0;
  const q=db.prepare('SELECT question_id,type,needs_review FROM questions WHERE question_id=?').get(qid);
  if(!q) return res.status(404).json({error:'Question not found.'});
  if(q.type==='DESCRIPTIVE' || q.needs_review) return res.status(400).json({error:'Only scoreable questions can be added to the revision bank.'});
  const existing=db.prepare('SELECT * FROM user_question_progress WHERE user_id=? AND question_id=?').get(userId,qid);
  if(existing) db.prepare('UPDATE user_question_progress SET revision=? WHERE user_id=? AND question_id=?').run(revision,userId,qid);
  else db.prepare(`INSERT INTO user_question_progress(user_id,question_id,first_attempted_at,last_attempted_at,latest_correct,ever_wrong,revision) VALUES(?,?,NULL,NULL,NULL,0,?)`).run(userId,qid,revision);
  res.json({ok:true,revision:!!revision});
});

function avg(a){return a.reduce((x,y)=>x+y,0)/a.length;}
module.exports=router;
