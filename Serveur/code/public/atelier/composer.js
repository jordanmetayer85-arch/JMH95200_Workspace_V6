if(window.top!==window)document.documentElement.classList.add('in-jmh');
(()=>{'use strict';const area=document.getElementById('prompt'),send=document.getElementById('send');if(!area||!send)return;
 function fit(){area.style.height='auto';area.style.height=Math.min(area.scrollHeight,200)+'px';send.classList.toggle('empty',!area.value.trim()&&!document.querySelector('#attachment-preview:not([hidden]) .attachment-card'));}
 for(const type of ['input','change','focus'])area.addEventListener(type,fit);document.getElementById('chat-form')?.addEventListener('submit',()=>setTimeout(fit,0));new MutationObserver(fit).observe(document.getElementById('attachment-preview')||document.body,{childList:true,attributes:true});setInterval(fit,1500);fit();
})();
