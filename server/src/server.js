import { envFileLoaded } from './config/env.js';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { parseResume } from './agents/profileAgent.js';
import { buildSkillGapReport } from './agents/skillGapAgent.js';
import { generateResumeVariant } from './agents/applicationPreparationAgent.js';
import { listNotificationsForUser, recordApplicationSavedNotification, recordApplicationStatusNotification } from './services/applicationNotifications.js';
import { connectDatabase, dbState } from './config/db.js';
import { models } from './models/index.js';
import { discoverForProfile, generateProfileMatches, normalizeInternshipList } from './services/internshipFlow.js';
import { createSeedInternships } from './data/seedInternships.js';
import { makePdf } from './services/resumePdf.js';
import { newestFirst } from './utils/dateSort.js';

const app=express(), PORT=process.env.PORT||5000, SECRET=process.env.JWT_SECRET;
app.use(cors({origin:true,credentials:true})); app.use(express.json({limit:'1mb'}));
const db={users:[],profiles:[],internships:[],matches:[],versions:[],history:[],applications:[],notifications:[]};
const dbCollections={users:'users',profiles:'profiles',internships:'internships',matches:'matches',versions:'resumeVersions',history:'resumeHistory',applications:'applications',notifications:'notifications'};
let persistenceQueue=Promise.resolve();
async function loadMongoSnapshot(){
  const snapshot={};
  for(const [memoryKey,mongoKey] of Object.entries(dbCollections)){
    snapshot[memoryKey]=await models[mongoKey].find({}).lean();
  }
  snapshot.internships=snapshot.internships.length
    ?normalizeInternshipList(snapshot.internships)
    :createSeedInternships(mk);
  Object.assign(db,snapshot);
}
async function persistMongoSnapshot(){
  if(dbState.mode!=='mongo')return;
  for(const [memoryKey,mongoKey] of Object.entries(dbCollections)){
    const Model=models[mongoKey],records=db[memoryKey];
    if(records.length){
      await Model.bulkWrite(records.map(record=>({replaceOne:{filter:{_id:record._id},replacement:record,upsert:true}})),{ordered:false});
      await Model.deleteMany({_id:{$nin:records.map(record=>record._id)}});
    }else await Model.deleteMany({});
  }
}
app.use((req,res,next)=>{
  if(req.method==='GET')return next();
  res.once('finish',()=>{
    if(dbState.mode==='mongo'&&res.statusCode<400&&!res.locals.mongoPersisted){
      persistenceQueue=persistenceQueue.then(persistMongoSnapshot).catch(()=>{
        dbState.mode='memory';dbState.connected=false;
        console.warn('MongoDB became unavailable; continuing with the in-memory snapshot.');
      });
    }
  });
  next();
});
const id=()=>randomUUID(), now=()=>new Date().toISOString(), mk=x=>({_id:id(),createdAt:now(),updatedAt:now(),...x});
const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const registeringEmails=new Set();
db.internships.push(...createSeedInternships(mk));
const profile=u=>db.profiles.find(x=>x.userId===u), mine=(a,u)=>a.filter(x=>x.userId===u), job=id=>db.internships.find(x=>x._id===id);
function auth(req,res,next){try{req.user=jwt.verify((req.headers.authorization||'').replace(/^Bearer\s+/i,''),SECRET);next()}catch{return res.status(401).json({message:'Authentication required'})}}
const route=(method,path,fn)=>app[method](path,auth,async(req,res)=>{try{await fn(req,res)}catch(e){console.error(e);res.status(e.status||500).json({message:e.message||'Server error'})}});
const ranks={SAVED:0,PREPARING:1,APPLIED:2,INTERVIEW:3,OFFER:4,REJECTED:4};
const enrichApp=a=>({...a,internship:job(a.internshipId)||null});
function sync(p){return discoverForProfile(db.internships,p)}
function regenerate(u,p){const generated=generateProfileMatches(u,p,db.internships,id);db.matches=db.matches.filter(m=>m.userId!==u);db.matches.push(...generated);return generated}
app.get('/api/health',(q,s)=>s.json({status:'ok',service:'CareerPilot AI API',aiRuntime:'Ollama local inference',autoApplyEnabled:false}));
app.post('/api/auth/register',async(req,res)=>{
  const body=req.body||{},name=typeof body.name==='string'?body.name.trim():'',email=normalizeEmail(body.email),password=typeof body.password==='string'?body.password:'';
  if(!name)return res.status(400).json({message:'Name is required'});
  if(!email)return res.status(400).json({message:'Email is required'});
  if(!validEmail(email))return res.status(400).json({message:'Enter a valid email address'});
  if(!password.trim())return res.status(400).json({message:'Password is required'});
  if(password.length<8)return res.status(400).json({message:'Password must be at least 8 characters'});
  if(db.users.some(user=>normalizeEmail(user.email)===email)||registeringEmails.has(email))return res.status(409).json({message:'Email already registered'});
  registeringEmails.add(email);
  try{
    const u=mk({name,email,password:await bcrypt.hash(password,10)});
    db.users.push(u);
    const p=mk({userId:u._id,skills:[],projects:[],experience:[],education:[],preferences:{roles:[],location:'',workMode:'Any',stipendRange:''},resumeText:'',embedding:[]});
    db.profiles.push(p);
    if(dbState.mode==='mongo')try{await persistenceQueue;await persistMongoSnapshot();res.locals.mongoPersisted=true}catch{dbState.mode='memory';dbState.connected=false;console.warn('Registration could not be saved to MongoDB; continuing with the in-memory account.')}
    res.status(201).json({user:{_id:u._id,name,email:u.email},profile:p,token:jwt.sign({_id:u._id,name:u.name,email:u.email},SECRET,{expiresIn:'7d'})});
  }finally{registeringEmails.delete(email)}
});
app.post('/api/auth/login',async(req,res)=>{
  const body=req.body||{},email=normalizeEmail(body.email),password=typeof body.password==='string'?body.password:'';
  const user=validEmail(email)?db.users.find(record=>normalizeEmail(record.email)===email):null;
  if(!user||!password||!await bcrypt.compare(password,user.password))return res.status(401).json({message:'Invalid email or password'});
  res.json({user:{_id:user._id,name:user.name,email:normalizeEmail(user.email)},token:jwt.sign({_id:user._id,name:user.name,email:normalizeEmail(user.email)},SECRET,{expiresIn:'7d'})});
});
route('get','/api/auth/me',async(q,s)=>s.json({user:{_id:q.user._id,name:q.user.name,email:q.user.email}}));
route('get','/api/profile',async(q,s)=>s.json({profile:profile(q.user._id)||null}));
route('get','/api/profile/history',async(q,s)=>s.json({history:mine(db.history,q.user._id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024},fileFilter:(q,f,cb)=>cb(f.mimetype==='application/pdf'?null:Object.assign(new Error('Only PDF resumes are accepted'),{status:400}),f.mimetype==='application/pdf')});
app.post('/api/profile/upload-resume',auth,upload.single('resume'),async(q,s)=>{
  try{
    if(!q.file)return s.status(400).json({message:'Choose a PDF resume'});
    let parsed;
    try{parsed=await parseResume(q.file.buffer)}catch{return s.status(422).json({message:'Could not read this PDF. Upload a text-based PDF.'})}
    if(parsed.resumeText.length<30)return s.status(422).json({message:'Resume text is too short to parse (minimum 30 characters).'});
    const u=q.user._id,p=profile(u),matches=mine(db.matches,u).sort((a,b)=>b.score-a.score),versions=mine(db.versions,u);
    if(p?.resumeText)db.history.unshift(mk({userId:u,label:`Resume #${db.history.filter(h=>h.userId===u).length+1}`,skills:p.skills,summary:p.resumeText.slice(0,220),topMatches:matches.slice(0,3).map(m=>({title:job(m.internshipId)?.title,company:job(m.internshipId)?.company,score:m.score})),matchCount:matches.length,highMatchCount:matches.filter(m=>m.score>=70).length,resumeVersionCount:versions.length,supersededAt:now()}));
    const next={...(p||mk({userId:u})),skills:parsed.skills,projects:parsed.projects,experience:parsed.experience,education:parsed.education,resumeText:parsed.resumeText,embedding:parsed.embedding,summary:parsed.summary,updatedAt:now()};
    if(p)Object.assign(p,next);else db.profiles.push(next);
    db.matches=db.matches.filter(x=>x.userId!==u);db.versions=db.versions.filter(x=>x.userId!==u);
    try{sync(next)}catch(e){console.warn('Discovery re-sync failed',e.message)}
    s.json({profile:next,summary:next.summary,pipelineReset:true});
  }catch(e){s.status(e.status||500).json({message:e.message})}
});
route('patch','/api/profile/preferences',async(q,s)=>{const p=profile(q.user._id);if(!p)return s.status(404).json({message:'Profile not found'});p.preferences={...p.preferences,...q.body,roles:Array.isArray(q.body.roles)?q.body.roles:String(q.body.roles||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean)};s.json({profile:p})});
route('get','/api/internships',async(q,s)=>{const visible=sync(profile(q.user._id));s.json({internships:visible.map(j=>({...j,match:mine(db.matches,q.user._id).find(m=>m.internshipId===j._id)||null})).sort((a,b)=>b.postedDate.localeCompare(a.postedDate))})});
route('post','/api/internships/sync',async(q,s)=>{const internships=sync(profile(q.user._id));s.json({count:internships.length,internships})});
route('post','/api/matches/generate',async(q,s)=>{const p=profile(q.user._id);if(!p?.resumeText)return s.status(400).json({message:'Upload a resume first'});const visible=sync(p),matches=regenerate(q.user._id,p),allowed=new Set(visible.map(j=>j._id));s.json({matches:matches.filter(m=>allowed.has(m.internshipId))})});
route('get','/api/matches',async(q,s)=>s.json({matches:mine(db.matches,q.user._id).map(m=>({...m,internship:job(m.internshipId)})).sort((a,b)=>b.score-a.score)}));
route('get','/api/skill-gaps/:internshipId',async(q,s)=>{
  const match=mine(db.matches,q.user._id).find(x=>x.internshipId===q.params.internshipId);
  if(!match)return s.status(404).json({message:'Generate matches for this internship to see a skill-gap plan'});
  const p=profile(q.user._id),j=job(q.params.internshipId);
  if(!p?.resumeText)return s.status(400).json({message:'Upload a resume before generating a skill-gap plan'});
  if(!j)return s.status(404).json({message:'Internship not found'});
  try{s.json(buildSkillGapReport(match,p,j))}
  catch(e){console.error('Skill-gap report validation failed:',e.message);s.status(500).json({message:'Could not build a skill-gap plan from the saved profile and internship requirements'})}
});
route('get','/api/application-materials',async(q,s)=>s.json({resumeVersions:mine(db.versions,q.user._id).sort(newestFirst)}));
route('post','/api/application-materials/generate',async(q,s)=>{const p=profile(q.user._id),j=job(q.body.internshipId);if(!p?.resumeText)return s.status(400).json({message:'Upload a resume first'});if(!j)return s.status(404).json({message:'Internship not found'});const tailored=generateResumeVariant(p,j),v=mk({userId:q.user._id,internshipId:j._id,...tailored});db.versions.unshift(v);let a=mine(db.applications,q.user._id).find(x=>x.internshipId===j._id);if(!a)db.applications.push(mk({userId:q.user._id,internshipId:j._id,status:'PREPARING',notes:''}));else if(ranks[a.status]<1)a.status='PREPARING';s.status(201).json({resumeVersion:v})});
route('post','/api/application-materials/approve',async(q,s)=>{const v=mine(db.versions,q.user._id).find(x=>x._id===q.body.resumeVersionId);if(!v)return s.status(404).json({message:'Resume version not found'});v.approved=true;s.json({resumeVersion:v})});

route('get','/api/application-materials/:id/pdf',async(q,s)=>{const v=mine(db.versions,q.user._id).find(x=>x._id===q.params.id);if(!v)return s.status(404).json({message:'Resume version not found'});s.type('application/pdf').set('Content-Disposition','inline; filename="careerpilot-resume.pdf"').send(makePdf(v.content))});
route('post','/api/applications',async(q,s)=>{const j=job(q.body.internshipId),u=q.user._id,status=q.body.status||'SAVED';if(!j)return s.status(404).json({message:'Internship not found'});if(!(status in ranks))return s.status(400).json({message:'Invalid application status'});let a=mine(db.applications,u).find(x=>x.internshipId===j._id);if(!a){a=mk({userId:u,internshipId:j._id,status,notes:q.body.notes||'',nextActionDate:q.body.nextActionDate||'',...(status==='APPLIED'?{appliedAt:now()}:{})});db.applications.push(a);recordApplicationSavedNotification({notifications:db.notifications,userId:u,application:a,internship:j,createRecord:mk});recordApplicationStatusNotification({notifications:db.notifications,userId:u,application:a,internship:j,previousStatus:null,nextStatus:status,createRecord:mk})}else if(ranks[status]>ranks[a.status]){const previousStatus=a.status;a.status=status;if(status==='APPLIED'&&!a.appliedAt)a.appliedAt=now();recordApplicationStatusNotification({notifications:db.notifications,userId:u,application:a,internship:j,previousStatus,nextStatus:status,createRecord:mk})}s.json({application:enrichApp(a)})});
route('get','/api/applications',async(q,s)=>s.json({applications:mine(db.applications,q.user._id).map(enrichApp)}));
route('patch','/api/applications/:id',async(q,s)=>{const a=mine(db.applications,q.user._id).find(x=>x._id===q.params.id);if(!a)return s.status(404).json({message:'Application not found'});if(q.body.status!==undefined&&!(q.body.status in ranks))return s.status(400).json({message:'Invalid application status'});const previousStatus=a.status;if(q.body.status!==undefined)a.status=q.body.status;if(q.body.nextActionDate!==undefined)a.nextActionDate=q.body.nextActionDate;if(q.body.notes!==undefined)a.notes=q.body.notes;if(a.status==='APPLIED'&&!a.appliedAt)a.appliedAt=now();if(previousStatus!==a.status)recordApplicationStatusNotification({notifications:db.notifications,userId:q.user._id,application:a,internship:job(a.internshipId),previousStatus,nextStatus:a.status,createRecord:mk});a.updatedAt=now();s.json({application:enrichApp(a)})});
route('delete','/api/applications/:id',async(q,s)=>{const i=db.applications.findIndex(x=>x._id===q.params.id&&x.userId===q.user._id);if(i<0)return s.status(404).json({message:'Application not found'});const[a]=db.applications.splice(i,1);s.json({success:true,id:a._id})});
route('get','/api/notifications',async(q,s)=>s.json({notifications:listNotificationsForUser(db.notifications,q.user._id)}));
route('patch','/api/notifications/:id/read',async(q,s)=>{const n=mine(db.notifications,q.user._id).find(x=>x._id===q.params.id);if(!n)return s.status(404).json({message:'Notification not found'});n.read=true;s.json({notification:n})});
route('get','/api/analytics',async(q,s)=>{const apps=mine(db.applications,q.user._id),matches=mine(db.matches,q.user._id),total=apps.length,progressed=apps.filter(a=>['INTERVIEW','OFFER'].includes(a.status)).length,offers=apps.filter(a=>a.status==='OFFER').length,applied=apps.filter(a=>['APPLIED','INTERVIEW','OFFER','REJECTED'].includes(a.status)),scores=applied.map(a=>matches.find(m=>m.internshipId===a.internshipId)?.score).filter(x=>x!=null),counts={};for(const m of matches)for(const skill of m.matchedSkills)counts[skill]=(counts[skill]||0)+1;s.json({analytics:{totalApplications:total,interviewRate:total?Math.round(progressed/total*100):0,offerRate:total?Math.round(offers/total*100):0,matchScoreEffectiveness:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0,topPerformingSkills:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([skill,count])=>({skill,count})),recommendationNote:scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length>=70?'Your applications are well aligned with your profile. Keep building on this momentum.':'Prioritize roles with stronger skill alignment and address recurring gaps.'):'Track a few applications to unlock personalized recommendations.'}})});
app.use((err,q,s,next)=>s.status(err.status||400).json({message:err.message||'Request failed'}));
async function seedDemo(){
  if(db.users.some(x=>x.email==='demo@careerpilot.ai'))return;
  const u=mk({name:'Demo Candidate',email:'demo@careerpilot.ai',password:await bcrypt.hash('Password@123',10)});db.users.push(u);
  db.profiles.push(mk({userId:u._id,skills:['javascript','react','node.js','mongodb','git','html','communication','problem solving'],projects:['Built a responsive React portfolio and job tracker.'],experience:['Developed full-stack features with Node.js and MongoDB.'],education:['Computer Science undergraduate'],preferences:{roles:['frontend','mern','ai product'],location:'Remote',workMode:'Remote',stipendRange:''},resumeText:'Demo Candidate\nSoftware Developer\nEmail: demo@careerpilot.ai\nSkills: javascript, react, node.js, mongodb, git, html, communication, problem solving\nProjects: Built a responsive React portfolio and job tracker.\nExperience: Developed full-stack features with Node.js and MongoDB.\nEducation: Computer Science undergraduate. I seek an internship to apply my experience and keep learning.'}));
}
async function startServer(){
  if(typeof SECRET!=='string'||!SECRET.trim()){
    console.error('Startup blocked: JWT_SECRET must be configured in the environment.');
    process.exitCode=1;
    return;
  }
  if(envFileLoaded)console.info('Environment file loaded from server/.env.');
  const connected=await connectDatabase();
  if(connected){try{await loadMongoSnapshot()}catch{dbState.mode='memory';dbState.connected=false;console.warn('MongoDB data could not be loaded; continuing with the in-memory snapshot.')}}
  if(process.env.NODE_ENV!=='production'&&process.env.ENABLE_DEMO_SEED==='true')await seedDemo();
  if(dbState.mode==='mongo')await persistMongoSnapshot().catch(()=>{dbState.mode='memory';dbState.connected=false;console.warn('MongoDB initialization failed; continuing with in-memory storage.')});
  const server=app.listen(PORT,()=>console.log(`CareerPilot API listening on http://localhost:${PORT}`));
  const shutdown=()=>server.close(()=>process.exit(0));
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
startServer().catch(()=>{dbState.mode='memory';dbState.connected=false;console.warn('Database initialization failed; starting in-memory mode.');app.listen(PORT,()=>console.log(`CareerPilot API listening on http://localhost:${PORT}`))});
