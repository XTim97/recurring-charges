'use strict';
const KEY = 'recurring-charges-tracker-v1';
const REMINDER_DAYS = [0,1,2,3,5,7,14,30];
const FREQUENCIES = {weekly:'Weekly',biweekly:'Every 2 weeks',monthly:'Monthly',quarterly:'Every 3 months',semiannual:'Every 6 months',yearly:'Yearly',custom:'Custom'};
let charges = []; // Cloud data only; old local test entries are not imported.
let cloudClient=null, cloudUser=null, cloudLoading=false;
let selectedId = null;
let editingId = null;
let priorView = 'list';
const $ = id => document.getElementById(id);
const localToday = () => { const d = new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function parseDate(date){const [y,m,d]=date.split('-').map(Number);return new Date(y,m-1,d,12,0,0,0);}
function formatDate(date){return parseDate(date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});}
function addMonthsAnchored(date,months){const orig=parseDate(date);const target=new Date(orig.getFullYear(),orig.getMonth()+months,1,12);const max=new Date(target.getFullYear(),target.getMonth()+1,0,12).getDate();target.setDate(Math.min(orig.getDate(),max));return isoLocal(target);}
function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function frequencyLabel(charge){
 if(charge.frequency!=='custom')return FREQUENCIES[charge.frequency];
 const n=charge.customInterval,unit=charge.customUnit;
 return `Every ${n} ${unit.replace(/s$/, '')}${n===1?'':'s'}`;
}
function nextDue(charge){
 const anchor=charge.dueDate;const today=localToday();if(anchor>=today)return anchor;
 if(charge.frequency==='weekly'||charge.frequency==='biweekly'||(charge.frequency==='custom'&&['days','weeks'].includes(charge.customUnit))){
  const every=charge.frequency==='weekly'?7:charge.frequency==='biweekly'?14:charge.customInterval*(charge.customUnit==='weeks'?7:1);
  const utcDay=s=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};const days=utcDay(today)-utcDay(anchor);
  const n=Math.ceil(days/every);const d=parseDate(anchor);d.setDate(d.getDate()+n*every);return isoLocal(d);
 }
 const step=charge.frequency==='custom' ? charge.customInterval*(charge.customUnit==='years'?12:1) : {monthly:1,quarterly:3,semiannual:6,yearly:12}[charge.frequency];
 if(!step)return anchor;
 const a=parseDate(anchor),t=parseDate(today);
 let n=Math.max(0,Math.floor(((t.getFullYear()-a.getFullYear())*12+(t.getMonth()-a.getMonth()))/step));
 let candidate=addMonthsAnchored(anchor,n*step);
 while(candidate<today){n++;candidate=addMonthsAnchored(anchor,n*step);}
 return candidate;
}
function cleanCharge(x){
 if(!x||typeof x!=='object')return null;
 const name=String(x.name||'').trim().slice(0,90),source=String(x.source||'').trim().slice(0,120),dueDate=String(x.dueDate||'');
 const amount=Number(x.amount);const frequency=String(x.frequency||'');
 const customInterval=Number(x.customInterval??1),customUnit=String(x.customUnit||'months');
 if(frequency==='custom'&&(!Number.isInteger(customInterval)||customInterval<1||customInterval>999||!['days','weeks','months','years'].includes(customUnit)))return null;
 if(!name||!source||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(amount)||amount<0||amount>99999999.99||!FREQUENCIES[frequency])return null;
 const d=parseDate(dueDate);if(Number.isNaN(d.getTime())||isoLocal(d)!==dueDate)return null;
 return {id:typeof x.id==='string'&&x.id?x.id:createId(),name,amount:Math.round(amount*100)/100,dueDate,frequency,customInterval:frequency==='custom'?customInterval:1,customUnit:frequency==='custom'?customUnit:'months',source,notes:String(x.notes||'').slice(0,1500),notifyEnabled:x.notifyEnabled===true,notifyDays:REMINDER_DAYS.includes(Number(x.notifyDays))?Number(x.notifyDays):3};
}
function createId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function loadCharges(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(raw)?raw.map(cleanCharge).filter(Boolean):[];}catch{return [];}}
async function saveCharges(){
 if(!cloudClient||!cloudUser){alert('Sign in to save charges to the cloud.');return false;}
 const {error}=await cloudClient.from('recurring_charge_lists').upsert({user_id:cloudUser.id,charges:charges,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error){alert('Could not synchronize this change: '+error.message);return false;}
 setSyncStatus('Saved and synchronized');return true;
}
function show(view){
 for(const v of ['list','detail','form']){
  const panel=$(v+'-view');
  const visible=v===view;
  panel.hidden=!visible;
  panel.style.display=visible?'':'none';
 }
 window.scrollTo(0,0);
}
function returnToCharges(){
 selectedId=null;
 editingId=null;
 priorView='list';
 renderList();
 show('list');
}
function money(amount){return amount.toLocaleString('en-US',{style:'currency',currency:'USD'});}
function renderList(){const list=$('charges-list');list.replaceChildren();$('empty-message').hidden=charges.length!==0;
 for(const c of [...charges].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))){
  const button=document.createElement('button');button.type='button';button.className='charge-button';
  const main=document.createElement('span');main.className='charge-main';const name=document.createElement('span');name.className='charge-name';name.textContent=c.name;
  const date=document.createElement('span');date.className='charge-date';date.textContent='Next due: '+formatDate(nextDue(c));main.append(name,date);
  const arrow=document.createElement('span');arrow.className='chevron';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');button.append(main,arrow);
  button.addEventListener('click',()=>openDetail(c.id));list.append(button);
 }
}
function openDetail(id){if(!cloudUser)return;const c=charges.find(x=>x.id===id);if(!c){show('list');return;}selectedId=id;$('detail-title').textContent=c.name;
 const parent=$('detail-fields');parent.replaceChildren();for(const [label,value] of [['Amount',money(c.amount)],['Next due date',formatDate(nextDue(c))],['Frequency',frequencyLabel(c)],['Payment source',c.source],...(c.notes?[['Notes',c.notes]]:[])]){
 const row=document.createElement('div');row.className='detail-row';const lab=document.createElement('span');lab.className='detail-label';lab.textContent=label;const val=document.createElement('span');val.className='detail-value';val.textContent=value;row.append(lab,val);parent.append(row);
 }renderNotificationSettings(c);show('detail');}
function renderNotificationSettings(c){
 $('notify-enabled').checked=c.notifyEnabled===true;
 $('notify-days').value=String(c.notifyDays??3);
 $('notification-options').hidden=!c.notifyEnabled;
 $('notification-status').textContent='';
}
async function updateNotificationSettings(){
 const c=charges.find(x=>x.id===selectedId);if(!c)return;
 const oldEnabled=c.notifyEnabled,oldDays=c.notifyDays;
 c.notifyEnabled=$('notify-enabled').checked;
 c.notifyDays=Number($('notify-days').value);
 if(!(await saveCharges())){
  c.notifyEnabled=oldEnabled;c.notifyDays=oldDays;
  renderNotificationSettings(c);return;
 }
 $('notification-options').hidden=!c.notifyEnabled;
 $('notification-status').textContent='Reminder preference saved and synchronized.';
}
$('notify-enabled').addEventListener('change',updateNotificationSettings);
$('notify-days').addEventListener('change',updateNotificationSettings);
function refreshSources(){const list=$('saved-sources');list.replaceChildren();for(const source of [...new Set(charges.map(c=>c.source))].sort()){const opt=document.createElement('option');opt.value=source;list.append(opt);}}
function openForm(id=null){if(!cloudUser){alert('Please sign in first.');return;}editingId=id;priorView=id?'detail':'list';const c=charges.find(x=>x.id===id);$('form-title').textContent=c?'Edit Charge':'Add Charge';$('save-button').textContent=c?'Update Charge':'Save Charge';$('charge-name').value=c?.name||'';$('charge-amount').value=c?.amount??'';$('charge-due').value=c?.dueDate||localToday();$('charge-frequency').value=c?.frequency||'monthly';$('custom-interval').value=c?.customInterval||1;$('custom-unit').value=c?.customUnit||'months';updateCustomFields();$('charge-source').value=c?.source||'';$('charge-notes').value=c?.notes||'';refreshSources();show('form');$('charge-name').focus({preventScroll:true});}
function updateCustomFields(){
 const custom=$('charge-frequency').value==='custom';
 $('custom-frequency-fields').hidden=!custom;
 $('custom-interval').required=custom;
 $('custom-unit').required=custom;
}
$('charge-frequency').addEventListener('change',updateCustomFields);
function backFromForm(){if(priorView==='detail'&&selectedId)openDetail(selectedId);else{renderList();show('list');}}
$('add-button').addEventListener('click',()=>openForm());$('detail-back').addEventListener('click',()=>{renderList();show('list');});$('form-back').addEventListener('click',backFromForm);$('cancel-button').addEventListener('click',backFromForm);$('edit-button').addEventListener('click',()=>openForm(selectedId));
$('charge-form').addEventListener('submit',async ev=>{ev.preventDefault();const proposed=cleanCharge({id:editingId||createId(),name:$('charge-name').value,amount:$('charge-amount').value,dueDate:$('charge-due').value,frequency:$('charge-frequency').value,customInterval:$('custom-interval').value,customUnit:$('custom-unit').value,source:$('charge-source').value,notes:$('charge-notes').value,notifyEnabled:editingId?charges.find(c=>c.id===editingId)?.notifyEnabled:false,notifyDays:editingId?charges.find(c=>c.id===editingId)?.notifyDays:3});if(!proposed){alert('Please enter a valid name, amount, due date, frequency, and payment source.');return;}
 const before=[...charges];if(editingId){charges=charges.map(c=>c.id===editingId?proposed:c);}else{charges.push(proposed);}if(!(await saveCharges())){charges=before;return;}returnToCharges();
});
$('delete-button').addEventListener('click',async()=>{const c=charges.find(x=>x.id===selectedId);if(!c)return;$('confirm-message').textContent=`Remove “${c.name}” from your recurring charges? This cannot be undone.`;const dlg=$('confirm-dialog');dlg.returnValue='cancel';dlg.showModal();});
$('confirm-dialog').addEventListener('close',async ()=>{if($('confirm-dialog').returnValue!=='delete')return;const before=[...charges];charges=charges.filter(c=>c.id!==selectedId);if(!(await saveCharges())){charges=before;return;}selectedId=null;renderList();show('list');});
$('export-button').addEventListener('click',()=>{const data=JSON.stringify({app:'Recurring Charges Tracker',version:1,exportedAt:new Date().toISOString(),charges},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`recurring-charges-backup-${localToday()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);});
$('import-button').addEventListener('click',()=>$('import-file').click());$('import-file').addEventListener('change',async ev=>{if(!cloudUser){alert('Sign in to import charges.');return;}const file=ev.target.files[0];ev.target.value='';if(!file)return;try{if(file.size>5_000_000)throw Error('Backup file is too large.');const data=JSON.parse(await file.text());if(data.app!=='Recurring Charges Tracker'||!Array.isArray(data.charges))throw Error('This is not a valid Recurring Charges backup.');const items=data.charges.map(cleanCharge);if(items.some(x=>!x))throw Error('Some charges in this file are invalid.');if(!confirm(`Import ${items.length} charges? This replaces all ${charges.length} charges currently on this device.`))return;const before=charges;charges=items.map((c,i)=>({...c,id:createId()}));if(!(await saveCharges())){charges=before;return;}renderList();show('list');alert('Your charges were imported successfully.');}catch(e){alert('Unable to import: '+e.message);}});

// Supabase cloud synchronization. Local test entries are intentionally ignored.
const CONFIG = window.RECURRING_SUPABASE_CONFIG || {};
const setSyncStatus = msg => { const el=$('sync-status'); if(el)el.textContent=msg; };
function toggleSignedIn(signedIn){
 $('auth-panel').hidden=signedIn;
 $('sync-panel').hidden=!signedIn;
 $('charges-area').hidden=!signedIn;
 $('add-button').disabled=!signedIn;
}
async function refreshCloud(){
 if(!cloudClient||!cloudUser||cloudLoading)return;
 cloudLoading=true;setSyncStatus('Synchronizing…');
 try{
  const {data,error}=await cloudClient.from('recurring_charge_lists').select('charges').eq('user_id',cloudUser.id).maybeSingle();
  if(error)throw error;
  // Brand new users begin with an empty list; do not import old sample entries.
  if(!data){
   const {error:insertError}=await cloudClient.from('recurring_charge_lists').upsert({user_id:cloudUser.id,charges:[]},{onConflict:'user_id',ignoreDuplicates:true});
   if(insertError)throw insertError;
   charges=[];
  }else if(Array.isArray(data.charges)){
   charges=data.charges.map(cleanCharge).filter(Boolean);
  }else throw Error('Unexpected data format from Supabase');
  renderList();if(!selectedId)show('list');
  setSyncStatus('Synchronized with Supabase');
 }catch(err){setSyncStatus('Sync failed: '+err.message);}
 finally{cloudLoading=false;}
}
async function handleSession(session){
 const user=session?.user||null;
 if(user?.id===cloudUser?.id)return;
 cloudUser=user;charges=[];selectedId=null;editingId=null;
 toggleSignedIn(!!user);renderList();show('list');
 if(user){$('account-email').textContent=user.email||'Signed in';await refreshCloud();}
 else setSyncStatus('Sign in to sync across devices');
}
async function initCloud(){
 toggleSignedIn(false);
 const url=String(CONFIG.url||'').trim();
 const key=String(CONFIG.publishableKey||'').trim();
 if(!url||!key||url.includes('YOUR_PROJECT')||key.includes('YOUR_')){
  $('auth-message').textContent='Cloud sync needs one-time Supabase configuration. Follow SETUP_SYNC.txt in the ZIP.';
  $('auth-controls').hidden=true;return;
 }
 if(!window.supabase?.createClient){$('auth-message').textContent='Cannot load Supabase library. Check internet connection and refresh.';return;}
 cloudClient=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 cloudClient.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleSession(session),0);});
 const {data,error}=await cloudClient.auth.getSession();
 if(error){$('auth-message').textContent=error.message;return;}
 await handleSession(data.session);
}
$('auth-form').addEventListener('submit',async ev=>{
 ev.preventDefault();if(!cloudClient)return;
 const email=$('auth-email').value.trim(),password=$('auth-password').value;
 if(!email||password.length<6){$('auth-message').textContent='Enter an email and password of at least 6 characters.';return;}
 $('auth-message').textContent='Signing in…';
 const {error}=await cloudClient.auth.signInWithPassword({email,password});
 $('auth-message').textContent=error?error.message:'Signed in.';
});
$('register-button').addEventListener('click',async()=>{
 if(!cloudClient)return;
 const email=$('auth-email').value.trim(),password=$('auth-password').value;
 if(!email||password.length<6){$('auth-message').textContent='Enter an email and password of at least 6 characters.';return;}
 $('auth-message').textContent='Creating account…';
 const {data,error}=await cloudClient.auth.signUp({email,password});
 $('auth-message').textContent=error?error.message:(data.session?'Account created and signed in.':'Account created. Check your email for a confirmation link, then sign in.');
});
$('signout-button').addEventListener('click',async()=>{
 if(cloudClient){const {error}=await cloudClient.auth.signOut();if(error)alert(error.message);else await handleSession(null);}
});
$('sync-button').addEventListener('click',refreshCloud);
window.addEventListener('focus',()=>{if(cloudUser&&!cloudLoading&&$('list-view').hidden===false)refreshCloud();});
renderList();show('list');initCloud();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=11-sync-cache-fix', {updateViaCache:'none'}).catch(()=>{}));}
