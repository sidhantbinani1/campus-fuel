export function mountInquiry(form, client, uuid = () => crypto.randomUUID()) {
  const status = form.querySelector('#confirmation');
  const button = form.querySelector('button[type="submit"]');
  let pending = false, submissionId = uuid();
  button.disabled = false;
  form.onsubmit = async event => {
    event.preventDefault();
    if(pending || !form.reportValidity())return;
    pending=true;button.disabled=true;button.textContent='Sending…';status.textContent='';
    const value=name=>form.elements.namedItem(name).value.trim();
    try {
      const {data,error}=await client.rpc('submit_university_inquiry',{p_submission_id:submissionId,p_payload:{full_name:value('name'),email:value('email'),university:value('university'),role:value('role'),provider:value('provider'),message:value('goals'),scope:value('scope'),website:value('website')}});
      if(error)throw error;
      if(!data?.received)throw new Error('Submission was not confirmed.');
      status.textContent=`Your inquiry has been received. Reference: ${data.reference}. The University Plates team can now review it.`;
      form.reset();submissionId=uuid();
    } catch(error) {
      status.textContent= /required fields|Too many inquiries|Invalid inquiry/.test(error.message || '') ? error.message : 'We could not confirm your inquiry. Your entries are still here; please try again.';
    } finally { pending=false;button.disabled=false;button.textContent='Send inquiry'; }
  };
}
if(typeof document!=='undefined' && document.getElementById('inquiry'))import('./auth-client.js').then(({authClient})=>mountInquiry(document.getElementById('inquiry'),authClient)).catch(()=>{document.getElementById('confirmation').textContent='Unable to connect. Please reload before submitting.';});
