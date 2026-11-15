// This page deliberately uses Auth directly, without loading student nutrition state.
export async function mountAdmin(doc, client) {
  const $ = id => doc.getElementById(id);
  const put = (id, value) => { $(id).textContent = String(value ?? ''); };
  const show = (id, visible) => { $(id).hidden = !visible; };
  const date = value => value ? new Date(value).toLocaleDateString(undefined, { year:'numeric',month:'short',day:'numeric' }) : '—';
  let epoch = 0, user = null, selected = null;
  let accountOffset = 0, inquiryOffset = 0, accountRequest = 0, inquiryRequest = 0;
  let pendingEmail = '', accountTotal = 0, inquiryTotal = 0;
  const clear = () => {
    epoch++; user = null; selected = null;
    for (const id of ['admin-metrics','admin-schools','admin-accounts','admin-inquiries','inquiry-fields','admin-identity','account-count','inquiry-count','admin-status','inquiry-save-status']) $(id).replaceChildren();
    $('inquiry-notes').value = ''; show('inquiry-detail', false); show('admin-workspace', false);
  };
  const denied = message => { clear(); show('admin-auth',false); show('admin-gate',true); show('admin-retry',true); put('gate-title','Admin access required'); put('gate-message',message); };
  async function rpc(name, args = {}, version = epoch) {
    const result = await client.rpc(name,args);
    if (version !== epoch) throw new Error('Session changed.');
    if (result.error) {
      if (result.error.code === '42501' || result.error.code === 'PGRST301') denied('This account does not have admin access. Sign out to use an approved account.');
      throw result.error;
    }
    return result.data;
  }
  const cell = (row, value) => { const td = doc.createElement('td'); td.textContent = String(value ?? '—'); row.append(td); return td; };
  const empty = (body, count, message) => { const row = doc.createElement('tr'); const td = cell(row,message); td.colSpan = count; body.append(row); };
  async function dashboard(version = epoch) {
    const data = await rpc('admin_dashboard',{},version);
    $('admin-metrics').replaceChildren();
    for (const [key,label] of Object.entries({total_accounts:'Total accounts',new_7_days:'Joined in 7 days',new_30_days:'Joined in 30 days',confirmed_accounts:'Verified emails',completed_setup:'Setup complete',pending_setup:'Setup pending',total_inquiries:'Total inquiries',new_inquiries:'New inquiries'})) {
      const card = doc.createElement('div'); card.className = 'metric';
      const number = doc.createElement('strong'); number.textContent = Number(data[key] || 0).toLocaleString();
      const caption = doc.createElement('span'); caption.textContent = label; card.append(number,caption); $('admin-metrics').append(card);
    }
    $('admin-schools').replaceChildren();
    for (const school of data.schools || []) { const tag=doc.createElement('span');tag.className='school-chip';tag.textContent=`${school.school} · ${school.accounts}`;$('admin-schools').append(tag); }
    if (!data.schools?.length) put('admin-schools','No schools selected yet.');
  }
  async function accounts(version = epoch) {
    const request = ++accountRequest;
    const data = await rpc('admin_account_directory',{p_search:$('account-search').value.trim(),p_offset:accountOffset,p_limit:25},version);
    if (request !== accountRequest) return;
    accountTotal=data.total; $('admin-accounts').replaceChildren();
    for (const account of data.items) {
      const row=doc.createElement('tr');cell(row,account.name);cell(row,account.email);cell(row,account.school || 'Not selected');cell(row,date(account.signed_up_at));cell(row,account.setup_complete?'Complete':'Pending');$('admin-accounts').append(row);
    }
    if (!data.items.length) empty($('admin-accounts'),5,'No accounts match this search.');
    put('account-count',`${accountTotal ? accountOffset+1 : 0}–${accountOffset+data.items.length} of ${accountTotal} accounts`);
    $('account-prev').disabled=accountOffset===0; $('account-next').disabled=accountOffset+25>=accountTotal;
  }
  function detail(item) {
    selected=item; $('inquiry-fields').replaceChildren();
    for (const [label,value] of Object.entries({'Contact':item.full_name,'Email':item.email,'University':item.university,'Role / department':item.role,'Ordering provider':item.provider,'Message':item.message,'Scope / timeline':item.scope || 'Not specified','Submitted':date(item.created_at),'Reference':item.id})) {
      const dt=doc.createElement('dt');dt.textContent=label;const dd=doc.createElement('dd');dd.textContent=value;$('inquiry-fields').append(dt,dd);
    }
    put('inquiry-detail-title',item.university);$('inquiry-edit-status').value=item.status;$('inquiry-notes').value=item.notes;put('inquiry-save-status','');show('inquiry-detail',true);
  }
  async function inquiries(version = epoch) {
    const request=++inquiryRequest;
    const data=await rpc('admin_inquiry_list',{p_search:$('inquiry-search').value.trim(),p_status:$('inquiry-status-filter').value,p_offset:inquiryOffset,p_limit:25},version);
    if(request!==inquiryRequest)return;
    inquiryTotal=data.total;$('admin-inquiries').replaceChildren();
    for(const item of data.items){const row=doc.createElement('tr');cell(row,item.university);cell(row,`${item.full_name} · ${item.email}`);cell(row,date(item.created_at));cell(row,item.status);const button=doc.createElement('button');button.type='button';button.className='secondary';button.textContent='View';button.setAttribute('aria-label',`View inquiry from ${item.university}`);button.onclick=()=>detail(item);cell(row,'').append(button);$('admin-inquiries').append(row);}
    if(!data.items.length)empty($('admin-inquiries'),5,'No inquiries match this search.');
    put('inquiry-count',`${inquiryTotal?inquiryOffset+1:0}–${inquiryOffset+data.items.length} of ${inquiryTotal} inquiries`);
    $('inquiry-prev').disabled=inquiryOffset===0;$('inquiry-next').disabled=inquiryOffset+25>=inquiryTotal;
  }
  const report=error=>{ if(user)put('admin-status',error.message || 'Unable to load data. Please retry.'); };
  async function refresh() {
    if(!user)return;
    const version=epoch;put('admin-status','Refreshing…');$('admin-refresh').disabled=true;
    try{await Promise.all([dashboard(version),accounts(version),inquiries(version)]);if(version===epoch)put('admin-status',`Updated ${new Date().toLocaleTimeString()}`);}catch(error){report(error);}finally{$('admin-refresh').disabled=false;}
  }
  async function check(session) {
    clear();const version=epoch;show('admin-signout',Boolean(session));show('admin-retry',false);
    if(!session){show('admin-auth',true);show('admin-gate',false);return;}
    show('admin-auth',false);show('admin-gate',true);put('gate-title','Checking your access…');
    try {
      const allowed=await rpc('admin_access',{},version);
      if(!allowed){denied('This account is signed in, but is not on the approved admin list. Sign out to switch accounts.');return;}
      user=session.user;accountOffset=0;inquiryOffset=0;put('admin-identity',`Signed in as ${user.email || 'approved admin'}`);show('admin-gate',false);show('admin-workspace',true);await refresh();
    }catch(error){if(version===epoch){denied('We could not verify your access. Retry or sign in again.');}}
  }
  $('admin-refresh').onclick=refresh;
  $('admin-retry').onclick=async()=>{const {data,error}=await client.auth.getSession();if(error)put('gate-message',error.message);else await check(data.session);};
  $('admin-signout').onclick=async()=>{clear();show('admin-gate',true);put('gate-title','Signing out…');const {error}=await client.auth.signOut();if(error){put('gate-title','Sign out could not finish');put('gate-message',error.message);show('admin-retry',true);}else await check(null);};
  $('account-search-form').onsubmit=e=>{e.preventDefault();accountOffset=0;accounts().catch(report);};
  $('inquiry-search-form').onsubmit=e=>{e.preventDefault();inquiryOffset=0;inquiries().catch(report);};
  for(const [id,kind,delta] of [['account-prev','account',-25],['account-next','account',25],['inquiry-prev','inquiry',-25],['inquiry-next','inquiry',25]])$(id).onclick=()=>{if(kind==='account'){accountOffset=Math.max(0,accountOffset+delta);accounts().catch(report);}else{inquiryOffset=Math.max(0,inquiryOffset+delta);inquiries().catch(report);}};
  $('inquiry-close').onclick=()=>{selected=null;show('inquiry-detail',false);$('inquiry-notes').value='';$('inquiry-fields').replaceChildren();};
  $('inquiry-update-form').onsubmit=async e=>{
    e.preventDefault();if(!selected || !user)return;const version=epoch;const id=selected.id;
    $('inquiry-save').disabled=true;put('inquiry-save-status','Saving…');
    try{const updated=await rpc('admin_update_inquiry',{p_id:id,p_status:$('inquiry-edit-status').value,p_notes:$('inquiry-notes').value,p_expected_updated_at:selected.updated_at},version);if(selected?.id===id){detail(updated);put('inquiry-save-status','Saved');}await Promise.all([dashboard(version),inquiries(version)]);}catch(error){if(version===epoch)put('inquiry-save-status',error.message || 'Unable to save. Please retry.');}finally{$('inquiry-save').disabled=false;}
  };
  const redirect=()=>new URL('admin.html',doc.location.href).href;
  $('admin-google').onclick=async()=>{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect()}});if(error)put('admin-auth-status',error.message);};
  $('admin-email-form').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;pendingEmail=$('admin-email').value.trim();try{const {error}=await client.auth.signInWithOtp({email:pendingEmail,options:{shouldCreateUser:false,emailRedirectTo:redirect()}});if(error)throw error;show('admin-code-form',true);put('admin-auth-status','Check your email for the sign-in link or code.');}catch(error){put('admin-auth-status',error.message || 'Could not send sign-in email.');}finally{button.disabled=false;}};
  $('admin-code-form').onsubmit=async e=>{e.preventDefault();const {error}=await client.auth.verifyOtp({email:pendingEmail,token:$('admin-code').value.trim(),type:'email'});if(error)put('admin-auth-status',error.message);};
  const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
    // Supabase auth callbacks must not await another auth/client request.
    if(event==='SIGNED_OUT'){clear();show('admin-auth',true);show('admin-gate',false);show('admin-signout',false);}
    else if(event!=='INITIAL_SESSION')queueMicrotask(()=>check(session));
  });
  try{const {data,error}=await client.auth.getSession();if(error)throw error;await check(data.session);}catch(error){denied(error.message || 'Sign-in is temporarily unavailable.');}
  return {dispose:()=>{clear();subscription.unsubscribe();},refresh};
}
if(typeof document!=='undefined' && document.getElementById('admin-workspace'))import('./auth-client.js').then(({authClient})=>mountAdmin(document,authClient)).catch(()=>{document.getElementById('gate-message').textContent='Unable to start sign-in. Please reload.';});
