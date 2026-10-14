'use strict';
(() => {
 const button=document.getElementById('copy-agent-prompt');
 const prompt=document.getElementById('agent-prompt');
 const details=document.getElementById('agent-prompt-details');
 const status=document.getElementById('copy-agent-status');
 if(!button||!prompt||!details||!status)return;
 details.hidden=true;
 button.addEventListener('click',async()=>{
  button.disabled=true;button.textContent='Copying…';status.textContent='';status.classList.remove('copy-success');
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
   await navigator.clipboard.writeText(prompt.value);
   button.textContent='Copied';details.hidden=true;status.classList.add('copy-success');status.textContent='Paste it into your coding agent to get started.';
  }catch{
   button.textContent='Copy for your agent';details.hidden=false;details.open=true;prompt.focus();prompt.select();
   status.textContent='Automatic copy was unavailable. Copy the selected prompt below.';
  }finally{button.disabled=false;}
 });
})();
